import { EventEmitter } from 'node:events';
import { env } from '$env/dynamic/private';
import { logger } from '$lib/logger';
import { EMG_BUFFER_SIZE } from '$lib/telemetry-constants';
import {
	DEFAULT_EMG_REP_CONFIG,
	EmgRepDetector,
	type EmgRepEvent,
	type EmgRepState
} from './emgRepDetector';

// POST /api/telemetry: every sensor except EMG, which streams over the /ws/emg
// WebSocket instead (emg-ws.js -> ingestEmg below).
export interface FullTelemetryPacket {
	board?: string;
	timestamp?: number;
	fsr?: {
		force?: number;
		stability?: number;
	};
	// Only lifting velocity: the board is strapped on at a different angle every time, so
	// its angles/raw axes mean nothing across sessions (older firmware still sends them).
	mpu?: {
		velocity?: number;
		/** Highest velocity within this batch (the firmware samples at 100 Hz, posts at 4 Hz). */
		peakVelocity?: number;
	};
	vitals?: {
		hr?: number;
		spo2?: number;
		skinTemp?: number;
		deltaTemp?: number;
	};
	// Discrete "was pressed since last send" flags from the ESP32 buttons (GPIO32/33),
	// not held-down levels -- see esp32_workout_firmware.cpp.
	buttons?: {
		a?: boolean;
		b?: boolean;
	};
}

function round3(n: number | undefined | null): number {
	if (n === undefined || n === null || isNaN(n)) return 0;
	return Math.round(n * 1000) / 1000;
}

// ESP32 ADC is 12-bit (analogRead() -> 0-4095) on a nominal 3.3V reference.
// docs/sensor_usage.md specifies sEMG in µV (High-Tension >= 280µV, ~45-50% MVC), so
// raw ADC counts are converted into that unit here. FSR grip is reported as % of the
// session's calibrated max squeeze: a bare FSR can't give Newtons without a known-weight
// reference, and the old fixed 50 N full scale capped every grip at ~5 kg.
const ADC_MAX = 4095;
const ADC_VREF_MV = 3300;

// The sEMG module is wired from its SIG (envelope) output, not RAW: the module has
// already rectified and smoothed the biopotential, so the signal sits near 0 at rest
// and rises with contraction (see output-emg.md -- it never goes below the resting
// baseline). EMG_GAIN is the assumed front-end gain used to express it on a µV-like
// scale; everything user-facing (and rep counting) uses % of calibrated MVC instead,
// so the exact gain doesn't matter as long as calibration uses the same scale.
const EMG_GAIN = 1000;

// The ESP32 samples the Uno's latest EMG value at a fixed 100 Hz (SAMPLE_INTERVAL_MS
// in esp32_workout_firmware.ino) and sends a few of them per WebSocket frame, so each
// sample is 10 ms apart regardless of network timing.
const EMG_SAMPLE_MS = 10;
// Moving-average window smoothing the SIG output into the envelope rep counting uses.
const EMG_ENVELOPE_WINDOW = 10; // samples = 100 ms

// Single shared hardware rig, one active recording at a time (see plan's Accepted
// Tradeoffs). Not a per-user map -- starting a recording for a different user while
// one is active is rejected rather than queued.
export interface RecordingSlot {
	userId: string;
	sessionId: string;
	startedAt: number;
}

export type StartRecordingResult = { ok: true } | { ok: false; reason: 'conflict' };

// Crash/close safety net: a hard duration cap checked inline on every ingest, rather
// than tying recording-stop to SSE stream disconnect (which also fires on page
// refresh, and would wrongly kill recording on every reload).
const MAX_RECORDING_DURATION_MS = 10 * 60 * 1000;

// `baseline` is the calibrated resting level on the same scale
// (state.calibration.emgBaseline); 0 when uncalibrated.
function adcToEmgUv(rawAdc: number, baseline = 0): number {
	const mv = (rawAdc / ADC_MAX) * ADC_VREF_MV;
	return (mv * 1000) / EMG_GAIN - baseline;
}

