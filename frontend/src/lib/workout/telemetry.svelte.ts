import { workout } from './workout.svelte';
import { round3, formatDec } from '$lib/utils/format';
import { EMG_BUFFER_SIZE } from '$lib/telemetry-constants';

export { round3, formatDec };

// Which velocity samples belong to a rep (see onEmgRep). The emgRep event reaches the
// browser up to one ESP32 batch (250 ms) plus network time after the rep ended, so a
// rep's window opens this much earlier than its EMG duration alone would say.
const REP_WINDOW_LEAD_MS = 750;
// How much velocity history is kept; comfortably longer than any single rep.
const VELOCITY_HISTORY_MS = 15_000;
// A heart rate only counts as the set's peak once it has held this long.
const PEAK_HR_HOLD_MS = 3_000;

class TelemetryManager {
	emg = $state({
		rawBuffer: Array(EMG_BUFFER_SIZE).fill(0),
		level: 0,
		rms: 0,
		mvcPercent: 0,
		isHighTension: false
	});

	// Server-side EMG rep detector state (telemetryStore.ts state.emgRep), plus a local
	// counter of detector reps the calibration page uses to try thresholds out.
	emgRep = $state({ state: 'REST' as 'REST' | 'CONTRACT', count: 0 });
	emgRepTestCount = $state(0);

	mpu = $state({
		/** Live vertical velocity (m/s). */
		concentricVelocity: 0.0,
		/** Peak concentric velocity of the latest rep, and of the set's first rep. */
		lastRepVelocity: 0.0,
		rep1Velocity: 0.0,
		/** How much slower the latest rep was than the first one. */
		velocityLossPercent: 0,
		isEffectiveZone: false
	});

	fsr = $state({
		rawAdc: 0,
		/** % of this session's calibrated max squeeze. */
		gripPercent: 0,
		gripStabilityPercent: 0,
		isStable: false
	});

	vitals = $state({
		heartRate: 0,
		spO2: 0,
		skinTemp: 0.0,
		deltaTemp: 0.0,
		peakHr: 0
	});


	sensors = $state({
		emg: { lastSeen: 0 },
		fsr: { lastSeen: 0 },
		mpu: { lastSeen: 0 },
		vitals: { lastSeen: 0 }
	});

	private now = $state(Date.now());
	private readonly SENSOR_STALE_MS = 2500;

	sensorStatus = $derived.by(() => {
		const statusOf = (lastSeen: number): 'live' | 'stale' | 'never' => {
			if (!lastSeen) return 'never';
			return this.now - lastSeen > this.SENSOR_STALE_MS ? 'stale' : 'live';
		};
		return {
			emg: statusOf(this.sensors.emg.lastSeen),
			fsr: statusOf(this.sensors.fsr.lastSeen),
			mpu: statusOf(this.sensors.mpu.lastSeen),
			vitals: statusOf(this.sensors.vitals.lastSeen)
		};
	});

	device = $state({ board: '', packetCount: 0 });

	// The calibration the SvelteKit server is currently applying to incoming samples
	// (telemetryStore.ts's state.calibration, included in every SSE packet).
	serverCalibration = $state({
		emgBaseline: 0,
		emgMvc: 550,
		fsrZero: 0,
		fsrMax: 4095,
		emgRepOnPct: 35,
		emgRepOffPct: 20,
		emgRepPeakPct: 45
	});

	isWebcamActive = $state(false);
	connectionState = $state<'connecting' | 'connected' | 'reconnecting' | 'error'>('connecting');
	isWsConnected = $derived(this.connectionState === 'connected');
	streamHz = $state(0);

	private eventSource: EventSource | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private reconnectDelayMs = 1000;
	private readonly RECONNECT_MAX_DELAY_MS = 30000;

	// The board's per-batch peak velocity (timestamped with performance.now()), for each
	// rep's peak over its own window.
	private velocitySamples: { at: number; v: number }[] = [];
	// When the previous rep was counted: a rep's window never reaches back past it.
	private lastRepAt = 0;
	private wasSetRunning = false;

	constructor() {
		if (typeof window !== 'undefined') {
			this.connectApiStream();
			setInterval(() => {
				this.now = Date.now();
			}, 1000);
		}
	}

