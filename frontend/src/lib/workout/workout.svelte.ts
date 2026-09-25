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

/**
 * What counts reps during a set:
 * - camera: MediaPipe elbow-angle FSM (telemetry.updateFromMediaPipe)
 * - emg: server-side sEMG envelope detector (src/lib/server/emgRepDetector.ts)
 * - hybrid: the camera counts, and the rep only counts as clean if the sEMG peak
 *   during it reached the "real effort" threshold (catches momentum reps)
 */
export type RepSource = 'camera' | 'emg' | 'hybrid';

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
	repSource: RepSource;
	/** Client-side identity, used to track which sets saveSummary() already persisted. */
	localId: string;
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
const REP_SOURCE_STORAGE_KEY = 'workout.repSource';

// crypto.randomUUID() only exists in secure contexts (https / localhost), but the
// app is also opened over plain http on a LAN IP (see DEPLOYMENT.md).
function newId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export type WorkoutTab = 'readiness' | 'studio' | 'postset' | 'analytics' | 'calibration';

class WorkoutManager {
	activeTab = $state<WorkoutTab>('readiness');
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
	repSource = $state<RepSource>('camera');

	private timerInterval: any = null;
	private tabInitialized = false;
	// localIds of sets already POSTed. Tracked here rather than as a flag on the set:
	// lastCompletedSet and the matching setsInSession entry are separate $state
	// proxies, so a flag written through one is invisible through the other.
	private savedSetIds = new Set<string>();
	// In-flight saves, so a second save of the same set (e.g. "next set" clicked while
	// the automatic save from stopSet() is still running) waits instead of re-POSTing.
	private pendingSaves = new Map<string, Promise<{ success: boolean }>>();

	constructor() {
		if (typeof window !== 'undefined') {
			const stored = sessionStorage.getItem(SESSION_ID_STORAGE_KEY);
			if (stored) this.sessionId = stored;
			try {
				const source = localStorage.getItem(REP_SOURCE_STORAGE_KEY);
				if (source === 'camera' || source === 'emg' || source === 'hybrid') this.repSource = source;
			} catch {
				// Storage unavailable (private mode etc.) -- keep the default.
			}
		}
	}

	// Picks the tab Live Studio opens on, once per page load (later visits keep
	// whatever tab the lifter was on): back to the studio if a workout is already in
	// progress (sessionId survives a reload via sessionStorage), calibration if this
	// user has never calibrated, otherwise the pre-workout readiness check.
	initTab(isCalibrated: boolean) {
		if (this.tabInitialized) return;
		this.tabInitialized = true;
		if (this.isSetRunning || this.sessionId) this.activeTab = 'studio';
		else if (!isCalibrated) this.activeTab = 'calibration';
		else this.activeTab = 'readiness';
	}

	// Locked while a set is running so a set's reps all come from one source.
	setRepSource(source: RepSource) {
		if (this.isSetRunning) return;
		this.repSource = source;
		try {
			localStorage.setItem(REP_SOURCE_STORAGE_KEY, source);
		} catch {
			// Storage unavailable -- the choice just won't survive a reload.
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
			this.sessionId = newId();
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
			sessionId: this.sessionId,
			repSource: this.repSource,
			localId: newId()
		};
		this.lastCompletedSet = completedSet;
		this.setsInSession = [...this.setsInSession, completedSet];
		this.isSetRunning = false;
		this.fsmState = 'IDLE';
		this.activeCheatWarnings = [];

		this.postRecordingAction('stop');
		// Persist right away so the set survives even if the lifter never presses
		// "เริ่มเซตถัดไป"/"จบการออกกำลังกาย" (e.g. just switches tabs or closes the page).
		void this.saveSummary(completedSet, { silent: true });
	}

	// Aggregates every set completed since the last endWorkout() (or app start) into
	// a single session-level summary, then clears session state (sessionId,
	// sessionStorage, setsInSession, lastCompletedSet, set counter) so the next
	// startSet() begins a fresh workout.
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
		this.lastCompletedSet = null;
		this.currentSet = 1;

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

	// Called automatically by stopSet(), and again by PagePostSet.svelte's buttons,
	// saveAllPendingSets and handleRemoteButton. Idempotent: a set already in
	// savedSetIds (or currently being saved) is not re-POSTed.
	async saveSummary(summary: SetSummary, opts: { silent?: boolean } = {}): Promise<{ success: boolean }> {
		if (this.savedSetIds.has(summary.localId)) return { success: true };
		const pending = this.pendingSaves.get(summary.localId);
		if (pending) return pending;
		const save = this.postSummary(summary, opts);
		this.pendingSaves.set(summary.localId, save);
		try {
			return await save;
		} finally {
			this.pendingSaves.delete(summary.localId);
		}
	}

	private async postSummary(summary: SetSummary, opts: { silent?: boolean }): Promise<{ success: boolean }> {

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
			session_id: summary.sessionId,
			repSource: summary.repSource
		};

		const { error } = await fastapiClient.POST('/v1/sessions', { body });

		if (!error) this.savedSetIds.add(summary.localId);

		if (!opts.silent) {
			if (error) {
				toast.error('บันทึกผลเซตไปยังเซิร์ฟเวอร์ไม่สำเร็จ (บันทึกไว้ในเครื่องแล้ว)');
			} else {
				toast.success('บันทึกผลเซตสำเร็จ');
			}
		}

		return { success: !error };
	}

	// Saves every set completed so far this workout that hasn't been persisted yet.
	// Each set is already saved automatically by stopSet(), so this only retries sets
	// whose save failed (e.g. the server was unreachable). Called right before
	// endWorkout() so "จบการออกกำลังกาย" never silently discards a set.
	async saveAllPendingSets(): Promise<{ success: boolean }> {
		const pending = this.setsInSession.filter((s) => !this.savedSetIds.has(s.localId));
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
