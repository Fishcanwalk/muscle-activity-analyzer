import { workout } from './workout.svelte';
import { round3, formatDec } from '$lib/utils/format';

export { round3, formatDec };

class TelemetryManager {
	emg = $state({
		rawBuffer: Array(80).fill(20),
		rms: 18,
		mvcPercent: 5,
		isHighTension: false
	});

	mpu = $state({
		concentricVelocity: 0.0,
		rep1Velocity: 0.52,
		velocityLossPercent: 0,
		isEffectiveZone: false
	});

	fsr = $state({
		gripForce: 0,
		gripStabilityPercent: 95,
		isStable: true
	});

	vitals = $state({
		heartRate: 72,
		spO2: 99,
		skinTemp: 33.5,
		deltaTemp: 0.0,
		peakHr: 72
	});

	cv = $state({
		elbowAngle: 165,
		torsoAngle: 2.1,
		shoulderHikeCm: 0.5,
		isTorsoCheating: false,
		isShoulderCheating: false,
		trackedArm: 'right' as 'right' | 'left',
		fps: 30
	});

	isSimulating = $state(true);
	isWebcamActive = $state(false);
	isWsConnected = $state(false);
	streamHz = $state(50);

	private simTimer: any = null;
	private simTime = 0;
	private repPhase = 0;
	private baseVelocity = 0.5;
	private injectTorsoCheat = false;
	private injectShoulderCheat = false;
	private lastSimFsm = 'START';
	private eventSource: EventSource | null = null;

	// Real camera FSM tracker
	private hadPeakInCurrentRep = false;
	private currentRepCheat: string | null = null;
	private minElbowAngle = 180;
	private maxElbowAngle = 0;

