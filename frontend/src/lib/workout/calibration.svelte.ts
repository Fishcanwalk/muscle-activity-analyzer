import { telemetry } from './telemetry.svelte';
import { DEFAULT_CALIBRATION, isDefaultCalibration, type CalibrationValues } from './metrics';

export type CalibrationStep = 'emgZero' | 'emgMvc' | 'fsrZero' | 'fsrMax';

const CAPTURE_SAMPLE_MS = 100;
// Rest readings are averaged over a short window; max-effort readings get longer so
// the lifter has time to ramp up to a full contraction / squeeze.
const CAPTURE_DURATION_MS: Record<CalibrationStep, number> = {
	emgZero: 3000,
	emgMvc: 5000,
	fsrZero: 3000,
	fsrMax: 5000
};
// fsrMax must clear fsrZero by at least this many ADC counts, otherwise the
// squeeze didn't register and the grip-force scale would be meaningless.
const MIN_FSR_SPAN_ADC = 200;

export type CaptureResult = { ok: true; value: number } | { ok: false; error: string };

function mean(values: number[]): number {
	return values.reduce((sum, v) => sum + v, 0) / values.length;
}

class CalibrationManager {
	emgZeroOffsetUv = $state(DEFAULT_CALIBRATION.emgBaseline);
	emgMvcPeakUv = $state(DEFAULT_CALIBRATION.emgMvc);

	fsrZeroAdc = $state(DEFAULT_CALIBRATION.fsrZero);
	fsrMaxGripAdc = $state(DEFAULT_CALIBRATION.fsrMax);

	// EMG rep-counting thresholds (% of emgMvcPeakUv), applied server-side by
	// src/lib/server/emgRepDetector.ts once saved.
	emgRepOnPct = $state(DEFAULT_CALIBRATION.emgRepOnPct);
	emgRepOffPct = $state(DEFAULT_CALIBRATION.emgRepOffPct);
	emgRepPeakPct = $state(DEFAULT_CALIBRATION.emgRepPeakPct);

	torsoAngleLimitDeg = $state(8.0);
	shoulderHikeLimitCm = $state(3.0);

	capturing = $state<CalibrationStep | null>(null);
	captureSecondsLeft = $state(0);

	// A step counts as done once its value differs from the backend default, i.e. it
	// has been measured (now or in an earlier visit) and saved.
	stepDone = $derived({
		emgZero: this.emgZeroOffsetUv !== DEFAULT_CALIBRATION.emgBaseline,
		emgMvc: this.emgMvcPeakUv !== DEFAULT_CALIBRATION.emgMvc,
		fsrZero: this.fsrZeroAdc !== DEFAULT_CALIBRATION.fsrZero,
		fsrMax: this.fsrMaxGripAdc !== DEFAULT_CALIBRATION.fsrMax
	} satisfies Record<CalibrationStep, boolean>);

	// %MVC only means something once MVC itself has been measured.
	canCountWithEmg = $derived(this.stepDone.emgMvc);

	isCalibrated = $derived(
		!isDefaultCalibration({
			emgBaseline: this.emgZeroOffsetUv,
			emgMvc: this.emgMvcPeakUv,
			fsrZero: this.fsrZeroAdc,
			fsrMax: this.fsrMaxGripAdc
		})
	);

	apply(cal: CalibrationValues) {
		this.emgZeroOffsetUv = cal.emgBaseline;
		this.emgMvcPeakUv = cal.emgMvc;
		this.fsrZeroAdc = cal.fsrZero;
		this.fsrMaxGripAdc = cal.fsrMax;
		this.emgRepOnPct = cal.emgRepOnPct ?? DEFAULT_CALIBRATION.emgRepOnPct;
		this.emgRepOffPct = cal.emgRepOffPct ?? DEFAULT_CALIBRATION.emgRepOffPct;
		this.emgRepPeakPct = cal.emgRepPeakPct ?? DEFAULT_CALIBRATION.emgRepPeakPct;
	}

	async loadFromServer() {
		try {
			const res = await fetch('/api/calibration');
			if (!res.ok) return;
			const { calibration: cal } = await res.json();
			if (cal) this.apply(cal);
		} catch {
			// Keep the current values if the server can't be reached.
		}
	}

