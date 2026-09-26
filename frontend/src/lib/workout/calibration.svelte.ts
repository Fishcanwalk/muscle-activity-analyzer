import { telemetry } from './telemetry.svelte';
import { workout } from './workout.svelte';
import { DEFAULT_CALIBRATION, type CalibrationValues } from './metrics';

export type CalibrationStep = 'emgZero' | 'emgMvc' | 'fsrZero' | 'fsrMax';

// Calibration belongs to one workout session: it starts from defaults every session and
// is never loaded back from the backend. It's kept in sessionStorage only so a page
// reload mid-session doesn't force the lifter to redo it; startFresh() clears it.
const STORAGE_KEY = 'workout.calibration';
const NOT_CAPTURED: Record<CalibrationStep, boolean> = {
	emgZero: false,
	emgMvc: false,
	fsrZero: false,
	fsrMax: false
};

interface StoredCalibration {
	values: CalibrationValues;
	captured: Record<CalibrationStep, boolean>;
}

function readStored(): StoredCalibration | null {
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as StoredCalibration;
		return parsed?.values && parsed?.captured ? parsed : null;
	} catch {
		return null;
	}
}

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
// The MVC reading is already baseline-subtracted. One step of the Uno's 10-bit ADC is
// ~3 on this scale, so anything below this is ADC noise, not a contraction: accepting
// it would turn every twitch into ~100% MVC.
const MIN_EMG_MVC_UV = 50;

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

	/** Steps measured during this session. */
	stepDone = $state<Record<CalibrationStep, boolean>>({ ...NOT_CAPTURED });

	// %MVC only means something once MVC itself has been measured.
	canCountWithEmg = $derived(this.stepDone.emgMvc);

	/** Every step measured this session -- required before the session's first set. */
	isCalibrated = $derived(Object.values(this.stepDone).every(Boolean));

	private get values(): CalibrationValues {
		return {
			emgBaseline: this.emgZeroOffsetUv,
			emgMvc: this.emgMvcPeakUv,
			fsrZero: this.fsrZeroAdc,
			fsrMax: this.fsrMaxGripAdc,
			emgRepOnPct: this.emgRepOnPct,
			emgRepOffPct: this.emgRepOffPct,
			emgRepPeakPct: this.emgRepPeakPct
		};
	}

	private applyValues(cal: CalibrationValues) {
		this.emgZeroOffsetUv = cal.emgBaseline;
		this.emgMvcPeakUv = cal.emgMvc;
		this.fsrZeroAdc = cal.fsrZero;
		this.fsrMaxGripAdc = cal.fsrMax;
		this.emgRepOnPct = cal.emgRepOnPct;
		this.emgRepOffPct = cal.emgRepOffPct;
		this.emgRepPeakPct = cal.emgRepPeakPct;
	}

	// workout.svelte.ts can't import this module (it would be an import cycle through
	// telemetry.svelte.ts), so the state startSet() checks is pushed to it instead.
	private syncWorkout() {
		workout.setCalibrationState(this.isCalibrated, this.emgMvcPeakUv);
	}

	private persist() {
		try {
			sessionStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({ values: this.values, captured: this.stepDone } satisfies StoredCalibration)
			);
		} catch {
			// Storage unavailable -- a reload will just ask for calibration again.
		}
		this.syncWorkout();
	}

	/** On page load: keep this session's calibration if the page was only reloaded. */
	restoreOrStartFresh() {
		const stored = readStored();
		if (!stored) {
			void this.startFresh();
			return;
		}
		this.applyValues(stored.values);
		this.stepDone = { ...NOT_CAPTURED, ...stored.captured };
		this.syncWorkout();
		// The server's live copy may have been reset (restart, another session) since.
		void this.postCurrentCalibration();
	}

	/** A new session: forget every value and make the server's live copy default again. */
	async startFresh() {
		this.applyValues(DEFAULT_CALIBRATION);
		this.stepDone = { ...NOT_CAPTURED };
		try {
			sessionStorage.removeItem(STORAGE_KEY);
		} catch {
			// Nothing stored then.
		}
		this.syncWorkout();
		try {
			await fetch('/api/calibration', { method: 'DELETE' });
		} catch {
			// Server unreachable -- the next capture POST overwrites its copy anyway.
		}
	}

	private async postCurrentCalibration(): Promise<boolean> {
		try {
			const res = await fetch('/api/calibration', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(this.values)
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
			// The server's unadjusted level, not rawBuffer + baseline: rawBuffer keeps 1.5 s
			// of samples converted with whatever baseline was active then, so right after a
			// capture it still holds the old offset and re-measuring would add the two up.
			case 'emgZero':
				return telemetry.emg.level;
			case 'emgMvc':
				return telemetry.emg.rms;
			case 'fsrZero':
			case 'fsrMax':
				return telemetry.fsr.rawAdc;
		}
	}

	// Samples the live sensor stream for CAPTURE_DURATION_MS[step], then stores the result
	// (mean for rest readings, peak for max-effort readings) for this session and sends
	// it to the server, whose live conversion and rep detector use it.
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
				if (value < MIN_EMG_MVC_UV) {
					return {
						ok: false,
						error: `สัญญาณตอนเกร็งสูงกว่าตอนพักแค่ ${value} µV แปลว่าเซนเซอร์ไม่ตอบสนองต่อการเกร็ง ตรวจสายสัญญาณ ขั้วอิเล็กโทรด และไฟเลี้ยงของโมดูล sEMG`
					};
				}
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
		this.stepDone[step] = true;
		this.persist();

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
		this.persist();
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
