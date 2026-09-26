import { workout } from './workout.svelte';
import { round3, formatDec } from '$lib/utils/format';
import { EMG_BUFFER_SIZE } from '$lib/telemetry-constants';

export { round3, formatDec };

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
		concentricVelocity: 0.0,
		rep1Velocity: 0.0,
		velocityLossPercent: 0,
		isEffectiveZone: false,
		pitch: 0.0,
		roll: 0.0,
		ax: 0.0,
		ay: 0.0,
		az: 0.0
	});

	fsr = $state({
		rawAdc: 0,
		gripForce: 0,
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

	cv = $state({
		elbowAngle: 180,
		torsoAngle: 0.0,
		shoulderHikeCm: 0.0,
		isTorsoCheating: false,
		isShoulderCheating: false,
		trackedArm: 'right' as 'right' | 'left',
		fps: 0
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

	// Real camera FSM tracker
	private hadPeakInCurrentRep = false;
	private currentRepCheat: string | null = null;
	private minElbowAngle = 180;
	private maxElbowAngle = 0;
	// Highest sEMG envelope seen since the last counted rep, whatever counted it.
	private repEmgPeakPct = 0;
	private repEmgPeakUv = 0;
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

						// A new set starts with clean per-rep trackers (no peak carried over from rest).
						if (workout.isSetRunning && !this.wasSetRunning) this.resetRepTracking(this.cv.elbowAngle);
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
							if (data.emg.windowPeakPct > this.repEmgPeakPct) this.repEmgPeakPct = data.emg.windowPeakPct;
							if (data.emg.rms > this.repEmgPeakUv) this.repEmgPeakUv = data.emg.rms;
						}

						if (data.emgRep) {
							this.emgRep = { state: data.emgRep.state, count: data.emgRep.count };
							if (workout.isSetRunning && workout.repSource === 'emg') {
								workout.fsmState = data.emgRep.state === 'CONTRACT' ? 'PEAK' : 'START';
							}
						}

						if (data.fsr) {
							if (data.fsr.rawAdc !== undefined) this.fsr.rawAdc = data.fsr.rawAdc;
							if (data.fsr.gripForce !== undefined) this.fsr.gripForce = round3(data.fsr.gripForce);
							if (data.fsr.gripStability !== undefined)
								this.fsr.gripStabilityPercent = round3(data.fsr.gripStability);
							this.fsr.isStable = data.fsr.isStable;
						}

						if (data.mpu) {
							if (data.mpu.velocity !== undefined) {
								this.mpu.concentricVelocity = round3(data.mpu.velocity);
								if (this.mpu.rep1Velocity === 0 && data.mpu.velocity > 0.1) {
									this.mpu.rep1Velocity = this.mpu.concentricVelocity;
								}
								if (this.mpu.rep1Velocity > 0) {
									this.mpu.velocityLossPercent = Math.max(
										0,
										Math.round((1 - this.mpu.concentricVelocity / this.mpu.rep1Velocity) * 100)
									);
								}
								this.mpu.isEffectiveZone =
									this.mpu.velocityLossPercent >= 25 && this.mpu.velocityLossPercent <= 45;
							}
							if (data.mpu.pitch !== undefined) this.mpu.pitch = round3(data.mpu.pitch);
							if (data.mpu.roll !== undefined) this.mpu.roll = round3(data.mpu.roll);
							if (data.mpu.ax !== undefined) this.mpu.ax = round3(data.mpu.ax);
							if (data.mpu.ay !== undefined) this.mpu.ay = round3(data.mpu.ay);
							if (data.mpu.az !== undefined) this.mpu.az = round3(data.mpu.az);
						}

						if (data.vitals) {
							if (data.vitals.hr !== undefined) {
								this.vitals.heartRate = round3(data.vitals.hr);
								if (this.vitals.heartRate > this.vitals.peakHr) {
									this.vitals.peakHr = this.vitals.heartRate;
								}
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

	// A rep from the server-side EMG detector. Only counts toward the set in 'emg' mode;
	// in the other modes it's just shown (and counted on the calibration test panel).
	private onEmgRep(rep: { peakPct: number; peakUv: number; durationMs: number; isStrong: boolean }) {
		this.emgRepTestCount += 1;
		if (!workout.isSetRunning || workout.repSource !== 'emg') return;

		// If the camera happens to be on too, its anti-cheat flags still apply.
		const cameraCheat = this.isWebcamActive ? this.currentRepCheat : null;
		const cheatReason = cameraCheat ?? (rep.isStrong ? null : 'Low Activation (EMG)');
		workout.recordRep({
			isClean: cheatReason === null,
			concentricVelocity: this.mpu.concentricVelocity,
			rom: this.isWebcamActive ? Math.max(0, Math.round(this.maxElbowAngle - this.minElbowAngle)) : 0,
			cheatReason,
			peakEmg: rep.peakUv,
			velocityLossPercent: this.mpu.velocityLossPercent
		});
		this.resetRepTracking(this.cv.elbowAngle);
	}

	private resetRepTracking(elbowAngle: number) {
		this.hadPeakInCurrentRep = false;
		this.currentRepCheat = null;
		this.minElbowAngle = 180;
		this.maxElbowAngle = elbowAngle;
		this.repEmgPeakPct = 0;
		this.repEmgPeakUv = 0;
	}

	resetEmgRepTestCount() {
		this.emgRepTestCount = 0;
	}

	setWebcamActive(active: boolean) {
		this.isWebcamActive = active;
	}

	setTrackedArm(arm: 'right' | 'left') {
		this.cv.trackedArm = arm;
	}

	updateFromMediaPipe(data: {
		elbowAngle: number;
		torsoAngle: number;
		shoulderHikeCm: number;
		isTorsoCheating: boolean;
		isShoulderCheating: boolean;
		fps?: number;
	}) {
		if (workout.isSetRunning) {
			if (data.elbowAngle > this.maxElbowAngle) this.maxElbowAngle = data.elbowAngle;
			if (data.elbowAngle < this.minElbowAngle) this.minElbowAngle = data.elbowAngle;

			if (data.isTorsoCheating) this.currentRepCheat = 'Torso Swing';
			if (data.isShoulderCheating) this.currentRepCheat = 'Shoulder Hike';

			const cheatWarnings: string[] = [];
			if (data.isTorsoCheating) cheatWarnings.push('Torso Momentum Detected! (>8°)');
			if (data.isShoulderCheating) cheatWarnings.push('Shoulder Hiking Detected! (>3cm)');
			workout.activeCheatWarnings = cheatWarnings;

			// Elbow-angle FSM -- counts reps in 'camera' and 'hybrid' mode. In 'emg' mode
			// the EMG detector counts (onEmgRep) and the camera only supplies cheat flags/ROM.
			const cameraCounts = workout.repSource !== 'emg';
			if (data.elbowAngle >= 140) {
				if (this.hadPeakInCurrentRep && cameraCounts) {
					const rom = Math.max(50, Math.round(this.maxElbowAngle - this.minElbowAngle));
					let cheatReason = this.currentRepCheat;
					// Hybrid: the arm moved through a full rep, but if the muscle never reached
					// the "real effort" threshold the weight was swung up, not curled.
					if (
						!cheatReason &&
						workout.repSource === 'hybrid' &&
						this.sensorStatus.emg === 'live' &&
						this.repEmgPeakPct < this.serverCalibration.emgRepPeakPct
					) {
						cheatReason = 'Low Activation (EMG)';
					}

					workout.recordRep({
						isClean: cheatReason === null,
						concentricVelocity: this.mpu.concentricVelocity,
						rom,
						cheatReason,
						peakEmg: this.repEmgPeakUv,
						velocityLossPercent: this.mpu.velocityLossPercent
					});
					this.resetRepTracking(data.elbowAngle);
				}
				if (cameraCounts) workout.fsmState = 'START';
			} else if (data.elbowAngle < 140 && data.elbowAngle > 70) {
				if (cameraCounts) workout.fsmState = 'INFLECTION';
			} else if (data.elbowAngle <= 70) {
				if (cameraCounts) workout.fsmState = 'PEAK';
				this.hadPeakInCurrentRep = true;
			}
		}

		this.cv.elbowAngle = Math.round(data.elbowAngle);
		this.cv.torsoAngle = Number(data.torsoAngle.toFixed(1));
		this.cv.shoulderHikeCm = Number(data.shoulderHikeCm.toFixed(1));
		this.cv.isTorsoCheating = data.isTorsoCheating;
		this.cv.isShoulderCheating = data.isShoulderCheating;
		if (data.fps) this.cv.fps = data.fps;
	}
}

export const telemetry = new TelemetryManager();
