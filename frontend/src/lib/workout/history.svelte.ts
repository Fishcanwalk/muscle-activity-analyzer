export interface MetricComparison {
	name: string;
	prev: string;
	curr: string;
	delta: string;
	isPositive: boolean;
}

export interface SessionTrendPoint {
	session: string;
	weight: number;
	cleanReps: number;
	purity: number;
	sEmgRms: number;
	rom: number;
	cleanVolume: number;
}

class HistoryManager {
	comparison = $state({
		previousDate: '9 ก.ย. 2026',
		currentDate: '11 ก.ย. 2026 (วันนี้)',
		metrics: [
			{
				name: 'น้ำหนักดัมเบล (Load)',
				prev: '12.5 kg',
				curr: '12.5 kg',
				delta: '0% (คงที่)',
				isPositive: true
			},
			{
				name: 'Clean Reps (ไม่โกง)',
				prev: '18 ครั้ง',
				curr: '22 ครั้ง',
				delta: '+22.2%',
				isPositive: true
			},
			{
				name: 'Form Purity (% ท่าคลีน)',
				prev: '78.0%',
				curr: '91.6%',
				delta: '+13.6%',
				isPositive: true
			},
			{
				name: 'Average ROM (องศาข้อศอก)',
				prev: '118°',
				curr: '124°',
				delta: '+6° (ยืดลึกขึ้น)',
				isPositive: true
			},
			{
				name: 'Peak sEMG Activation',
				prev: '390 µV',
				curr: '425 µV',
				delta: '+8.9% (Neural Drive ดีขึ้น)',
				isPositive: true
			},
			{
				name: 'High-Tension TUT',
				prev: '62 วินาที',
				curr: '78 วินาที',
				delta: '+25.8% (Tension นานขึ้น)',
				isPositive: true
			},
			{
				name: 'Grip Fatigue Drop',
				prev: '-18%',
				curr: '-11%',
				delta: '+7% (มือนิ่งขึ้น)',
				isPositive: true
			},
			{
				name: 'Muscle Pump (ΔT)',
				prev: '+1.4°C',
				curr: '+1.8°C',
				delta: '+0.4°C (Hyperemia แน่นขึ้น)',
				isPositive: true
			}
		] as MetricComparison[]
	});

	sessionsTrend = $state<SessionTrendPoint[]>([
		{
			session: '28 ส.ค.',
			weight: 10.0,
			cleanReps: 24,
			purity: 72,
			sEmgRms: 340,
			rom: 112,
			cleanVolume: 240
		},
		{
			session: '31 ส.ค.',
			weight: 10.0,
			cleanReps: 27,
			purity: 79,
			sEmgRms: 360,
			rom: 115,
			cleanVolume: 270
		},
		{
			session: '4 ก.ย.',
			weight: 12.5,
			cleanReps: 16,
			purity: 70,
			sEmgRms: 375,
			rom: 114,
			cleanVolume: 200
		},
		{
			session: '9 ก.ย.',
			weight: 12.5,
			cleanReps: 18,
			purity: 78,
			sEmgRms: 390,
			rom: 118,
			cleanVolume: 225
		},
		{
			session: '11 ก.ย.',
			weight: 12.5,
			cleanReps: 22,
			purity: 91,
			sEmgRms: 425,
			rom: 124,
			cleanVolume: 275
		}
	]);

	takeawayNote = $state(
		`แม้จะใช้น้ำหนักเท่าเดิม (12.5 kg) แต่คุณสามารถขยาย ROM ได้กว้างขึ้น 6 องศา (เหยียดลึกขึ้นเข้าจุด Stretch-Mediated Hypertrophy), สั่งการกล้ามเนื้อ (Neural Drive) ผ่านคลื่น sEMG ได้สูงขึ้น 8.9% โดยที่อาการโกงท่าลดลงอย่างมีนัยสำคัญ ถือเป็น Progressive Overload ตามหลักวิทยาศาสตร์การกีฬาอย่างแท้จริง!`
	);

	addCompletedSession(sessionData: SessionTrendPoint) {
		this.sessionsTrend = [...this.sessionsTrend, sessionData];
	}
}

export const history = new HistoryManager();
