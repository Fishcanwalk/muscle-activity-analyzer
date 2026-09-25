// Counts reps from the sEMG envelope with a two-threshold (hysteresis) state machine.
//
// Input is one envelope sample at a time, already normalized to % of the user's
// calibrated MVC, so the same thresholds work for every lifter regardless of sensor
// gain or electrode placement. Kept free of SvelteKit/Node imports so it can be unit
// tested in isolation and ported to the ESP32 firmware as-is.
//
//   REST ──(%MVC ≥ onPct for debounceMs)──► CONTRACT
//   CONTRACT ──(%MVC < offPct for debounceMs)──► REST, and the contraction counts as a
//   rep if it lasted between minRepMs and maxRepMs (shorter = twitch, longer = a hold).

export interface EmgRepConfig {
	/** Contraction starts once the envelope rises to this % of MVC. */
	onPct: number;
	/** ...and ends once it falls back below this % of MVC. Must be below onPct. */
	offPct: number;
	/** Reps whose peak stays below this % of MVC are flagged as low activation. */
	peakPct: number;
	debounceMs: number;
	minRepMs: number;
	maxRepMs: number;
	/** Ignore new contractions for this long after a counted rep. */
	refractoryMs: number;
}

export const DEFAULT_EMG_REP_CONFIG: EmgRepConfig = {
	onPct: 35,
	offPct: 20,
	peakPct: 45,
	debounceMs: 150,
	minRepMs: 400,
	maxRepMs: 4000,
	refractoryMs: 300
};

export type EmgRepState = 'REST' | 'CONTRACT';

export interface EmgRepEvent {
	count: number;
	peakPct: number;
	peakUv: number;
	durationMs: number;
	/** Peak reached peakPct -- the muscle actually did the work. */
	isStrong: boolean;
}

export class EmgRepDetector {
	state: EmgRepState = 'REST';
	count = 0;

	private config: EmgRepConfig;
	private aboveMs = 0;
	private belowMs = 0;
	private contractMs = 0;
	private peakPct = 0;
	private peakUv = 0;
	private sinceLastRepMs = Number.POSITIVE_INFINITY;

	constructor(config: Partial<EmgRepConfig> = {}) {
		this.config = { ...DEFAULT_EMG_REP_CONFIG, ...config };
	}

	get currentConfig(): EmgRepConfig {
		return this.config;
	}

	setConfig(config: Partial<EmgRepConfig>) {
		this.config = { ...this.config, ...config };
	}

	reset() {
		this.state = 'REST';
		this.count = 0;
		this.aboveMs = 0;
		this.belowMs = 0;
		this.contractMs = 0;
		this.peakPct = 0;
		this.peakUv = 0;
		this.sinceLastRepMs = Number.POSITIVE_INFINITY;
	}

	/** Feeds one envelope sample covering `dtMs`; returns an event when a rep completes. */
	push(pct: number, uv: number, dtMs: number): EmgRepEvent | null {
		const c = this.config;
		this.sinceLastRepMs += dtMs;

		if (this.state === 'REST') {
			if (pct >= c.onPct && this.sinceLastRepMs >= c.refractoryMs) {
				if (this.aboveMs === 0) {
					this.peakPct = 0;
					this.peakUv = 0;
				}
				this.aboveMs += dtMs;
				this.trackPeak(pct, uv);
				if (this.aboveMs >= c.debounceMs) {
					this.state = 'CONTRACT';
					this.contractMs = this.aboveMs;
					this.belowMs = 0;
				}
			} else {
				this.aboveMs = 0;
			}
			return null;
		}

		this.contractMs += dtMs;
		this.trackPeak(pct, uv);
		if (pct >= c.offPct) {
			this.belowMs = 0;
			return null;
		}

		this.belowMs += dtMs;
		if (this.belowMs < c.debounceMs) return null;

		const durationMs = this.contractMs - this.belowMs;
		this.state = 'REST';
		this.aboveMs = 0;
		this.belowMs = 0;
		this.contractMs = 0;
		if (durationMs < c.minRepMs || durationMs > c.maxRepMs) return null;

		this.count += 1;
		this.sinceLastRepMs = 0;
		return {
			count: this.count,
			peakPct: Math.round(this.peakPct),
			peakUv: Math.round(this.peakUv),
			durationMs: Math.round(durationMs),
			isStrong: this.peakPct >= c.peakPct
		};
	}

	private trackPeak(pct: number, uv: number) {
		if (pct > this.peakPct) this.peakPct = pct;
		if (uv > this.peakUv) this.peakUv = uv;
	}
}
