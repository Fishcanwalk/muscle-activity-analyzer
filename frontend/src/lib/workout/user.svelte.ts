export interface UserProfile {
	id: string;
	name: string;
	email: string;
	avatar: string;
	level: string;
	targetMuscle: string;
	weightKg: number;
	totalSessions: number;
	streakDays: number;
	joinedDate: string;
	personalRecords: {
		maxCleanReps: number;
		highestVolumeKg: number;
		longestTutSec: number;
		peakEmgUv: number;
		bestRomDeg: number;
		lowestCheatPercent: number;
	};
	weeklyVolume: { week: string; clean: number; cheated: number }[];
	formProgression: { session: string; purity: number; rom: number; emg: number }[];
	historyLogs: {
		id: string;
		date: string;
		exercise: string;
		weightKg: number;
		sets: number;
		totalReps: number;
		cleanReps: number;
		purity: number;
		rom: number;
		pumpDeltaT: number;
		notes: string;
	}[];
}

export const PRESET_USERS: Record<string, UserProfile> = {
	'nont@cyberpump.io': {
		id: 'usr_001',
		name: 'ธนาวัฒน์ (นนท์)',
		email: 'nont@cyberpump.io',
		avatar: 'TN',
		level: 'Science Lifter (Hypertrophy Specialist)',
		targetMuscle: 'Biceps Brachii (Long & Short Head)',
		weightKg: 12.5,
		totalSessions: 34,
		streakDays: 6,
		joinedDate: '1 สิงหาคม 2026',
		personalRecords: {
			maxCleanReps: 24,
			highestVolumeKg: 300,
			longestTutSec: 48,
			peakEmgUv: 520,
			bestRomDeg: 126,
			lowestCheatPercent: 4.2
		},
		weeklyVolume: [
			{ week: 'W1 (ส.ค.)', clean: 680, cheated: 210 },
			{ week: 'W2 (ส.ค.)', clean: 740, cheated: 160 },
			{ week: 'W3 (ส.ค.)', clean: 810, cheated: 110 },
			{ week: 'W4 (ก.ย.)', clean: 880, cheated: 75 },
			{ week: 'W5 (สัปดาห์นี้)', clean: 950, cheated: 40 }
		],
		formProgression: [
			{ session: '12 ส.ค.', purity: 72, rom: 112, emg: 340 },
			{ session: '19 ส.ค.', purity: 78, rom: 115, emg: 370 },
			{ session: '26 ส.ค.', purity: 84, rom: 118, emg: 410 },
			{ session: '4 ก.ย.', purity: 89, rom: 122, emg: 450 },
			{ session: '11 ก.ย.', purity: 94, rom: 125, emg: 490 }
		],
		historyLogs: [
			{
				id: 'log_01',
				date: '11 ก.ย. 2026',
				exercise: 'Biceps Curl',
				weightKg: 12.5,
				sets: 3,
				totalReps: 24,
				cleanReps: 22,
				purity: 92,
				rom: 124,
				pumpDeltaT: 1.8,
				notes: 'เหยียดศอกได้ลึกขึ้น +6° ความเร็วคงที่ ไม่พบการโกงในเซตที่ 1 และ 2'
			},
			{
				id: 'log_02',
				date: '9 ก.ย. 2026',
				exercise: 'Biceps Curl',
				weightKg: 12.5,
				sets: 3,
				totalReps: 23,
				cleanReps: 18,
				purity: 78,
				rom: 118,
				pumpDeltaT: 1.4,
				notes: 'พบการเหวี่ยงตัวเล็กน้อยช่วง 2 ครั้งสุดท้ายของเซตที่ 3'
			},
			{
				id: 'log_03',
				date: '6 ก.ย. 2026',
				exercise: 'Hammer Curl',
				weightKg: 12.5,
				sets: 3,
				totalReps: 21,
				cleanReps: 17,
				purity: 81,
				rom: 116,
				pumpDeltaT: 1.5,
				notes: 'แรงบีบมือเสถียร (FSR > 22N) ไหล่ไม่ยก'
			}
		]
	},

	'karn@cyberpump.io': {
		id: 'usr_002',
		name: 'กานต์ กิตติธร',
		email: 'karn@cyberpump.io',
		avatar: 'KK',
		level: 'Novice Lifter (Form Correction Phase)',
		targetMuscle: 'Biceps Brachii & Grip Stability',
		weightKg: 10.0,
		totalSessions: 16,
		streakDays: 3,
		joinedDate: '15 สิงหาคม 2026',
		personalRecords: {
			maxCleanReps: 18,
			highestVolumeKg: 180,
			longestTutSec: 32,
			peakEmgUv: 390,
			bestRomDeg: 118,
			lowestCheatPercent: 8.5
		},
		weeklyVolume: [
			{ week: 'W1', clean: 350, cheated: 240 },
			{ week: 'W2', clean: 420, cheated: 180 },
			{ week: 'W3', clean: 510, cheated: 120 },
			{ week: 'W4', clean: 600, cheated: 70 }
		],
		formProgression: [
			{ session: '20 ส.ค.', purity: 58, rom: 104, emg: 280 },
			{ session: '27 ส.ค.', purity: 66, rom: 109, emg: 310 },
			{ session: '3 ก.ย.', purity: 74, rom: 114, emg: 350 },
			{ session: '10 ก.ย.', purity: 82, rom: 118, emg: 385 }
		],
		historyLogs: [
			{
				id: 'log_k1',
				date: '10 ก.ย. 2026',
				exercise: 'Biceps Curl',
				weightKg: 10.0,
				sets: 3,
				totalReps: 22,
				cleanReps: 18,
				purity: 82,
				rom: 118,
				pumpDeltaT: 1.2,
				notes: 'แก้อาการยกไหล่ช่วยได้ดีขึ้น Trapezius เข้ามาแทรกแซงน้อยลง'
			},
			{
				id: 'log_k2',
				date: '7 ก.ย. 2026',
				exercise: 'Biceps Curl',
				weightKg: 10.0,
				sets: 3,
				totalReps: 20,
				cleanReps: 14,
				purity: 70,
				rom: 112,
				pumpDeltaT: 1.0,
				notes: 'เริ่มล้าในเซตที่ 3 มีอาการเอนหลังช่วย'
			}
		]
	},

	'suphawit@cyberpump.io': {
		id: 'usr_003',
		name: 'ศุภวิชญ์ พัฒนศักดิ์',
		email: 'suphawit@cyberpump.io',
		avatar: 'SP',
		level: 'Advanced Power-Builder',
		targetMuscle: 'High Velocity Load & Peak Tension',
		weightKg: 17.5,
		totalSessions: 68,
		streakDays: 14,
		joinedDate: '10 กรกฎาคม 2026',
		personalRecords: {
			maxCleanReps: 32,
			highestVolumeKg: 560,
			longestTutSec: 64,
			peakEmgUv: 680,
			bestRomDeg: 132,
			lowestCheatPercent: 2.1
		},
		weeklyVolume: [
			{ week: 'W1', clean: 1100, cheated: 120 },
			{ week: 'W2', clean: 1250, cheated: 90 },
			{ week: 'W3', clean: 1380, cheated: 60 },
			{ week: 'W4', clean: 1520, cheated: 35 }
		],
		formProgression: [
			{ session: '15 ส.ค.', purity: 88, rom: 124, emg: 560 },
			{ session: '24 ส.ค.', purity: 91, rom: 126, emg: 590 },
			{ session: '2 ก.ย.', purity: 95, rom: 129, emg: 630 },
			{ session: '11 ก.ย.', purity: 97, rom: 132, emg: 680 }
		],
		historyLogs: [
			{
				id: 'log_s1',
				date: '11 ก.ย. 2026',
				exercise: 'Biceps Curl',
				weightKg: 17.5,
				sets: 4,
				totalReps: 32,
				cleanReps: 31,
				purity: 97,
				rom: 132,
				pumpDeltaT: 2.2,
				notes: 'ความเร็ว Concentric นิ่งมาก Terminal velocity loss 38% แตะจุด Failure สมบูรณ์'
			}
		]
	}
};

