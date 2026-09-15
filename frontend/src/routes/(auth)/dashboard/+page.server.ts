import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { UserProfile } from '$lib/workout/user.svelte';
import type { components } from '$lib/api/paths/fastapi';

type ApiUser = components['schemas']['User'];
type SessionResult = components['schemas']['SessionResult'];

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

function thaiDate(iso: string): string {
	return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isoWeekLabel(iso: string): string {
	const d = new Date(iso);
	const monday = new Date(d);
	monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
	return monday.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

function computeStreakDays(sessions: SessionResult[]): number {
	const days = [...new Set(sessions.map((s) => s.created_at.slice(0, 10)))].sort().reverse();
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

function buildDashboardProfile(user: ApiUser, sessionsDescRaw: SessionResult[]): UserProfile {
	const sessionsDesc = sessionsDescRaw.map((s) => ({ ...s, reps: s.reps ?? [] }));
	const sessions = [...sessionsDesc].reverse(); // chronological ascending

	const allReps = sessions.flatMap((s) => s.reps);
	const cheatPercents = sessions
		.filter((s) => s.totalReps > 0)
		.map((s) => (s.cheatedReps / s.totalReps) * 100);

	const personalRecords = {
		maxCleanReps: sessions.length ? Math.max(...sessions.map((s) => s.cleanReps)) : 0,
		highestVolumeKg: sessions.length
			? Math.round(Math.max(...sessions.map((s) => s.weightKg * s.cleanReps)))
			: 0,
		longestTutSec: sessions.length ? Math.max(...sessions.map((s) => s.highTensionTutSeconds)) : 0,
		peakEmgUv: allReps.length ? Math.round(Math.max(...allReps.map((r) => r.peakEmg))) : 0,
		bestRomDeg: allReps.length ? Math.round(Math.max(...allReps.map((r) => r.rom))) : 0,
		lowestCheatPercent: cheatPercents.length ? Math.round(Math.min(...cheatPercents) * 10) / 10 : 0
	};

	const weekBuckets = new Map<string, { week: string; clean: number; cheated: number }>();
	for (const s of sessions) {
		const label = isoWeekLabel(s.created_at);
		const bucket = weekBuckets.get(label) ?? { week: label, clean: 0, cheated: 0 };
		bucket.clean += s.weightKg * s.cleanReps;
		bucket.cheated += s.weightKg * s.cheatedReps;
		weekBuckets.set(label, bucket);
	}
	const weeklyVolume = [...weekBuckets.values()].slice(-8);

	const formProgression = sessions.slice(-10).map((s) => ({
		session: thaiDate(s.created_at).replace(/\s\d{4}$/, ''),
		purity: Math.round(s.formPurityPercent),
		rom: s.reps.length ? Math.round(s.reps.reduce((sum, r) => sum + r.rom, 0) / s.reps.length) : 0,
		emg: s.reps.length ? Math.round(Math.max(...s.reps.map((r) => r.peakEmg))) : 0
	}));

	const historyLogs = sessionsDesc.slice(0, 30).map((s) => ({
		id: s.id,
		date: thaiDate(s.created_at),
		exercise: s.exercise,
		weightKg: s.weightKg,
		sets: 1,
		totalReps: s.totalReps,
		cleanReps: s.cleanReps,
		purity: Math.round(s.formPurityPercent),
		rom: s.reps.length ? Math.round(s.reps.reduce((sum, r) => sum + r.rom, 0) / s.reps.length) : 0,
		pumpDeltaT: 0,
		notes: ''
	}));

	const latestSession = sessionsDesc[0];

	return {
		id: user.id,
		name: user.name,
		email: user.email,
		avatar: user.avatar || initialsFromName(user.name),
		level: levelFromSessionCount(sessions.length),
		targetMuscle: mostFrequent(sessions.map((s) => s.exercise)),
		weightKg: latestSession?.weightKg ?? 0,
		totalSessions: sessions.length,
		streakDays: computeStreakDays(sessionsDesc),
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

	const { data: sessions } = await event.locals.fastapiClient.GET('/v1/sessions', {
		params: { query: { limit: 200 } }
	});

	return {
		user: buildDashboardProfile(apiUser, sessions ?? [])
	};
};
