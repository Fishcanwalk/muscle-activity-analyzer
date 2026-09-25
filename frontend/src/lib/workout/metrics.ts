import type { components } from '$lib/api/paths/fastapi';

export type SetResult = components['schemas']['SessionResult'];

// The backend stores rep amplitude in raw µV (a lab unit, not something a gym user
// reads meaningfully); this converts to % of the user's calibrated MVC, the same
// "% effort" scale the rest of the app displays. DEFAULT_MVC_UV mirrors the backend's
// default calibration (backend/app/routers/calibration.py) for users who never calibrated.
export const DEFAULT_MVC_UV = 550;

export interface CalibrationValues {
	emgBaseline: number;
	emgMvc: number;
	fsrZero: number;
	fsrMax: number;
	/** EMG rep-counting thresholds, % of emgMvc (see src/lib/server/emgRepDetector.ts). */
	emgRepOnPct: number;
	emgRepOffPct: number;
	emgRepPeakPct: number;
}

// Mirrors backend/app/routers/calibration.py's DEFAULT_CALIBRATION -- what
// GET /v1/calibration returns for a user who has never saved one.
export const DEFAULT_CALIBRATION: CalibrationValues = {
	emgBaseline: 0,
	emgMvc: DEFAULT_MVC_UV,
	fsrZero: 0,
	fsrMax: 4095,
	emgRepOnPct: 35,
	emgRepOffPct: 20,
	emgRepPeakPct: 45
};

// Only the sensor readings count -- adjusting the rep thresholds alone isn't calibrating.
export function isDefaultCalibration(
	cal: Pick<CalibrationValues, 'emgBaseline' | 'emgMvc' | 'fsrZero' | 'fsrMax'>
): boolean {
	return (
		cal.emgBaseline === DEFAULT_CALIBRATION.emgBaseline &&
		cal.emgMvc === DEFAULT_CALIBRATION.emgMvc &&
		cal.fsrZero === DEFAULT_CALIBRATION.fsrZero &&
		cal.fsrMax === DEFAULT_CALIBRATION.fsrMax
	);
}

export function uvToMvcPercent(uv: number, emgMvcUv: number): number {
	return Math.round((uv / (emgMvcUv || DEFAULT_MVC_UV)) * 100);
}

// One workout session = every set POSTed with the same session_id (see
// workout.svelte.ts's startSet/endWorkout). Sets saved without one fall back to
// being their own single-set session.
export interface WorkoutSession {
	id: string;
	startedAt: string;
	exercises: string[];
	sets: SetResult[];
	maxWeightKg: number;
	totalReps: number;
	cleanReps: number;
	cheatedReps: number;
	purityPercent: number;
	cleanVolumeKg: number;
	highTensionTutSeconds: number;
	avgRomDeg: number;
	peakEmgUv: number;
}

/** Groups sets into sessions, returned in chronological (oldest-first) order. */
export function groupSetsIntoSessions(sets: SetResult[]): WorkoutSession[] {
	const groups = new Map<string, SetResult[]>();
	for (const set of sets) {
		const key = set.session_id || set.id;
		const group = groups.get(key);
		if (group) group.push(set);
		else groups.set(key, [set]);
	}

	const sessions = [...groups.entries()].map(([id, group]): WorkoutSession => {
		const ordered = [...group].sort((a, b) => a.created_at.localeCompare(b.created_at));
		const reps = ordered.flatMap((s) => s.reps ?? []);
		const totalReps = ordered.reduce((sum, s) => sum + s.totalReps, 0);
		const cleanReps = ordered.reduce((sum, s) => sum + s.cleanReps, 0);
		return {
			id,
			startedAt: ordered[0].created_at,
			exercises: [...new Set(ordered.map((s) => s.exercise))],
			sets: ordered,
			maxWeightKg: Math.max(...ordered.map((s) => s.weightKg)),
			totalReps,
			cleanReps,
			cheatedReps: ordered.reduce((sum, s) => sum + s.cheatedReps, 0),
			purityPercent: totalReps > 0 ? Math.round((cleanReps / totalReps) * 100) : 0,
			cleanVolumeKg: ordered.reduce((sum, s) => sum + s.weightKg * s.cleanReps, 0),
			highTensionTutSeconds: Number(
				ordered.reduce((sum, s) => sum + s.highTensionTutSeconds, 0).toFixed(1)
			),
			avgRomDeg: reps.length
				? Math.round(reps.reduce((sum, r) => sum + r.rom, 0) / reps.length)
				: 0,
			peakEmgUv: reps.length ? Math.max(...reps.map((r) => r.peakEmg)) : 0
		};
	});

	return sessions.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export function thaiDate(iso: string): string {
	return new Date(iso).toLocaleDateString('th-TH', {
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	});
}

export function thaiShortDate(iso: string): string {
	return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}
