import { history } from './history.svelte';
import fastapiClient from '$lib/api/fastapi-client';
import { toast } from 'svelte-sonner';

export interface RepRecord {
	repNumber: number;
	concentricVelocity: number;
	rom: number;
	isClean: boolean;
	cheatReason: string | null;
	peakEmg: number;
	velocityLossPercent: number;
}

export interface SetSummary {
	setNumber: number;
	exercise: string;
	weightKg: number;
	durationSeconds: number;
	totalReps: number;
	cleanReps: number;
	cheatedReps: number;
	formPurityPercent: number;
	effectiveReps: number;
	highTensionTutSeconds: number;
	reps: RepRecord[];
	timestamp: string;
	sessionId: string | null;
	/** True once this set has been persisted to the backend via saveSummary(). */
	saved?: boolean;
}

export interface SessionSummary {
	sessionId: string;
	totalSets: number;
	exercises: string[];
	totalReps: number;
	cleanReps: number;
	totalVolumeKg: number;
	avgFormPurityPercent: number;
}

const SESSION_ID_STORAGE_KEY = 'workout.sessionId';

class WorkoutManager {
	activeTab = $state<'readiness' | 'studio' | 'postset' | 'analytics' | 'calibration'>('studio');
	exercise = $state('Biceps Curl');
	weightKg = $state(12.5);
	currentSet = $state(1);
	totalSets = $state(3);
	isSetRunning = $state(false);
	setDurationSeconds = $state(0);

	totalReps = $state(0);
	cleanReps = $state(0);
	cheatedReps = $state(0);
	formPurityPercent = $state(100);
	fsmState = $state<'IDLE' | 'START' | 'INFLECTION' | 'PEAK' | 'COMPLETION'>('IDLE');
	effectiveReps = $state(0);
	activeCheatWarnings = $state<string[]>([]);
	highTensionTutSeconds = $state(0);
	repsInSet = $state<RepRecord[]>([]);
	lastCompletedSet = $state<SetSummary | null>(null);

	sessionId = $state<string | null>(null);
	setsInSession = $state<SetSummary[]>([]);

	private timerInterval: any = null;

	constructor() {
		if (typeof window !== 'undefined') {
			const stored = sessionStorage.getItem(SESSION_ID_STORAGE_KEY);
			if (stored) this.sessionId = stored;
		}
	}

