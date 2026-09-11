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
}

class WorkoutManager {
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

	private timerInterval: any = null;

	startSet() {
		if (this.timerInterval) clearInterval(this.timerInterval);
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
	}

	stopSet() {
		if (this.timerInterval) {
			clearInterval(this.timerInterval);
			this.timerInterval = null;
		}
		this.lastCompletedSet = {
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
			timestamp: new Date().toLocaleTimeString()
		};
		this.isSetRunning = false;
		this.fsmState = 'IDLE';
		this.activeCheatWarnings = [];
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
}

export const workout = new WorkoutManager();