// `zeroAdc`/`maxAdc` come from state.calibration.fsrZero/fsrMax — both raw ADC counts
// (the "no grip" and "max squeeze" readings captured during calibration). They default
// to 0 and ADC_MAX, i.e. % of the full ADC range until calibrated. Can exceed 100% when
// squeezing harder than during calibration.
function adcToGripPercent(rawAdc: number, zeroAdc = 0, maxAdc = ADC_MAX): number {
	const span = Math.max(1, maxAdc - zeroAdc);
	return (Math.max(0, rawAdc - zeroAdc) / span) * 100;
}

class ServerTelemetryState {
	private emitter = new EventEmitter();
	private rawBuffer: number[] = Array(EMG_BUFFER_SIZE).fill(0);
	private packetCount = 0;
	private lastPacketTime = Date.now();
	private packetsPerSec = 0;
	private secondCounter = 0;
	private lastRateCalc = Date.now();
	private recording: RecordingSlot | null = null;
	private buzzerTestPending = false;
	private envelopeWindow: number[] = [];
	private emgRepDetector = new EmgRepDetector();

	state = {
		emg: {
			raw: 0,
			rawBuffer: this.rawBuffer,
			/** Latest batch's mean with no baseline subtracted, for capturing the resting baseline. */
			level: 0,
			rms: 0,
			peak: 0,
			mvcPercent: 0,
			isHighTension: false,
			/** Highest envelope %MVC within the latest batch, so peaks between SSE packets aren't lost. */
			windowPeakPct: 0,
			timestamp: Date.now()
		},
		emgRep: {
			state: 'REST' as EmgRepState,
			count: 0
		},
		fsr: {
			// Uncalibrated ADC count, kept so the calibration page can capture
			// fsrZero/fsrMax (which are raw ADC counts) from live readings.
			rawAdc: 0,
			gripPercent: 0,
			gripStability: 95,
			isStable: true
		},
		mpu: {
			velocity: 0.0,
			peakVelocity: 0.0
		},
		vitals: {
			hr: 72,
			spo2: 99,
			skinTemp: 33.5,
			deltaTemp: 0.0
		},
		device: {
			board: 'offline',
			connected: false,
			lastSeen: 0,
			packetCount: 0,
			rateHz: 0
		},
		sensors: {
			emg: { lastSeen: 0 },
			fsr: { lastSeen: 0 },
			mpu: { lastSeen: 0 },
			vitals: { lastSeen: 0 }
		},
		calibration: {
			emgBaseline: 0,
			emgMvc: 550.0,
			fsrZero: 0.0,
			fsrMax: ADC_MAX,
			emgRepOnPct: this.emgRepDetector.currentConfig.onPct,
			emgRepOffPct: this.emgRepDetector.currentConfig.offPct,
			emgRepPeakPct: this.emgRepDetector.currentConfig.peakPct
		}
	};

	constructor() {
		this.emitter.setMaxListeners(100);
	}

	/**
	 * One WebSocket frame of raw EMG ADC samples from the board. Browsers get only the
	 * new samples (they keep their own rolling buffer) plus the current envelope values.
	 * Backend persistence rides on the next telemetry POST, which forwards state.emg.
	 */
	ingestEmg(raws: number[]) {
		const now = Date.now();
		const samples = this.ingestEmgSamples(raws, now);
		this.state.sensors.emg.lastSeen = now;
		const { level, rms, mvcPercent, isHighTension } = this.state.emg;
		this.broadcast('emgStream', {
			samples,
			level,
			rms,
			mvcPercent,
			isHighTension,
			emgRep: this.state.emgRep,
			lastSeen: now
		});
	}

	/** What a browser gets when it opens /ws/emg. */
	emgSnapshot() {
		return {
			emg: this.state.emg,
			emgRep: this.state.emgRep,
			lastSeen: this.state.sensors.emg.lastSeen
		};
	}

