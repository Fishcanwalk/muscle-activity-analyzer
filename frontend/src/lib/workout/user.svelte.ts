// NOTE: the mock PRESET_USERS / userManager (CurrentUserManager) / switchUser
// demo-profile system that used to live here has been removed. The real
// logged-in user (resolved server-side via GET /users/me) now drives
// WorkoutHeader.svelte / WorkoutDashboard.svelte -- see
// routes/(auth)/home/+page.server.ts, which passes it through as page data.
// The login page's demo quick-picker (routes/login/login-form.svelte) now
// keeps its own minimal, non-fabricated {email, name} list instead of
// importing mock profile data from here.
//
// UserProfile itself is kept: dashboard/+page.server.ts still builds real
// values (from actual session_results) into this same shape.
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
