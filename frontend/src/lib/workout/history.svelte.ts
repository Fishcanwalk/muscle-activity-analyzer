import fastapiClient from '$lib/api/fastapi-client';
import {
	compareSessions,
	groupSetsIntoSessions,
	progressVerdict,
	thaiDate,
	thaiShortDate,
	type SetResult,
	type WorkoutSession
} from './metrics';

export interface SessionTrendPoint {
	id: string;
	session: string;
	weight: number;
	cleanReps: number;
	purity: number;
	/** % of each session's own calibrated MVC, not the raw µV the sensor/backend use. */
	sEmgRms: number;
	rom: number;
	cleanVolume: number;
}

export type HistoryRange = 'last5' | 'last30days' | 'all';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Loaded from the backend (GET /v1/sessions) every time the Analytics tab mounts,
// so sets saved earlier in the same workout show up without a page reload.
class HistoryManager {
	status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
	sets = $state.raw<SetResult[]>([]);

	exerciseFilter = $state<string>('all');
	range = $state<HistoryRange>('last5');

	exercises = $derived([...new Set(this.sets.map((s) => s.exercise))].sort());

	sessions = $derived.by((): WorkoutSession[] => {
		const filtered =
			this.exerciseFilter === 'all'
				? this.sets
				: this.sets.filter((s) => s.exercise === this.exerciseFilter);
		const sessions = groupSetsIntoSessions(filtered);
		if (this.range === 'last5') return sessions.slice(-5);
		if (this.range === 'last30days') {
			const cutoff = Date.now() - THIRTY_DAYS_MS;
			return sessions.filter((s) => new Date(s.startedAt).getTime() >= cutoff);
		}
		return sessions;
	});

	sessionsTrend = $derived<SessionTrendPoint[]>(
		this.sessions.map((s) => ({
			id: s.id,
			session: thaiShortDate(s.startedAt),
			weight: s.maxWeightKg,
			cleanReps: s.cleanReps,
			purity: s.purityPercent,
			sEmgRms: s.peakEmgPercent,
			rom: s.avgRomDeg,
			cleanVolume: s.cleanVolumeKg
		}))
	);

	/** Latest session vs the one before it; null until there are at least two. */
	comparison = $derived.by(() => {
		const n = this.sessions.length;
		if (n < 2) return null;
		const prev = this.sessions[n - 2];
		const curr = this.sessions[n - 1];
		return {
			previousDate: thaiDate(prev.startedAt),
			currentDate: thaiDate(curr.startedAt),
			prev,
			curr,
			metrics: compareSessions(prev, curr)
		};
	});

	takeawayNote = $derived.by(() => {
		if (this.status === 'loading' || this.status === 'idle') return 'กำลังโหลดข้อมูล...';
		if (this.status === 'error') return 'โหลดประวัติการฝึกจากเซิร์ฟเวอร์ไม่สำเร็จ';
		const c = this.comparison;
		if (!c) {
			return this.sessions.length === 0
				? 'ยังไม่มีประวัติการฝึก เริ่มเซตแรกได้ที่ Live Studio'
				: 'ต้องมีอย่างน้อย 2 เซสชันจึงจะเปรียบเทียบพัฒนาการได้';
		}
		return `เทียบกับเซสชันก่อนหน้า: ${progressVerdict(c.prev, c.curr)}`;
	});

	async load() {
		this.status = 'loading';
		try {
			const setsRes = await fastapiClient.GET('/v1/sessions', { params: { query: { limit: 200 } } });
			if (setsRes.error || !setsRes.data) {
				this.status = 'error';
				return;
			}
			this.sets = setsRes.data;
			this.status = 'ready';
		} catch {
			// Network failure (openapi-fetch throws rather than returning `error`).
			this.status = 'error';
		}
	}
}

export const history = new HistoryManager();