	/** The SSE payload: everything but EMG, which browsers get from /ws/emg. */
	sseSnapshot() {
		const { emg: _emg, emgRep: _emgRep, ...rest } = this.state;
		return rest;
	}

	// Converts each raw sample, smooths it into the envelope, runs the rep detector on
	// every sample (not just the latest one) and broadcasts an `emgRep` event per counted
	// rep. Returns the baseline-adjusted samples appended to the rolling buffer.
	private ingestEmgSamples(raws: number[], timestamp: number): number[] {
		const { emgBaseline, emgMvc } = this.state.calibration;
		const fresh: number[] = [];

		let lastUv = this.state.emg.raw;
		let envelopeUv = this.state.emg.rms;
		let windowPeakPct = 0;
		let levelSum = 0;
		for (const raw of raws) {
			const unadjustedUv = adcToEmgUv(raw);
			levelSum += unadjustedUv;
			lastUv = unadjustedUv - emgBaseline;
			this.rawBuffer.shift();
			this.rawBuffer.push(round3(lastUv));
			fresh.push(round3(lastUv));

			this.envelopeWindow.push(Math.max(0, lastUv));
			if (this.envelopeWindow.length > EMG_ENVELOPE_WINDOW) this.envelopeWindow.shift();
			envelopeUv = this.envelopeWindow.reduce((sum, v) => sum + v, 0) / this.envelopeWindow.length;

			const pct = (envelopeUv / (emgMvc || 1)) * 100;
			if (pct > windowPeakPct) windowPeakPct = pct;
			const rep = this.emgRepDetector.push(pct, envelopeUv, EMG_SAMPLE_MS);
			if (rep) this.broadcast('emgRep', rep satisfies EmgRepEvent);
		}

		const rms = round3(envelopeUv);
		const mvcPercent = Math.min(100, round3((rms / (emgMvc || 1)) * 100));

		this.state.emg = {
			raw: round3(lastUv),
			rawBuffer: [...this.rawBuffer],
			level: raws.length ? round3(levelSum / raws.length) : this.state.emg.level,
			rms,
			peak: Math.max(rms, this.state.emg.peak),
			mvcPercent,
			isHighTension: mvcPercent >= this.state.calibration.emgRepPeakPct,
			windowPeakPct: round3(windowPeakPct),
			timestamp
		};
		this.state.emgRep = {
			state: this.emgRepDetector.state,
			count: this.emgRepDetector.count
		};
		return fresh;
	}

	ingestFullTelemetry(data: FullTelemetryPacket) {
		const now = Date.now();
		this.recordPacket(data.board || 'esp32');

		if (data.fsr) {
			const gripPercent =
				data.fsr.force !== undefined
					? round3(
							adcToGripPercent(
								data.fsr.force,
								this.state.calibration.fsrZero,
								this.state.calibration.fsrMax
							)
						)
					: this.state.fsr.gripPercent;
			this.state.fsr = {
				rawAdc: data.fsr.force !== undefined ? round3(data.fsr.force) : this.state.fsr.rawAdc,
				gripPercent,
				gripStability:
					data.fsr.stability !== undefined
						? round3(data.fsr.stability)
						: this.state.fsr.gripStability,
				isStable: (data.fsr.stability ?? 95) > 75
			};
			this.state.sensors.fsr.lastSeen = now;
		}

		if (data.mpu) {
			this.state.mpu = {
				velocity:
					data.mpu.velocity !== undefined ? round3(data.mpu.velocity) : this.state.mpu.velocity,
				// Older firmware sends no peak; its latest velocity is the best there is.
				peakVelocity: round3(data.mpu.peakVelocity ?? data.mpu.velocity ?? this.state.mpu.velocity)
			};
			this.state.sensors.mpu.lastSeen = now;
		}

		if (data.vitals) {
			this.state.vitals = {
				hr: data.vitals.hr !== undefined ? round3(data.vitals.hr) : this.state.vitals.hr,
				spo2: data.vitals.spo2 !== undefined ? round3(data.vitals.spo2) : this.state.vitals.spo2,
				skinTemp:
					data.vitals.skinTemp !== undefined
						? round3(data.vitals.skinTemp)
						: this.state.vitals.skinTemp,
				deltaTemp:
					data.vitals.deltaTemp !== undefined
						? round3(data.vitals.deltaTemp)
						: this.state.vitals.deltaTemp
			};
			this.state.sensors.vitals.lastSeen = now;
		}

		if (data.buttons?.a) this.broadcast('button', { id: 'a' });
		if (data.buttons?.b) this.broadcast('button', { id: 'b' });

		this.broadcast('telemetry', this.sseSnapshot());
		this.forwardToBackend();
	}