	private postRecordingAction(action: 'start' | 'stop') {
		if (typeof window === 'undefined') return;
		fetch('/api/recording', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action, sessionId: this.sessionId })
		}).catch((err) => {
			console.warn(`[Workout] Failed to ${action} recording`, err);
		});
	}

	startSet() {
		if (this.timerInterval) clearInterval(this.timerInterval);

		if (!this.sessionId) {
			this.sessionId = crypto.randomUUID();
			if (typeof window !== 'undefined') {
				sessionStorage.setItem(SESSION_ID_STORAGE_KEY, this.sessionId);
			}
		}

		this.isSetRunning = true;
		this.setDurationSeconds = 0;
		this.totalReps = 0;
		this.cleanReps = 0;
		this.cheatedReps = 0;
		this.formPurityPercent = 100;
		this.fsmState = 'START';
		this.effectiveReps = 0;
		this.highTensionTutSeconds = 0;
		this.activeCheatWarnings = [];
		this.repsInSet = [];

		this.timerInterval = setInterval(() => {
			if (this.isSetRunning) {
				this.setDurationSeconds += 1;
			}
		}, 1000);

		this.postRecordingAction('start');
	}

	stopSet() {
		if (this.timerInterval) {
			clearInterval(this.timerInterval);
			this.timerInterval = null;
		}
		const completedSet: SetSummary = {
			setNumber: this.currentSet,
			exercise: this.exercise,
			weightKg: this.weightKg,
			durationSeconds: this.setDurationSeconds,
			totalReps: this.totalReps,
			cleanReps: this.cleanReps,
			cheatedReps: this.cheatedReps,
			formPurityPercent: this.formPurityPercent,
			effectiveReps: this.effectiveReps,
			highTensionTutSeconds: this.highTensionTutSeconds,
			reps: [...this.repsInSet],
			timestamp: new Date().toLocaleTimeString(),
			sessionId: this.sessionId
		};
		this.lastCompletedSet = completedSet;
		this.setsInSession = [...this.setsInSession, completedSet];
		this.isSetRunning = false;
		this.fsmState = 'IDLE';
		this.activeCheatWarnings = [];

		this.postRecordingAction('stop');
	}

	// Aggregates every set completed since the last endWorkout() (or app start) into
	// a single session-level summary, then clears session state (sessionId,
	// sessionStorage, setsInSession) so the next startSet() begins a fresh workout.
	endWorkout(): SessionSummary {
		const sets = this.setsInSession;
		const sessionId = this.sessionId;

		const summary: SessionSummary = {
			sessionId: sessionId ?? '',
			totalSets: sets.length,
			exercises: [...new Set(sets.map((s) => s.exercise))],
			totalReps: sets.reduce((sum, s) => sum + s.totalReps, 0),
			cleanReps: sets.reduce((sum, s) => sum + s.cleanReps, 0),
			totalVolumeKg: sets.reduce((sum, s) => sum + s.weightKg * s.cleanReps, 0),
			avgFormPurityPercent: sets.length
				? Math.round(sets.reduce((sum, s) => sum + s.formPurityPercent, 0) / sets.length)
				: 0
		};

		this.sessionId = null;
		if (typeof window !== 'undefined') {
			sessionStorage.removeItem(SESSION_ID_STORAGE_KEY);
		}
		this.setsInSession = [];

		return summary;
	}

	nextSet() {
		this.currentSet += 1;
		this.totalReps = 0;
		this.cleanReps = 0;
		this.cheatedReps = 0;
		this.formPurityPercent = 100;
		this.fsmState = 'IDLE';
		this.effectiveReps = 0;
		this.highTensionTutSeconds = 0;
		this.activeCheatWarnings = [];
		this.repsInSet = [];
	}

	recordRep(rep: {
		isClean: boolean;
		concentricVelocity: number;
		rom: number;
		cheatReason: string | null;
		peakEmg: number;
		velocityLossPercent: number;
	}) {
		this.totalReps += 1;
		if (rep.isClean) this.cleanReps += 1;
		else this.cheatedReps += 1;
		this.formPurityPercent = Math.round((this.cleanReps / this.totalReps) * 100);

		const isEffective = rep.isClean && rep.velocityLossPercent >= 25;
		if (isEffective) this.effectiveReps += 1;

		this.repsInSet.push({
			repNumber: this.totalReps,
			concentricVelocity: Number(rep.concentricVelocity.toFixed(2)),
			rom: Math.round(rep.rom),
			isClean: rep.isClean,
			cheatReason: rep.cheatReason,
			peakEmg: Math.round(rep.peakEmg),
			velocityLossPercent: Math.round(rep.velocityLossPercent)
		});

		this.fsmState = 'COMPLETION';
	}

	incrementTut(seconds = 0.02) {
		this.highTensionTutSeconds = Number((this.highTensionTutSeconds + seconds).toFixed(1));
	}

	// Shared by saveAllPendingSets below (PagePostSet.svelte's "เริ่มเซตถัดไป" /
	// "จบการออกกำลังกาย" buttons, with a mock fallback summary for the demo view)
	// and handleRemoteButton below (real summary only) so both save identically.
	// Idempotent: a set already marked `saved` is skipped instead of re-POSTed, so
	// calling this again for a set the lifter already moved past is a no-op.
	async saveSummary(summary: SetSummary, opts: { silent?: boolean } = {}): Promise<{ success: boolean }> {
		if (summary.saved) return { success: true };

		history.addCompletedSession({
			session: new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }),
			weight: summary.weightKg,
			cleanReps: summary.cleanReps,
			purity: summary.formPurityPercent,
			sEmgRms: 74,
			rom: 123,
			cleanVolume: summary.weightKg * summary.cleanReps
		});

		// Built as a standalone variable (not an inline literal) so extra fields like
		// session_id -- present on the backend model but not yet reflected in the
		// generated OpenAPI types until the client is regenerated -- don't trip
		// TypeScript's excess-property check on object literals.
		const body = {
			setNumber: summary.setNumber,
			exercise: summary.exercise,
			weightKg: summary.weightKg,
			durationSeconds: summary.durationSeconds,
			totalReps: summary.totalReps,
			cleanReps: summary.cleanReps,
			cheatedReps: summary.cheatedReps,
			formPurityPercent: summary.formPurityPercent,
			effectiveReps: summary.effectiveReps,
			highTensionTutSeconds: summary.highTensionTutSeconds,
			reps: summary.reps,
			timestamp: summary.timestamp,
			session_id: summary.sessionId
		};

		const { error } = await fastapiClient.POST('/v1/sessions', { body });

		if (!error) summary.saved = true;

		if (!opts.silent) {
			if (error) {
				toast.error('บันทึกผลเซตไปยังเซิร์ฟเวอร์ไม่สำเร็จ (บันทึกไว้ในเครื่องแล้ว)');
			} else {
				toast.success('บันทึกผลเซตสำเร็จ');
			}
		}

		return { success: !error };
	}

	// Saves every set completed so far this workout that hasn't been persisted yet
	// (each already saved silently when the lifter moved to the next set -- see
	// PagePostSet.svelte's handleNextSet -- so normally this only has the most
	// recent set left to save). Called right before endWorkout() so "จบการออกกำลังกาย"
	// can never silently discard a set the way it used to.
	async saveAllPendingSets(): Promise<{ success: boolean }> {
		const pending = this.setsInSession.filter((s) => !s.saved);
		if (pending.length === 0) return { success: true };

		let allOk = true;
		for (const set of pending) {
			const { success } = await this.saveSummary(set, { silent: true });
			if (!success) allOk = false;
		}

		if (allOk) {
			toast.success(pending.length > 1 ? `บันทึกผลทั้ง ${pending.length} เซตสำเร็จ` : 'บันทึกผลเซตสำเร็จ');
		} else {
			toast.error('บันทึกผลบางเซตไปยังเซิร์ฟเวอร์ไม่สำเร็จ (บันทึกไว้ในเครื่องแล้ว)');
		}

		return { success: allOk };
	}

	// Driven by the ESP32's physical buttons (GPIO32/33) over the telemetry SSE
	// channel -- see telemetry.svelte.ts's 'button' event listener. Mirrors the
	// exact actions the on-screen buttons trigger (see PageLiveStudio/PagePostSet).
	//
	// Button A: a 3-press cycle -- start set -> stop set (go to summary) -> start
	// the next set immediately (skipping the extra "เริ่มเซตถัดไป" click, but still
	// saving the finished set the same way that click does).
	// Button B: stop the current set (if running) and save it with a visible toast,
	// the same save that "จบการออกกำลังกาย" now performs silently before ending.
	async handleRemoteButton(id: 'a' | 'b') {
		if (id === 'a') {
			if (this.isSetRunning) {
				this.stopSet();
				this.activeTab = 'postset';
			} else if (this.activeTab === 'postset') {
				if (this.lastCompletedSet) await this.saveSummary(this.lastCompletedSet, { silent: true });
				this.nextSet();
				this.startSet();
				this.activeTab = 'studio';
			} else {
				this.startSet();
				this.activeTab = 'studio';
			}
			return;
		}

		if (this.isSetRunning) this.stopSet();
		if (!this.lastCompletedSet) {
			toast.warning('ยังไม่มีเซตให้บันทึก');
			return;
		}
		await this.saveSummary(this.lastCompletedSet);
		this.activeTab = 'analytics';
	}
}

export const workout = new WorkoutManager();