class CurrentUserManager {
	currentUser = $state<UserProfile>(PRESET_USERS['nont@cyberpump.io']);
	isLoggedIn = $state(true);

	switchUser(email: string) {
		if (PRESET_USERS[email]) {
			this.currentUser = PRESET_USERS[email];
			this.isLoggedIn = true;
		} else {
			// Create custom profile
			this.currentUser = {
				id: `usr_${Date.now().toString().slice(-4)}`,
				name: email.split('@')[0],
				email,
				avatar: 'ME',
				level: 'Dedicated Lifter',
				targetMuscle: 'Biceps Brachii',
				weightKg: 12.5,
				totalSessions: 1,
				streakDays: 1,
				joinedDate: new Date().toLocaleDateString('th-TH', {
					day: 'numeric',
					month: 'long',
					year: 'numeric'
				}),
				personalRecords: {
					maxCleanReps: 12,
					highestVolumeKg: 150,
					longestTutSec: 28,
					peakEmgUv: 420,
					bestRomDeg: 120,
					lowestCheatPercent: 5.0
				},
				weeklyVolume: [{ week: 'W1', clean: 150, cheated: 20 }],
				formProgression: [{ session: 'วันนี้', purity: 88, rom: 120, emg: 420 }],
				historyLogs: []
			};
			this.isLoggedIn = true;
		}
	}

	logout() {
		this.isLoggedIn = false;
	}
}

export const userManager = new CurrentUserManager();
