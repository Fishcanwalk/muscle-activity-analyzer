import { telemetry } from './telemetry.svelte';

const TEST_SECONDS = 5;

class ReadinessManager {
	isTesting = $state(false);
	countdownSeconds = $state(TEST_SECONDS);
	currentGripKg = $state(0);
	peakGripKg = $state(0);
	baselineGripKg = $state(50.0);
	/** null until a grip test has finished with a usable reading. */
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
		this.peakGripKg = 0;
		this.currentGripKg = 0;
		this.isComplete = false;

		let secondsLeft = TEST_SECONDS;
		let highestGrip = 0;

		this.testInterval = setInterval(() => {
			secondsLeft -= 1;
			// Sample real hardware FSR reading (1 kg ≈ 9.8 N)
			const realGripForce = telemetry.fsr.gripForce;
			const measuredKg = Number((realGripForce > 0 ? realGripForce / 9.8 : 0).toFixed(1));
			if (measuredKg > highestGrip) highestGrip = measuredKg;

			this.countdownSeconds = secondsLeft;
			this.currentGripKg = measuredKg;
			this.peakGripKg = highestGrip;

			if (secondsLeft <= 0) {
				if (this.testInterval) clearInterval(this.testInterval);
				this.testInterval = null;
				this.isTesting = false;
				this.currentGripKg = highestGrip;

				if (highestGrip <= 0) {
					this.statusLabel = 'ไม่พบแรงบีบ';
					this.recommendation =
						'ไม่ได้รับค่าจากเซนเซอร์แรงบีบ (FSR) ตรวจสอบการเชื่อมต่อหรือปรับเทียบเซนเซอร์ แล้วทดสอบใหม่';
					return;
				}

				const readinessPct = Math.round((highestGrip / this.baselineGripKg) * 100);
				let status = 'Optimal Readiness';
				let rec = 'ระบบประสาทฟื้นตัวดีเยี่ยม พร้อมฝึกเต็มศักยภาพ';

				if (readinessPct < 85) {
					status = 'High Fatigue / Deload';
					rec =
						'ตรวจพบความล้าสะสมของระบบประสาท (CNS Fatigue) แนะนำลด Volume ลง 20% หรือเลือก RIR 3-4';
				} else if (readinessPct < 92) {
					status = 'Moderate Fatigue';
					rec = 'ความพร้อมปานกลาง แนะนำให้รักษาความหนักเท่าเดิม ไม่ควรฝืนเร่งน้ำหนักในวันนี้';
				}

				this.isComplete = true;
				this.cnsReadinessPercent = readinessPct;
				this.overallScore = Math.min(100, readinessPct);
				this.statusLabel = status;
				this.recommendation = rec;
			}
		}, 1000);
	}

	resetTest() {
		if (this.testInterval) clearInterval(this.testInterval);
		this.testInterval = null;
		this.isTesting = false;
		this.countdownSeconds = TEST_SECONDS;
		this.currentGripKg = 0;
		this.peakGripKg = 0;
		this.isComplete = false;
	}
}

export const readiness = new ReadinessManager();