	constructor() {
		this.startSimulation();
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
								this.emg.rawBuffer = data.emg.rawBuffer;
								this.emg.rawBuffer = data.emg.rawBuffer.map((r: number) => round3(r));
							}
							this.emg.rms = data.emg.rms;
							this.emg.mvcPercent = data.emg.mvcPercent;
							if (data.emg.rms !== undefined) this.emg.rms = round3(data.emg.rms);
							if (data.emg.mvcPercent !== undefined)
								this.emg.mvcPercent = round3(data.emg.mvcPercent);
							this.emg.isHighTension = data.emg.isHighTension;
						}

						if (data.fsr) {
							this.fsr.gripForce = data.fsr.gripForce;
							this.fsr.gripStabilityPercent = data.fsr.gripStability;
							if (data.fsr.gripForce !== undefined) this.fsr.gripForce = round3(data.fsr.gripForce);
							if (data.fsr.gripStability !== undefined)
								this.fsr.gripStabilityPercent = round3(data.fsr.gripStability);
							this.fsr.isStable = data.fsr.isStable;
						}

						if (data.mpu) {
							if (data.mpu.velocity) this.mpu.concentricVelocity = data.mpu.velocity;
							if (data.mpu.velocity !== undefined)
								this.mpu.concentricVelocity = round3(data.mpu.velocity);
						}

						if (data.vitals) {
							if (data.vitals.hr) this.vitals.heartRate = data.vitals.hr;
							if (data.vitals.spo2) this.vitals.spO2 = data.vitals.spo2;
							if (data.vitals.skinTemp) this.vitals.skinTemp = data.vitals.skinTemp;
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

	startSimulation() {
		if (this.simTimer) clearInterval(this.simTimer);
		this.simTimer = setInterval(() => this.stepSimulation(), 20); // 50 Hz
		this.isSimulating = true;
	}

	stopSimulation() {
		if (this.simTimer) {
			clearInterval(this.simTimer);
			this.simTimer = null;
		}
		this.isSimulating = false;
	}

	setWebcamActive(active: boolean) {
		this.isWebcamActive = active;
	}

	setTrackedArm(arm: 'right' | 'left') {
		this.cv.trackedArm = arm;
	}

	triggerTorsoCheat() {
		this.injectTorsoCheat = true;
	}

	triggerShoulderCheat() {
		this.injectShoulderCheat = true;
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
			if (data.isTorsoCheating) cheatWarnings.push('⚠️ Torso Momentum Detected! (>8°)');
			if (data.isShoulderCheating) cheatWarnings.push('⚠️ Shoulder Hiking Detected! (>3cm)');
			workout.activeCheatWarnings = cheatWarnings;

			// FSM Transitions:
			if (data.elbowAngle >= 140) {
				if (this.hadPeakInCurrentRep) {
					const rom = Math.max(50, Math.round(this.maxElbowAngle - this.minElbowAngle));
					const isClean = !this.currentRepCheat;

					workout.recordRep({
						isClean,
						concentricVelocity: 0.42,
						rom,
						cheatReason: this.currentRepCheat,
						peakEmg: 490,
						velocityLossPercent: isClean ? 28 : 12
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

	private stepSimulation() {
		this.simTime += 0.02;

		let rms = 25 + Math.random() * 8;
		let grip = 12 + Math.random() * 3;
		let concentricVelocity = 0.0;
		let velocityLoss = 0;

		if (!this.isWebcamActive) {
			this.cv.torsoAngle = Number((2.0 + Math.sin(this.simTime * 1.5) * 0.8).toFixed(1));
			this.cv.shoulderHikeCm = Number((0.5 + Math.sin(this.simTime * 2.0) * 0.3).toFixed(1));

			if (workout.isSetRunning) {
				this.repPhase += 0.045;
				const normalizedCycle = (Math.sin(this.repPhase) + 1) / 2;
				this.cv.elbowAngle = Math.round(165 - normalizedCycle * 123);
				rms = Math.round(45 + normalizedCycle * 440 + (Math.random() - 0.5) * 35);
				if (rms < 20) rms = 20;
				grip = Math.round(18 + normalizedCycle * 14 + (Math.random() - 0.5) * 4);

				let fsm: 'START' | 'INFLECTION' | 'PEAK' = 'START';
				if (normalizedCycle < 0.15) fsm = 'START';
				else if (normalizedCycle >= 0.15 && normalizedCycle < 0.85) fsm = 'INFLECTION';
				else if (normalizedCycle >= 0.85) fsm = 'PEAK';

				const deltaCycle = Math.cos(this.repPhase);
				if (deltaCycle > 0) {
					concentricVelocity = Number(
						(this.baseVelocity * (0.8 + (1 - normalizedCycle) * 0.4)).toFixed(2)
					);
				} else {
					concentricVelocity = 0.05;
				}

				if (this.injectTorsoCheat)
					this.cv.torsoAngle = Number((12.8 + Math.random() * 2).toFixed(1));
				if (this.injectShoulderCheat)
					this.cv.shoulderHikeCm = Number((4.8 + Math.random() * 1.2).toFixed(1));

				this.cv.isTorsoCheating = this.cv.torsoAngle > 8.0;
				this.cv.isShoulderCheating = this.cv.shoulderHikeCm > 3.0;

				const cheatWarnings: string[] = [];
				if (this.cv.isTorsoCheating) cheatWarnings.push('⚠️ Torso Momentum Detected! (>8°)');
				if (this.cv.isShoulderCheating) cheatWarnings.push('⚠️ Shoulder Hiking Detected! (>3cm)');
				workout.activeCheatWarnings = cheatWarnings;

				if (this.lastSimFsm === 'PEAK' && fsm === 'INFLECTION' && deltaCycle < 0) {
					const isClean = !this.cv.isTorsoCheating && !this.cv.isShoulderCheating;
					const cheatReason = this.cv.isTorsoCheating
						? 'Torso Swing'
						: this.cv.isShoulderCheating
							? 'Shoulder Hike'
							: null;
					velocityLoss = Math.min(
						60,
						Math.max(0, Math.round((1 - this.baseVelocity / 0.52) * 100))
					);

					workout.recordRep({
						isClean,
						concentricVelocity: this.baseVelocity,
						rom: 123,
						cheatReason,
						peakEmg: 485,
						velocityLossPercent: velocityLoss
					});

					this.baseVelocity = Math.max(0.28, this.baseVelocity - 0.035);
					this.injectTorsoCheat = false;
					this.injectShoulderCheat = false;
				}

				this.lastSimFsm = fsm;
				workout.fsmState = fsm;

				if (rms > 280) workout.incrementTut(0.02);
			}
		} else {
			// Webcam active: sync biofeedback to live angle
			const flexRatio = Math.max(0, Math.min(1, (165 - this.cv.elbowAngle) / 120));
			rms = Math.round(35 + flexRatio * 460 + (Math.random() - 0.5) * 20);
			grip = Math.round(15 + flexRatio * 16 + (Math.random() - 0.5) * 3);
			concentricVelocity = Number((flexRatio * 0.45).toFixed(2));
			velocityLoss = Math.round(flexRatio * 32);

			if (rms > 280 && workout.isSetRunning) {
				workout.incrementTut(0.02);
			}
		}

		// Update raw buffer
		const newBuffer = [...this.emg.rawBuffer.slice(1)];
		const rawVal = Math.round(rms * (Math.sin(this.simTime * 60) + (Math.random() - 0.5) * 0.8));
		newBuffer.push(rawVal);
		this.emg.rawBuffer = newBuffer;
		this.emg.rms = rms;
		this.emg.mvcPercent = Math.min(100, Math.round((rms / 550) * 100));
		this.emg.isHighTension = rms > 280;

		const hr = workout.isSetRunning
			? Math.min(152, Math.round(72 + ((this.simTime * 1.5) % 80)))
			: 72;
		const deltaTemp = workout.isSetRunning
			? Number(Math.min(2.4, this.simTime * 0.04).toFixed(1))
			: 0.0;

		this.mpu.concentricVelocity = concentricVelocity;
		this.mpu.velocityLossPercent = this.isWebcamActive
			? velocityLoss
			: Math.min(60, Math.max(0, Math.round((1 - this.baseVelocity / 0.52) * 100)));
		this.mpu.isEffectiveZone =
			this.mpu.velocityLossPercent >= 25 && this.mpu.velocityLossPercent <= 45;

		this.fsr.gripForce = grip;
		this.fsr.gripStabilityPercent = Math.max(70, Math.round(98 - (grip > 35 ? 15 : 0)));

		this.vitals.heartRate = hr;
		this.vitals.skinTemp = Number((33.5 + deltaTemp).toFixed(1));
		this.vitals.deltaTemp = deltaTemp;
		this.vitals.peakHr = Math.max(this.vitals.peakHr, hr);
	}
}

export const telemetry = new TelemetryManager();
