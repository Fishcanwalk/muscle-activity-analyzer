import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { UserProfile } from '$lib/workout/user.svelte';
import type { components } from '$lib/api/paths/fastapi';
import {
	groupSetsIntoSessions,
	thaiDate,
	thaiShortDate,
	type SetResult,
	type WorkoutSession
} from '$lib/workout/metrics';

type ApiUser = components['schemas']['User'];

const LEVEL_TIERS: { min: number; label: string }[] = [
	{ min: 30, label: 'Dedicated Lifter' },
	{ min: 10, label: 'Intermediate Lifter' },
	{ min: 1, label: 'Novice Lifter' },
	{ min: 0, label: 'New Member' }
];

function levelFromSessionCount(count: number): string {
	return LEVEL_TIERS.find((tier) => count >= tier.min)?.label ?? 'New Member';
}

function initialsFromName(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return '??';
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[1][0]).toUpperCase();
}

function isoWeekLabel(iso: string): string {
	const d = new Date(iso);
	const monday = new Date(d);
	monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
	return monday.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

function computeStreakDays(sets: SetResult[]): number {
	const days = [...new Set(sets.map((s) => s.created_at.slice(0, 10)))].sort().reverse();
	if (days.length === 0) return 0;
	let streak = 1;
	const cursor = new Date(days[0]);
	for (let i = 1; i < days.length; i++) {
		cursor.setUTCDate(cursor.getUTCDate() - 1);
		if (days[i] === cursor.toISOString().slice(0, 10)) {
			streak++;
		} else {
			break;
		}
	}
	return streak;
}

function mostFrequent(values: string[]): string {
	if (values.length === 0) return '-';
	const counts = new Map<string, number>();
	for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
	return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function buildDashboardProfile(user: ApiUser, setsDescRaw: SetResult[]): UserProfile {
	const setsDesc = setsDescRaw.map((s) => ({ ...s, reps: s.reps ?? [] }));
	const sets = [...setsDesc].reverse(); // chronological ascending
	// Sets grouped by session_id -- "sessions" everywhere below means whole workouts,
	// not individual sets (each set is its own document in the backend).
	const sessions: WorkoutSession[] = groupSetsIntoSessions(sets);

	const allReps = sets.flatMap((s) => s.reps);
	const cheatPercents = sets
		.filter((s) => s.totalReps > 0)
		.map((s) => (s.cheatedReps / s.totalReps) * 100);

	// Per-set records (the UI labels these "Tonnage/set", "Strict form", ...).
	const personalRecords = {
		maxCleanReps: sets.length ? Math.max(...sets.map((s) => s.cleanReps)) : 0,
		highestVolumeKg: sets.length
			? Math.round(Math.max(...sets.map((s) => s.weightKg * s.cleanReps)))
			: 0,
		longestTutSec: sets.length ? Math.max(...sets.map((s) => s.highTensionTutSeconds)) : 0,
		// Each session's own calibration, so this compares effort not raw signal level.
		peakEmgPercent: sessions.length ? Math.max(...sessions.map((s) => s.peakEmgPercent)) : 0,
		bestRomDeg: allReps.length ? Math.round(Math.max(...allReps.map((r) => r.rom))) : 0,
		lowestCheatPercent: cheatPercents.length ? Math.round(Math.min(...cheatPercents) * 10) / 10 : 0
	};

	const weekBuckets = new Map<string, { week: string; clean: number; cheated: number }>();
	for (const s of sets) {
		const label = isoWeekLabel(s.created_at);
		const bucket = weekBuckets.get(label) ?? { week: label, clean: 0, cheated: 0 };
		bucket.clean += s.weightKg * s.cleanReps;
		bucket.cheated += s.weightKg * s.cheatedReps;
		weekBuckets.set(label, bucket);
	}
	const weeklyVolume = [...weekBuckets.values()].slice(-8);

	const formProgression = sessions.slice(-10).map((s) => ({
		id: s.id,
		session: thaiShortDate(s.startedAt),
		purity: s.purityPercent,
		rom: s.avgRomDeg,
		emgPercent: s.peakEmgPercent
	}));

	const historyLogs = [...sessions]
		.reverse()
		.slice(0, 30)
		.map((s) => ({
			id: s.id,
			date: thaiDate(s.startedAt),
			exercise: s.exercises.join(', '),
			weightKg: s.maxWeightKg,
			sets: s.sets.length,
			totalReps: s.totalReps,
			cleanReps: s.cleanReps,
			purity: s.purityPercent,
			rom: s.avgRomDeg,
			notes: ''
		}));

	const latestSet = setsDesc[0];

	return {
		id: user.id,
		name: user.name,
		email: user.email,
		avatar: user.avatar || initialsFromName(user.name),
		level: levelFromSessionCount(sessions.length),
		targetMuscle: mostFrequent(sets.map((s) => s.exercise)),
		weightKg: latestSet?.weightKg ?? 0,
		totalSessions: sessions.length,
		streakDays: computeStreakDays(setsDesc),
		joinedDate: thaiDate(user.created_at),
		personalRecords,
		weeklyVolume,
		formProgression,
		historyLogs
	};
}

export const load: PageServerLoad = async (event) => {
	const { data: apiUser, error: userError } = await event.locals.fastapiClient.GET('/users/me');
	if (userError || !apiUser) {
		throw error(401, 'Not authenticated');
	}

	const { data: sets } = await event.locals.fastapiClient.GET('/v1/sessions', {
		params: { query: { limit: 200 } }
	});

	return { user: buildDashboardProfile(apiUser, sets ?? []) };
};
