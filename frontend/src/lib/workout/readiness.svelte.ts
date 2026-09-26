import fastapiClient from '$lib/api/fastapi-client';
import { telemetry } from './telemetry.svelte';

const TEST_SECONDS = 5;
const SAMPLE_MS = 100;
// Below this many ADC counts above "no grip" the FSR didn't register a squeeze.
const MIN_GRIP_SPAN_ADC = 50;

// Pre-workout grip test. Today's peak is compared with the user's own recent tests
// (POST /v1/readiness/grip), in raw ADC counts above "no grip" -- not with this
// session's calibrated max squeeze, which was just measured and would always read ~100%.
class ReadinessManager {
	isTesting = $state(false);
	countdownSeconds = $state(TEST_SECONDS);
	/** % of this session's calibrated max squeeze, for the live display. */
	currentGripPercent = $state(0);
	peakGripPercent = $state(0);
	/** How many earlier tests the comparison used; null until a test finished. */
	previousTests = $state<number | null>(null);
	/** Today's peak as % of the user's normal grip; null until there's a baseline. */
	cnsReadinessPercent = $state<number | null>(null);

	// 0 means "no reading yet" -- the page shows a dash instead of a made-up number.
	restingHr = $derived(Math.round(telemetry.vitals.heartRate));
	restingSpo2 = $derived(Math.round(telemetry.vitals.spO2));
	baselineSkinTemp = $derived(telemetry.vitals.skinTemp);

	overallScore = $state<number | null>(null);
	statusLabel = $state('ยังไม่ได้ทดสอบ');
	recommendation = $state(
		'กด "เริ่มทดสอบแรงบีบ" แล้วบีบเซนเซอร์เต็มแรงค้างไว้ 5 วินาที ระบบจะเทียบกับแรงบีบปกติของคุณเพื่อประเมินความล้าก่อนเริ่มฝึก'
	);
	isComplete = $state(false);

	private testInterval: ReturnType<typeof setInterval> | null = null;

	startGripTest() {
		if (this.testInterval) clearInterval(this.testInterval);
		this.isTesting = true;
		this.countdownSeconds = TEST_SECONDS;
		this.peakGripPercent = 0;
		this.currentGripPercent = 0;
		this.isComplete = false;

		const startedAt = Date.now();
		let peakSpanAdc = 0;

		this.testInterval = setInterval(() => {
			const spanAdc = telemetry.fsr.rawAdc - telemetry.serverCalibration.fsrZero;
			if (spanAdc > peakSpanAdc) peakSpanAdc = spanAdc;
			this.currentGripPercent = Math.round(telemetry.fsr.gripPercent);
			this.peakGripPercent = Math.max(this.peakGripPercent, this.currentGripPercent);

			const elapsed = Date.now() - startedAt;
			this.countdownSeconds = Math.max(0, Math.ceil((TEST_SECONDS * 1000 - elapsed) / 1000));
			if (elapsed < TEST_SECONDS * 1000) return;

			if (this.testInterval) clearInterval(this.testInterval);
			this.testInterval = null;
			this.isTesting = false;
			this.currentGripPercent = this.peakGripPercent;
			void this.finishTest(peakSpanAdc);
		}, SAMPLE_MS);
	}

	private async finishTest(peakSpanAdc: number) {
		if (peakSpanAdc < MIN_GRIP_SPAN_ADC) {
			this.statusLabel = 'ไม่พบแรงบีบ';
			this.recommendation =
				'ไม่ได้รับค่าจากเซนเซอร์แรงบีบ (FSR) ตรวจสอบการเชื่อมต่อหรือปรับเทียบเซนเซอร์ แล้วทดสอบใหม่';
			return;
		}

		const { data, error } = await fastapiClient
			.POST('/v1/readiness/grip', { body: { peakSpanAdc } })
			.catch(() => ({ data: undefined, error: true }));
		if (error || !data) {
			this.statusLabel = 'บันทึกผลไม่สำเร็จ';
			this.recommendation = 'ส่งผลทดสอบไปยังเซิร์ฟเวอร์ไม่สำเร็จ ลองทดสอบใหม่อีกครั้ง';
			return;
		}

		this.isComplete = true;
		this.previousTests = data.previousTests;
		const readinessPct = data.readinessPercent ?? null;
		this.cnsReadinessPercent = readinessPct;
		if (readinessPct === null) {
			this.overallScore = null;
			this.statusLabel = 'บันทึกค่าอ้างอิงแล้ว';
			this.recommendation =
				'นี่คือการทดสอบครั้งแรกของคุณ ระบบบันทึกแรงบีบนี้เป็นค่าปกติ ครั้งต่อไปจะนำมาเทียบเพื่อประเมินความล้า';
			return;
		}

		let status = 'Optimal Readiness';
		let rec = 'ระบบประสาทฟื้นตัวดีเยี่ยม พร้อมฝึกเต็มศักยภาพ';
		if (readinessPct < 85) {
			status = 'High Fatigue / Deload';
			rec = 'ตรวจพบความล้าสะสมของระบบประสาท (CNS Fatigue) แนะนำลด Volume ลง 20% หรือเลือก RIR 3-4';
		} else if (readinessPct < 92) {
			status = 'Moderate Fatigue';
			rec = 'ความพร้อมปานกลาง แนะนำให้รักษาความหนักเท่าเดิม ไม่ควรฝืนเร่งน้ำหนักในวันนี้';
		}
		this.overallScore = Math.min(100, readinessPct);
		this.statusLabel = status;
		this.recommendation = rec;
	}

	resetTest() {
		if (this.testInterval) clearInterval(this.testInterval);
		this.testInterval = null;
		this.isTesting = false;
		this.countdownSeconds = TEST_SECONDS;
		this.currentGripPercent = 0;
		this.peakGripPercent = 0;
		this.isComplete = false;
	}
}

export const readiness = new ReadinessManager();
