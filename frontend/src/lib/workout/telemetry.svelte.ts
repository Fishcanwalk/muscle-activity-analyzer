import { workout } from './workout.svelte';
import { round3, formatDec } from '$lib/utils/format';

export { round3, formatDec };

class TelemetryManager {
	emg = $state({
		rawBuffer: Array(80).fill(0),
		rms: 0,
		mvcPercent: 0,
		isHighTension: false
	});

	mpu = $state({
		concentricVelocity: 0.0,
		rep1Velocity: 0.0,
		velocityLossPercent: 0,
		isEffectiveZone: false
	});

	fsr = $state({
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

	isWebcamActive = $state(false);
	isWsConnected = $state(false);
	streamHz = $state(0);

	private eventSource: EventSource | null = null;

	// Real camera FSM tracker
	private hadPeakInCurrentRep = false;
	private currentRepCheat: string | null = null;
	private minElbowAngle = 180;
	private maxElbowAngle = 0;

	constructor() {
		if (typeof window !== 'undefined') {
			this.connectApiStream();
		}
	}

	connectApiStream() {
		if (typeof window === 'undefined') return;
		try {
			if (this.eventSource) this.eventSource.close();
			this.eventSource = new EventSource('/api/telemetry/stream');
			this.eventSource.addEventListener('telemetry', (e) => {
				try {
					const data = JSON.parse(e.data);
					if (data.device?.connected) {
						this.isWsConnected = true;
						this.streamHz = data.device.rateHz || 50;

						if (data.emg) {
							if (Array.isArray(data.emg.rawBuffer) && data.emg.rawBuffer.length > 0) {
								this.emg.rawBuffer = data.emg.rawBuffer.map((r: number) => round3(r));
							}
							if (data.emg.rms !== undefined) this.emg.rms = round3(data.emg.rms);
							if (data.emg.mvcPercent !== undefined)
								this.emg.mvcPercent = round3(data.emg.mvcPercent);
							this.emg.isHighTension = data.emg.isHighTension;
						}

						if (data.fsr) {
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
						}

						if (data.vitals) {
							if (data.vitals.hr !== undefined) this.vitals.heartRate = round3(data.vitals.hr);
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
			this.eventSource.onerror = () => {
				this.isWsConnected = false;
			};
		} catch (err) {
			console.warn('[Telemetry] SSE stream connect error', err);
		}
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

			// FSM Transitions:
			if (data.elbowAngle >= 140) {
				if (this.hadPeakInCurrentRep) {
					const rom = Math.max(50, Math.round(this.maxElbowAngle - this.minElbowAngle));
					const isClean = !this.currentRepCheat;

					workout.recordRep({
						isClean,
						concentricVelocity: this.mpu.concentricVelocity,
						rom,
						cheatReason: this.currentRepCheat,
						peakEmg: this.emg.rms,
						velocityLossPercent: this.mpu.velocityLossPercent
					});

					this.hadPeakInCurrentRep = false;
					this.currentRepCheat = null;
					this.minElbowAngle = 180;
					this.maxElbowAngle = data.elbowAngle;
				}
				workout.fsmState = 'START';
			} else if (data.elbowAngle < 140 && data.elbowAngle > 70) {
				workout.fsmState = 'INFLECTION';
			} else if (data.elbowAngle <= 70) {
				workout.fsmState = 'PEAK';
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