	private async postCurrentCalibration(): Promise<boolean> {
		try {
			const res = await fetch('/api/calibration', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					emgBaseline: this.emgZeroOffsetUv,
					emgMvc: this.emgMvcPeakUv,
					fsrZero: this.fsrZeroAdc,
					fsrMax: this.fsrMaxGripAdc,
					emgRepOnPct: this.emgRepOnPct,
					emgRepOffPct: this.emgRepOffPct,
					emgRepPeakPct: this.emgRepPeakPct
				})
			});
			return res.ok;
		} catch {
			return false;
		}
	}

	private readSample(step: CalibrationStep): number | null {
		const sensorLive = step.startsWith('emg')
			? telemetry.sensorStatus.emg === 'live'
			: telemetry.sensorStatus.fsr === 'live';
		if (!sensorLive) return null;
		switch (step) {
			case 'emgZero': {
				// rawBuffer is already offset by the server's current baseline, so adding
				// it back gives the unadjusted resting DC level.
				const buf = telemetry.emg.rawBuffer;
				return mean(buf) + telemetry.serverCalibration.emgBaseline;
			}
			case 'emgMvc':
				return telemetry.emg.rms;
			case 'fsrZero':
			case 'fsrMax':
				return telemetry.fsr.rawAdc;
		}
	}

	// Samples the live sensor stream for CAPTURE_DURATION_MS[step], then saves the
	// result (mean for rest readings, peak for max-effort readings) to the backend.
	async capture(step: CalibrationStep): Promise<CaptureResult> {
		if (this.capturing) return { ok: false, error: 'กำลังวัดค่าอื่นอยู่' };

		const durationMs = CAPTURE_DURATION_MS[step];
		const samples: number[] = [];
		this.capturing = step;
		this.captureSecondsLeft = Math.ceil(durationMs / 1000);

		const startedAt = Date.now();
		await new Promise<void>((resolve) => {
			const id = setInterval(() => {
				const sample = this.readSample(step);
				if (sample !== null && Number.isFinite(sample)) samples.push(sample);
				const elapsed = Date.now() - startedAt;
				this.captureSecondsLeft = Math.max(0, Math.ceil((durationMs - elapsed) / 1000));
				if (elapsed >= durationMs) {
					clearInterval(id);
					resolve();
				}
			}, CAPTURE_SAMPLE_MS);
		});
		this.capturing = null;

		if (samples.length === 0) {
			return { ok: false, error: 'ไม่ได้รับข้อมูลจากเซนเซอร์ ตรวจสอบว่า ESP32 เชื่อมต่ออยู่' };
		}

		let value: number;
		switch (step) {
			case 'emgZero':
				value = Math.round(mean(samples) * 10) / 10;
				this.emgZeroOffsetUv = value;
				break;
			case 'emgMvc':
				value = Math.round(Math.max(...samples));
				if (value <= 0)
					return { ok: false, error: 'ไม่พบสัญญาณการเกร็งกล้ามเนื้อ ลองใหม่อีกครั้ง' };
				this.emgMvcPeakUv = value;
				break;
			case 'fsrZero':
				value = Math.round(mean(samples));
				this.fsrZeroAdc = value;
				break;
			case 'fsrMax':
				value = Math.round(Math.max(...samples));
				if (value - this.fsrZeroAdc < MIN_FSR_SPAN_ADC) {
					return { ok: false, error: 'แรงบีบต่ำเกินไปเมื่อเทียบกับจุดไม่มีแรงกด ลองบีบให้แรงขึ้น' };
				}
				this.fsrMaxGripAdc = value;
				break;
		}

		const saved = await this.postCurrentCalibration();
		return saved
			? { ok: true, value }
			: { ok: false, error: 'วัดค่าได้แล้วแต่บันทึกไปยังเซิร์ฟเวอร์ไม่สำเร็จ' };
	}

	/** Returns an error message, or null if the thresholds are usable. */
	validateRepThresholds(): string | null {
		if (this.emgRepOffPct >= this.emgRepOnPct - 5) {
			return 'เกณฑ์ "จบ rep" ต้องต่ำกว่าเกณฑ์ "เริ่มเกร็ง" อย่างน้อย 5%';
		}
		if (this.emgRepPeakPct < this.emgRepOnPct) {
			return 'เกณฑ์ "ออกแรงจริง" ต้องไม่ต่ำกว่าเกณฑ์ "เริ่มเกร็ง"';
		}
		return null;
	}

	async saveRepThresholds(): Promise<CaptureResult> {
		const invalid = this.validateRepThresholds();
		if (invalid) return { ok: false, error: invalid };
		const saved = await this.postCurrentCalibration();
		return saved
			? { ok: true, value: this.emgRepOnPct }
			: { ok: false, error: 'บันทึกเกณฑ์ไปยังเซิร์ฟเวอร์ไม่สำเร็จ' };
	}

	setTorsoLimit(deg: number) {
		this.torsoAngleLimitDeg = Number(deg);
	}

	setShoulderLimit(cm: number) {
		this.shoulderHikeLimitCm = Number(cm);
	}
}

export const calibration = new CalibrationManager();