	connectApiStream() {
		if (typeof window === 'undefined') return;
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		try {
			if (this.eventSource) this.eventSource.close();
			this.eventSource = new EventSource('/api/telemetry/stream');
			this.eventSource.addEventListener('open', () => {
				this.reconnectDelayMs = 1000;
			});
			this.eventSource.addEventListener('telemetry', (e) => {
				try {
					const data = JSON.parse(e.data);
					if (data.device?.connected) {
						this.connectionState = 'connected';
						this.reconnectDelayMs = 1000;
						this.streamHz = data.device.rateHz || 50;
						this.device.board = data.device.board ?? '';
						this.device.packetCount = data.device.packetCount ?? 0;
						if (data.calibration) this.serverCalibration = data.calibration;

						if (data.sensors) {
							if (data.sensors.emg?.lastSeen) this.sensors.emg.lastSeen = data.sensors.emg.lastSeen;
							if (data.sensors.fsr?.lastSeen) this.sensors.fsr.lastSeen = data.sensors.fsr.lastSeen;
							if (data.sensors.mpu?.lastSeen) this.sensors.mpu.lastSeen = data.sensors.mpu.lastSeen;
							if (data.sensors.vitals?.lastSeen)
								this.sensors.vitals.lastSeen = data.sensors.vitals.lastSeen;
						}

						// A new set starts with an empty camera window, so nothing seen while resting counts.
						if (workout.isSetRunning && !this.wasSetRunning) this.resetRepWindow();
						this.wasSetRunning = workout.isSetRunning;

						if (data.emg) {
							if (Array.isArray(data.emg.rawBuffer) && data.emg.rawBuffer.length > 0) {
								this.emg.rawBuffer = data.emg.rawBuffer.map((r: number) => round3(r));
							}
							if (data.emg.level !== undefined) this.emg.level = round3(data.emg.level);
							if (data.emg.rms !== undefined) this.emg.rms = round3(data.emg.rms);
							if (data.emg.mvcPercent !== undefined)
								this.emg.mvcPercent = round3(data.emg.mvcPercent);
							this.emg.isHighTension = data.emg.isHighTension;
						}

						if (data.emgRep) {
							this.emgRep = { state: data.emgRep.state, count: data.emgRep.count };
							if (workout.isSetRunning) {
								workout.fsmState = data.emgRep.state === 'CONTRACT' ? 'PEAK' : 'START';
							}
						}

						if (data.fsr) {
							if (data.fsr.rawAdc !== undefined) this.fsr.rawAdc = data.fsr.rawAdc;
							if (data.fsr.gripPercent !== undefined) this.fsr.gripPercent = round3(data.fsr.gripPercent);
							if (data.fsr.gripStability !== undefined)
								this.fsr.gripStabilityPercent = round3(data.fsr.gripStability);
							this.fsr.isStable = data.fsr.isStable;
						}

						if (data.mpu) {
							if (data.mpu.velocity !== undefined) {
								this.mpu.concentricVelocity = round3(data.mpu.velocity);
							}
							if (workout.isSetRunning && data.mpu.peakVelocity !== undefined) {
								const now = performance.now();
								this.velocitySamples.push({ at: now, v: data.mpu.peakVelocity });
								this.velocitySamples = this.velocitySamples.filter((e) => e.at >= now - VELOCITY_HISTORY_MS);
							}
						}

						if (data.vitals) {
							if (data.vitals.hr !== undefined) {
								this.vitals.heartRate = round3(data.vitals.hr);
								this.trackPeakHr(this.vitals.heartRate);
							}
							if (data.vitals.spo2 !== undefined) this.vitals.spO2 = round3(data.vitals.spo2);
							if (data.vitals.skinTemp !== undefined) {
								this.vitals.skinTemp = round3(data.vitals.skinTemp);
								this.vitals.deltaTemp = round3(
									data.vitals.deltaTemp ?? Math.max(0, data.vitals.skinTemp - 33.5)
								);
							}
						}
					}
				} catch (parseErr) {}
			});
			this.eventSource.addEventListener('button', (e) => {
				try {
					const data = JSON.parse(e.data);
					if (data.id === 'a' || data.id === 'b') workout.handleRemoteButton(data.id);
				} catch {
					// Malformed button event -- ignore.
				}
			});
			this.eventSource.addEventListener('emgRep', (e) => {
				try {
					this.onEmgRep(JSON.parse(e.data));
				} catch {
					// Malformed rep event -- ignore.
				}
			});
			this.eventSource.onerror = () => {
				this.connectionState = this.connectionState === 'connected' ? 'reconnecting' : 'error';
				this.streamHz = 0;
				this.eventSource?.close();
				this.scheduleReconnect();
			};
		} catch (err) {
			console.warn('[Telemetry] SSE stream connect error', err);
			this.connectionState = this.connectionState === 'connected' ? 'reconnecting' : 'error';
			this.scheduleReconnect();
		}
	}

