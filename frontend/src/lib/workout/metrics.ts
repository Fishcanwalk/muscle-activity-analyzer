import type { components } from '$lib/api/paths/fastapi';

export type SetResult = components['schemas']['SessionResult'];

// The backend stores rep amplitude in raw µV (a lab unit, not something a gym user
// reads meaningfully); this converts to % of the MVC calibrated for that set's session
// (stored on each set as emgMvcUv), the same "% effort" scale the rest of the app
// displays. DEFAULT_MVC_UV is the uncalibrated default, used for sets saved without one.
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

// What every session's calibration starts from (mirrors the backend's DEFAULT_CALIBRATION).
export const DEFAULT_CALIBRATION: CalibrationValues = {
	emgBaseline: 0,
	emgMvc: DEFAULT_MVC_UV,
	fsrZero: 0,
	fsrMax: 4095,
	emgRepOnPct: 35,
	emgRepOffPct: 20,
	emgRepPeakPct: 45
};

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
	/** Highest rep sEMG peak, as % of the MVC calibrated for that set's session. */
	peakEmgPercent: number;
}

function setPeakEmgPercent(set: SetResult): number {
	const reps = set.reps ?? [];
	if (reps.length === 0) return 0;
	return uvToMvcPercent(Math.max(...reps.map((r) => r.peakEmg)), set.emgMvcUv ?? DEFAULT_MVC_UV);
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

	const sessions = [...groups.entries()].map(([id, group]) => buildSession(id, group));
	return sessions.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

/** Every given set rolled into one summary (e.g. a user's whole history), or null if none. */
export function summarizeSets(id: string, sets: SetResult[]): WorkoutSession | null {
	return sets.length ? buildSession(id, sets) : null;
}

function buildSession(id: string, group: SetResult[]): WorkoutSession {
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
		avgRomDeg: reps.length ? Math.round(reps.reduce((sum, r) => sum + r.rom, 0) / reps.length) : 0,
		peakEmgPercent: Math.max(0, ...ordered.map(setPeakEmgPercent))
	};
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

export interface MetricComparison {
	name: string;
	prev: string;
	curr: string;
	delta: string;
	isPositive: boolean;
}

function percentDelta(prev: number, curr: number): string {
	if (prev === 0) return curr === 0 ? '0% (คงที่)' : 'ใหม่';
	const pct = ((curr - prev) / prev) * 100;
	if (Math.abs(pct) < 0.05) return '0% (คงที่)';
	return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

function metric(
	name: string,
	prev: number,
	curr: number,
	unit: string,
	digits = 0
): MetricComparison {
	return {
		name,
		prev: `${prev.toFixed(digits)}${unit}`,
		curr: `${curr.toFixed(digits)}${unit}`,
		delta: percentDelta(prev, curr),
		// Every metric below is "higher is better".
		isPositive: curr >= prev
	};
}

/** Side-by-side metrics of two sessions of the same user, previous first. */
export function compareSessions(prev: WorkoutSession, curr: WorkoutSession): MetricComparison[] {
	return [
		metric('น้ำหนักสูงสุด (Load)', prev.maxWeightKg, curr.maxWeightKg, ' kg', 1),
		metric('Clean Reps (ไม่โกง)', prev.cleanReps, curr.cleanReps, ' ครั้ง'),
		metric('Form Purity (% ท่าคลีน)', prev.purityPercent, curr.purityPercent, '%'),
		metric(
			'Clean Volume (น้ำหนัก × ครั้งที่ไม่โกง)',
			prev.cleanVolumeKg,
			curr.cleanVolumeKg,
			' kg',
			1
		),
		metric('Average ROM (องศาข้อศอก)', prev.avgRomDeg, curr.avgRomDeg, '°'),
		metric('ออกแรงกล้ามเนื้อสูงสุด (% MVC)', prev.peakEmgPercent, curr.peakEmgPercent, '%'),
		metric('High-Tension TUT', prev.highTensionTutSeconds, curr.highTensionTutSeconds, ' วินาที', 1)
	];
}

/** One-line reading of what changed from `prev` to `curr`, and what to do about it. */
export function progressVerdict(prev: WorkoutSession, curr: WorkoutSession): string {
	const parts: string[] = [];
	const volumeDiff = curr.cleanVolumeKg - prev.cleanVolumeKg;
	parts.push(
		volumeDiff >= 0
			? `Clean Volume เพิ่มขึ้น ${volumeDiff.toFixed(1)} kg`
			: `Clean Volume ลดลง ${Math.abs(volumeDiff).toFixed(1)} kg`
	);
	const purityDiff = curr.purityPercent - prev.purityPercent;
	if (purityDiff !== 0) {
		parts.push(`ท่าคลีน${purityDiff > 0 ? 'ดีขึ้น' : 'ลดลง'} ${Math.abs(purityDiff)}%`);
	}
	const romDiff = curr.avgRomDeg - prev.avgRomDeg;
	if (romDiff !== 0) {
		parts.push(`ROM ${romDiff > 0 ? 'กว้างขึ้น' : 'แคบลง'} ${Math.abs(romDiff)}°`);
	}
	const verdict =
		volumeDiff > 0 && purityDiff >= 0
			? 'เป็น Progressive Overload ที่ไม่ได้มาจากการโกงท่า'
			: purityDiff < 0
				? 'ควรลดน้ำหนักหรือจำนวนครั้งลงเพื่อรักษาฟอร์ม'
				: 'รักษาความหนักเท่าเดิมและเน้นคุณภาพของแต่ละครั้ง';
	return `${parts.join(', ')} — ${verdict}`;
}