	// NOTE: calibration is redone at the start of every workout session and never loaded
	// back from the backend. This in-memory copy is what the always-on ADC->µV/N
	// conversion above (ingestEmg/ingestFullTelemetry), the rep detector and the SSE
	// `state` snapshot use; src/routes/api/calibration/+server.ts sets it after each
	// capture (POST) and puts it back to defaults when a new session starts (DELETE).
	setCalibration(cal: {
		emgBaseline?: number;
		emgMvc?: number;
		fsrZero?: number;
		fsrMax?: number;
		emgRepOnPct?: number;
		emgRepOffPct?: number;
		emgRepPeakPct?: number;
	}) {
		const c = this.state.calibration;
		if (cal.emgBaseline !== undefined) c.emgBaseline = cal.emgBaseline;
		if (cal.emgMvc !== undefined) c.emgMvc = cal.emgMvc;
		if (cal.fsrZero !== undefined) c.fsrZero = cal.fsrZero;
		if (cal.fsrMax !== undefined) c.fsrMax = cal.fsrMax;
		if (cal.emgRepOnPct !== undefined) c.emgRepOnPct = cal.emgRepOnPct;
		if (cal.emgRepOffPct !== undefined) c.emgRepOffPct = cal.emgRepOffPct;
		if (cal.emgRepPeakPct !== undefined) c.emgRepPeakPct = cal.emgRepPeakPct;
		this.emgRepDetector.setConfig({
			onPct: c.emgRepOnPct,
			offPct: c.emgRepOffPct,
			peakPct: c.emgRepPeakPct
		});
		this.broadcast('calibration', this.state.calibration);
	}

	// The web can't reach the board directly; the board picks this up from the reply to
	// its next telemetry POST (see takeBoardCommands) and beeps a few times.
	requestBuzzerTest() {
		this.buzzerTestPending = true;
	}

	/** What the reply to the board's telemetry POST carries back to it. */
	takeBoardCommands() {
		const beep = this.buzzerTestPending;
		this.buzzerTestPending = false;
		// The firmware turns raw FSR counts into % of this session's max squeeze itself, so
		// its grip-loss buzzer reacts at 100 Hz instead of waiting on the network. Until the
		// FSR is calibrated (still the 0..ADC_MAX default) it gets an empty range, which the
		// firmware reads as "no grip alerts yet".
		const { fsrZero, fsrMax } = this.state.calibration;
		const calibrated = !(fsrZero === 0 && fsrMax === ADC_MAX);
		return { fsrZero: calibrated ? fsrZero : 0, fsrMax: calibrated ? fsrMax : 0, beep };
	}

	resetCalibration() {
		this.setCalibration({
			emgBaseline: 0,
			emgMvc: 550.0,
			fsrZero: 0.0,
			fsrMax: ADC_MAX,
			emgRepOnPct: DEFAULT_EMG_REP_CONFIG.onPct,
			emgRepOffPct: DEFAULT_EMG_REP_CONFIG.offPct,
			emgRepPeakPct: DEFAULT_EMG_REP_CONFIG.peakPct
		});
	}