	private scheduleReconnect() {
		if (this.reconnectTimer) return;
		const delay = this.reconnectDelayMs;
		this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, this.RECONNECT_MAX_DELAY_MS);
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.connectApiStream();
		}, delay);
	}

	// A rep from the server-side EMG detector, the only thing that counts or judges reps:
	// a rep whose peak never reached the "real effort" threshold counts as a cheat. The
	// camera is a plain preview for the lifter and feeds nothing in here.
	private onEmgRep(rep: { peakPct: number; peakUv: number; durationMs: number; isStrong: boolean }) {
		this.emgRepTestCount += 1;
		if (!workout.isSetRunning) return;

		const now = performance.now();
		const from = Math.max(this.lastRepAt, now - rep.durationMs - REP_WINDOW_LEAD_MS);
		const cheatReason = rep.isStrong ? null : 'Low Activation (EMG)';

		// Velocity-based training: this rep's peak lifting speed against the set's first rep.
		const peakVelocity = Math.max(
			0,
			...this.velocitySamples.filter((e) => e.at >= from).map((e) => e.v)
		);
		if (this.mpu.rep1Velocity === 0 && peakVelocity > 0.05) this.mpu.rep1Velocity = round3(peakVelocity);
		this.mpu.lastRepVelocity = round3(peakVelocity);
		this.mpu.velocityLossPercent =
			this.mpu.rep1Velocity > 0
				? Math.max(0, Math.round((1 - peakVelocity / this.mpu.rep1Velocity) * 100))
				: 0;
		this.mpu.isEffectiveZone =
			this.mpu.velocityLossPercent >= 25 && this.mpu.velocityLossPercent <= 45;

		workout.recordRep({
			isClean: cheatReason === null,
			concentricVelocity: peakVelocity,
			rom: 0, // no longer measured (the camera is preview-only); the backend still requires it
			cheatReason,
			peakEmg: rep.peakUv,
			velocityLossPercent: this.mpu.velocityLossPercent
		});
		this.lastRepAt = now;
	}

	// "Peak while lifting": only readings during a running set count, and the peak is the
	// lowest reading over the last PEAK_HR_HOLD_MS -- one motion-artifact spike from the
	// MAX30102 (a finger shifting mid-rep) would otherwise stick as the peak.
	private recentHr: { at: number; hr: number }[] = [];

	private trackPeakHr(hr: number) {
		if (!workout.isSetRunning || hr <= 0) {
			this.recentHr = [];
			return;
		}
		const now = performance.now();
		this.recentHr.push({ at: now, hr });
		this.recentHr = this.recentHr.filter((e) => e.at >= now - PEAK_HR_HOLD_MS);
		if (now - this.recentHr[0].at < PEAK_HR_HOLD_MS - 500) return;
		const sustained = Math.min(...this.recentHr.map((e) => e.hr));
		if (sustained > this.vitals.peakHr) this.vitals.peakHr = sustained;
	}

	private resetRepWindow() {
		// Each set gets its own peak HR, so recovery compares against this set's effort.
		this.vitals.peakHr = 0;
		this.recentHr = [];
		this.velocitySamples = [];
		this.lastRepAt = performance.now();
		// Velocity loss is measured within one set, from its first rep.
		this.mpu.rep1Velocity = 0;
		this.mpu.lastRepVelocity = 0;
		this.mpu.velocityLossPercent = 0;
		this.mpu.isEffectiveZone = false;
	}

	resetEmgRepTestCount() {
		this.emgRepTestCount = 0;
	}

	setWebcamActive(active: boolean) {
		this.isWebcamActive = active;
	}
}

export const telemetry = new TelemetryManager();
