import fastapiClient from '$lib/api/fastapi-client';
import {
	groupSetsIntoSessions,
	thaiDate,
	thaiShortDate,
	type SetResult,
	type WorkoutSession
} from './metrics';

export interface MetricComparison {
	name: string;
	prev: string;
	curr: string;
	delta: string;
	isPositive: boolean;
}

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
		isPositive: curr >= prev
	};
}

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
			metrics: [
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
				metric(
					'High-Tension TUT',
					prev.highTensionTutSeconds,
					curr.highTensionTutSeconds,
					' วินาที',
					1
				)
			] as MetricComparison[]
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
		const { prev, curr } = c;
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
		return `เทียบกับเซสชันก่อนหน้า: ${parts.join(', ')} — ${verdict}`;
	});

	async load() {
		this.status = 'loading';
		try {
			const setsRes = await fastapiClient.GET('/v1/sessions', {
				params: { query: { limit: 200 } }
			});
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
