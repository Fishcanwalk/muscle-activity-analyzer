class ReadinessManager {
	isTesting = $state(false);
	countdownSeconds = $state(5);
	currentGripKg = $state(0);
	peakGripKg = $state(0);
	baselineGripKg = $state(50.0);
	cnsReadinessPercent = $state(96);

	restingHr = $state(62);
	restingSpo2 = $state(99);
	baselineSkinTemp = $state(33.4);

	overallScore = $state(95);
	statusLabel = $state('Optimal Readiness');
	recommendation = $state(
		'ระบบประสาทและร่างกายฟื้นตัวเต็มที่ (95%) พร้อมสำหรับการฝึกระดับ High Intensity (RPE 8.5–9.5) สามารถดันน้ำหนักหรือเพิ่ม Rep ได้ตามโปรแกรม'
	);
	isComplete = $state(false);

	private testInterval: any = null;

	startGripTest() {
		this.isTesting = true;
		this.countdownSeconds = 5;
		this.peakGripKg = 0;
		this.currentGripKg = 0;
		this.isComplete = false;

		let secondsLeft = 5;
		let highestGrip = 0;

		this.testInterval = setInterval(() => {
			secondsLeft -= 1;
			const simulatedEffort = Number((42 + Math.random() * 7.5).toFixed(1));
			if (simulatedEffort > highestGrip) highestGrip = simulatedEffort;

			this.countdownSeconds = secondsLeft;
			this.currentGripKg = simulatedEffort;
			this.peakGripKg = highestGrip;

			if (secondsLeft <= 0) {
				clearInterval(this.testInterval);
				this.testInterval = null;

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

				this.isTesting = false;
				this.isComplete = true;
				this.cnsReadinessPercent = readinessPct;
				this.overallScore = Math.min(100, readinessPct);
				this.statusLabel = status;
				this.recommendation = rec;
				this.currentGripKg = highestGrip;
			}
		}, 1000);
	}

	resetTest() {
		if (this.testInterval) clearInterval(this.testInterval);
		this.isTesting = false;
		this.countdownSeconds = 5;
		this.currentGripKg = 0;
		this.peakGripKg = 0;
		this.isComplete = false;
	}
}

export const readiness = new ReadinessManager();
