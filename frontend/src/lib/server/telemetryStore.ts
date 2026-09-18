import { EventEmitter } from 'node:events';
import { env } from '$env/dynamic/private';
import { logger } from '$lib/logger';
import { EMG_BUFFER_SIZE } from '$lib/telemetry-constants';

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
	// not held-down levels -- see esp32_connectToWifi_buttons.cpp.
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

// Assumed sEMG front-end amplifier gain (typical MyoWare/AD8232-class module, ~1000x).
// The signal is AC-coupled and biased at mid-scale (ADC_MAX / 2) at rest, so we
// recenter before converting the deviation back to the original µV-scale biopotential.
// Tune EMG_GAIN to your actual sensor's datasheet gain for accurate readings.
const EMG_GAIN = 1000;
const HIGH_TENSION_UV_THRESHOLD = 280;

// Assumed full-scale grip force (Newtons) at max ADC reading; calibrate via fsrMax.
const FSR_MAX_N = 50;

// `baseline` is the calibrated rest-state µV reading (state.calibration.emgBaseline);
// it defaults to 0 so an uncalibrated system reproduces the old, unadjusted conversion.
function adcToEmgUv(rawAdc: number, baseline = 0): number {
	const centered = rawAdc - ADC_MAX / 2;
	const mv = (centered / ADC_MAX) * ADC_VREF_MV;
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
	private rawBuffer: number[] = Array(EMG_BUFFER_SIZE).fill(20);
	private packetCount = 0;
	private lastPacketTime = Date.now();
	private packetsPerSec = 0;
	private secondCounter = 0;
	private lastRateCalc = Date.now();

	state = {
		emg: {
			raw: 20,
			rawBuffer: this.rawBuffer,
			rms: 18.5,
			peak: 35,
			mvcPercent: 5,
			isHighTension: false,
			timestamp: Date.now()
		},
		fsr: {
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
			emgBaseline: 20.0,
			emgMvc: 550.0,
			fsrZero: 0.0,
			fsrMax: ADC_MAX
		}
	};

	constructor() {
		this.emitter.setMaxListeners(100);
	}

	ingestEmg(data: EmgPacket) {
		const now = Date.now();
		this.recordPacket(data.board || 'unknown');

		const rawAdc = Array.isArray(data.raw)
			? (data.raw[data.raw.length - 1] ?? 20)
			: (data.raw ?? 20);
		const emgBaseline = this.state.calibration.emgBaseline;
		const emgUv = adcToEmgUv(rawAdc, emgBaseline);

		if (Array.isArray(data.raw)) {
			for (const r of data.raw) {
				this.rawBuffer.shift();
				this.rawBuffer.push(round3(adcToEmgUv(r, emgBaseline)));
			}
		} else {
			this.rawBuffer.shift();
			this.rawBuffer.push(round3(emgUv));
		}

		const rms = data.rms !== undefined ? round3(data.rms) : round3(Math.abs(emgUv) * 1.1);
		const peak =
			data.peak !== undefined
				? round3(data.peak)
				: Math.max(Math.abs(round3(emgUv)), this.state.emg.peak);
		const mvcPercent =
			data.mvcPercent !== undefined
				? round3(data.mvcPercent)
				: Math.min(100, round3((rms / this.state.calibration.emgMvc) * 100));

		this.state.emg = {
			raw: round3(emgUv),
			rawBuffer: [...this.rawBuffer],
			rms,
			peak,
			mvcPercent,
			isHighTension: rms > HIGH_TENSION_UV_THRESHOLD,
			timestamp: data.timestamp || now
		};
		this.state.sensors.emg.lastSeen = now;

		this.broadcast('emg', this.state.emg);
		this.broadcast('telemetry', this.state);
		this.forwardToBackend();
	}

	ingestFullTelemetry(data: FullTelemetryPacket) {
		const now = Date.now();
		this.recordPacket(data.board || 'esp32');

		if (data.emg) {
			const rawAdc = Array.isArray(data.emg.raw)
				? (data.emg.raw[data.emg.raw.length - 1] ?? 20)
				: (data.emg.raw ?? 20);
			const emgBaseline = this.state.calibration.emgBaseline;
			const emgUv = adcToEmgUv(rawAdc, emgBaseline);

			if (Array.isArray(data.emg.raw)) {
				for (const r of data.emg.raw) {
					this.rawBuffer.shift();
					this.rawBuffer.push(round3(adcToEmgUv(r, emgBaseline)));
				}
			} else {
				this.rawBuffer.shift();
				this.rawBuffer.push(round3(emgUv));
			}

			const rms =
				data.emg.rms !== undefined ? round3(data.emg.rms) : round3(Math.abs(emgUv) * 1.1);
			const mvcPercent =
				data.emg.mvcPercent !== undefined
					? round3(data.emg.mvcPercent)
					: Math.min(100, round3((rms / this.state.calibration.emgMvc) * 100));

			this.state.emg = {
				raw: round3(emgUv),
				rawBuffer: [...this.rawBuffer],
				rms,
				peak:
					data.emg.peak !== undefined
						? round3(data.emg.peak)
						: Math.max(Math.abs(round3(emgUv)), this.state.emg.peak),
				mvcPercent,
				isHighTension: rms > HIGH_TENSION_UV_THRESHOLD,
				timestamp: data.timestamp || now
			};
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

	setCalibration(cal: {
		emgBaseline?: number;
		emgMvc?: number;
		fsrZero?: number;
		fsrMax?: number;
	}) {
		if (cal.emgBaseline !== undefined) this.state.calibration.emgBaseline = cal.emgBaseline;
		if (cal.emgMvc !== undefined) this.state.calibration.emgMvc = cal.emgMvc;
		if (cal.fsrZero !== undefined) this.state.calibration.fsrZero = cal.fsrZero;
		if (cal.fsrMax !== undefined) this.state.calibration.fsrMax = cal.fsrMax;
		this.broadcast('calibration', this.state.calibration);
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

	private forwardToBackend() {
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
				timestamp: Date.now()
			})
		}).catch((err) => {
			logger.warn({ err }, '[Telemetry] Failed to forward packet to backend');
		});
	}
}

export const serverTelemetry = new ServerTelemetryState();