	// Idempotent restart: re-issuing `start` for the same user just refreshes startedAt.
	// Rejects (409 at the route level) only when a *different* user's recording is active.
	startRecording(userId: string, sessionId: string): StartRecordingResult {
		this.expireStaleRecording();
		if (this.recording && this.recording.userId !== userId) {
			return { ok: false, reason: 'conflict' };
		}
		this.recording = { userId, sessionId, startedAt: Date.now() };
		// Each set's EMG rep count starts from zero.
		this.emgRepDetector.reset();
		return { ok: true };
	}

	// No-op if the slot is already clear or owned by someone else.
	stopRecording(userId: string): void {
		if (this.recording && this.recording.userId === userId) {
			this.recording = null;
		}
	}

	private expireStaleRecording() {
		if (this.recording && Date.now() - this.recording.startedAt > MAX_RECORDING_DURATION_MS) {
			logger.warn(
				{ recording: this.recording },
				'[Telemetry] Recording exceeded MAX_RECORDING_DURATION_MS, auto-clearing'
			);
			this.recording = null;
		}
	}

	// Checked inline on every ingest before deciding whether to forward to the backend.
	private activeRecording(): RecordingSlot | null {
		this.expireStaleRecording();
		return this.recording;
	}

	private recordPacket(board: string) {
		this.packetCount++;
		this.secondCounter++;
		this.lastPacketTime = Date.now();

		const now = Date.now();
		if (now - this.lastRateCalc >= 1000) {
			this.packetsPerSec = Math.round((this.secondCounter * 1000) / (now - this.lastRateCalc));
			this.secondCounter = 0;
			this.lastRateCalc = now;
		}

		this.state.device = {
			board,
			connected: true,
			lastSeen: now,
			packetCount: this.packetCount,
			rateHz: this.packetsPerSec
		};
	}

	subscribe(event: string, listener: (data: any) => void) {
		this.emitter.on(event, listener);
		return () => {
			this.emitter.off(event, listener);
		};
	}

	private broadcast(event: string, payload: any) {
		this.emitter.emit(event, payload);
	}

	// Gated on "recording is currently active" -- this is the only place DB persistence
	// is cut off. `broadcast()` and the `state` mutation above always run regardless, so
	// the live SSE view to the browser stays always-on independent of recording state.
	private forwardToBackend() {
		const recording = this.activeRecording();
		if (!recording) return;

		const backendUrl = env.BACKEND_API_URL;
		const serviceToken = env.TELEMETRY_SERVICE_TOKEN;
		if (!backendUrl || !serviceToken) return;

		fetch(`${backendUrl.replace(/\/$/, '')}/v1/telemetry`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Service-Token': serviceToken
			},
			body: JSON.stringify({
				emg: this.state.emg,
				fsr: this.state.fsr,
				mpu: this.state.mpu,
				vitals: this.state.vitals,
				device: this.state.device,
				timestamp: Date.now(),
				user_id: recording.userId,
				session_id: recording.sessionId
			})
		}).catch((err) => {
			logger.warn({ err }, '[Telemetry] Failed to forward packet to backend');
		});
	}
}

export const serverTelemetry = new ServerTelemetryState();

// emg-ws.js runs on the raw Node http server, outside SvelteKit's module graph, so it
// reaches this store through a global instead of an import (see its header comment).
export interface EmgStreamBridge {
	ingestEmg(raws: number[]): void;
	snapshot(): ReturnType<ServerTelemetryState['emgSnapshot']>;
	subscribe(event: 'emgStream' | 'emgRep', listener: (data: unknown) => void): () => void;
}

declare global {
	var __cyberpumpEmg: EmgStreamBridge | undefined;
}

globalThis.__cyberpumpEmg = {
	ingestEmg: (raws) => serverTelemetry.ingestEmg(raws),
	snapshot: () => serverTelemetry.emgSnapshot(),
	subscribe: (event, listener) => serverTelemetry.subscribe(event, listener)
};
