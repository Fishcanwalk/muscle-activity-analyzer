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

export interface EmgPacket {
	raw?: number | number[];
	rms?: number;
	peak?: number;
	mvcPercent?: number;
	timestamp?: number;
	board?: string;
}

export interface FullTelemetryPacket {
	board?: string;
	timestamp?: number;
	emg?: {
		raw?: number | number[];
		rms?: number;
		peak?: number;
		mvcPercent?: number;
	};
	fsr?: {
		force?: number;
		stability?: number;
	};
	mpu?: {
		pitch?: number;
		roll?: number;
		velocity?: number;
		ax?: number;
		ay?: number;
		az?: number;
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
// docs/sensor_usage.md specifies sEMG in µV (High-Tension >= 280µV, ~45-50% MVC)
// and FSR grip force in Newtons, so raw ADC counts are converted into those units here.
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
// in esp32_workout_firmware.ino) and batches ~25 of them per POST, so each array
// element is 10 ms apart regardless of network timing.
const EMG_SAMPLE_MS = 10;
// Moving-average window smoothing the SIG output into the envelope rep counting uses.
const EMG_ENVELOPE_WINDOW = 10; // samples = 100 ms

// Assumed full-scale grip force (Newtons) at max ADC reading; calibrate via fsrMax.
const FSR_MAX_N = 50;

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
// (the "zero grip" and "max grip" readings captured during calibration). They default
// to 0 and ADC_MAX so an uncalibrated system reproduces the old raw-ADC-over-full-range
// math. The Newtons full scale (FSR_MAX_N) stays a fixed constant, not user-calibrated.
function adcToForceN(rawAdc: number, zeroAdc = 0, maxAdc = ADC_MAX): number {
	const span = Math.max(1, maxAdc - zeroAdc);
	return (Math.max(0, rawAdc - zeroAdc) / span) * FSR_MAX_N;
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
	private envelopeWindow: number[] = [];
	private emgRepDetector = new EmgRepDetector();

	state = {
		emg: {
			raw: 0,
			rawBuffer: this.rawBuffer,
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
			gripForce: 0,
			gripStability: 95,
			isStable: true
		},
		mpu: {
			pitch: 0.0,
			roll: 0.0,
			velocity: 0.0,
			ax: 0.0,
			ay: 0.0,
			az: 0.0
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

	ingestEmg(data: EmgPacket) {
		const now = Date.now();
		this.recordPacket(data.board || 'unknown');
		this.ingestEmgSamples(data, data.timestamp || now);
		this.state.sensors.emg.lastSeen = now;

		this.broadcast('emg', this.state.emg);
		this.broadcast('telemetry', this.state);
		this.forwardToBackend();
	}

	// Shared by /api/emg and /api/telemetry: converts each raw sample, smooths it into
	// the envelope, runs the rep detector on every sample (not just the latest one) and
	// broadcasts an `emgRep` event per counted rep.
	private ingestEmgSamples(
		emg: { raw?: number | number[]; rms?: number; peak?: number; mvcPercent?: number },
		timestamp: number
	) {
		const { emgBaseline, emgMvc } = this.state.calibration;
		const raws = Array.isArray(emg.raw) ? emg.raw : emg.raw !== undefined ? [emg.raw] : [];

		let lastUv = this.state.emg.raw;
		let envelopeUv = this.state.emg.rms;
		let windowPeakPct = 0;
		for (const raw of raws) {
			lastUv = adcToEmgUv(raw, emgBaseline);
			this.rawBuffer.shift();
			this.rawBuffer.push(round3(lastUv));

			this.envelopeWindow.push(Math.max(0, lastUv));
			if (this.envelopeWindow.length > EMG_ENVELOPE_WINDOW) this.envelopeWindow.shift();
			envelopeUv = this.envelopeWindow.reduce((sum, v) => sum + v, 0) / this.envelopeWindow.length;

			const pct = (envelopeUv / (emgMvc || 1)) * 100;
			if (pct > windowPeakPct) windowPeakPct = pct;
			const rep = this.emgRepDetector.push(pct, envelopeUv, EMG_SAMPLE_MS);
			if (rep) this.broadcast('emgRep', rep satisfies EmgRepEvent);
		}

		const rms = emg.rms !== undefined ? round3(emg.rms) : round3(envelopeUv);
		const mvcPercent =
			emg.mvcPercent !== undefined
				? round3(emg.mvcPercent)
				: Math.min(100, round3((rms / (emgMvc || 1)) * 100));

		this.state.emg = {
			raw: round3(lastUv),
			rawBuffer: [...this.rawBuffer],
			rms,
			peak: emg.peak !== undefined ? round3(emg.peak) : Math.max(rms, this.state.emg.peak),
			mvcPercent,
			isHighTension: mvcPercent >= this.state.calibration.emgRepPeakPct,
			windowPeakPct: round3(windowPeakPct),
			timestamp
		};
		this.state.emgRep = {
			state: this.emgRepDetector.state,
			count: this.emgRepDetector.count
		};
	}

	ingestFullTelemetry(data: FullTelemetryPacket) {
		const now = Date.now();
		this.recordPacket(data.board || 'esp32');

		if (data.emg) {
			this.ingestEmgSamples(data.emg, data.timestamp || now);
			this.state.sensors.emg.lastSeen = now;
		}

		if (data.fsr) {
			const forceN =
				data.fsr.force !== undefined
					? round3(
							adcToForceN(
								data.fsr.force,
								this.state.calibration.fsrZero,
								this.state.calibration.fsrMax
							)
						)
					: this.state.fsr.gripForce;
			this.state.fsr = {
				rawAdc: data.fsr.force !== undefined ? round3(data.fsr.force) : this.state.fsr.rawAdc,
				gripForce: forceN,
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
				pitch: data.mpu.pitch !== undefined ? round3(data.mpu.pitch) : this.state.mpu.pitch,
				roll: data.mpu.roll !== undefined ? round3(data.mpu.roll) : this.state.mpu.roll,
				velocity:
					data.mpu.velocity !== undefined ? round3(data.mpu.velocity) : this.state.mpu.velocity,
				ax: data.mpu.ax !== undefined ? round3(data.mpu.ax) : this.state.mpu.ax,
				ay: data.mpu.ay !== undefined ? round3(data.mpu.ay) : this.state.mpu.ay,
				az: data.mpu.az !== undefined ? round3(data.mpu.az) : this.state.mpu.az
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

		this.broadcast('telemetry', this.state);
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
