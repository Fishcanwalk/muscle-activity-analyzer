import { telemetry } from './telemetry.svelte';

const SAMPLE_INTERVAL_MS = 100;
// Caps memory growth: 10Hz * 60s * 20min = 12000 samples (~roughly matches EMG_BUFFER_SIZE-style caps elsewhere).
const MAX_SAMPLES = 12000;

export interface RecordingSample {
	elapsedMs: number;
	timestamp: number;
	emgRms: number;
	emgMvcPercent: number;
	fsrGripForceN: number;
	fsrGripStabilityPercent: number;
	mpuConcentricVelocity: number;
	mpuVelocityLossPercent: number;
	heartRateBpm: number;
	spO2: number;
	skinTempC: number;
}

class RecordingManager {
	isRecording = $state(false);
	startedAt = $state<number | null>(null);
	sampleCount = $state(0);
	durationMs = $state(0);
	capReached = $state(false);

	private samples: RecordingSample[] = [];
	private intervalId: ReturnType<typeof setInterval> | null = null;

	start() {
		if (this.isRecording) return;
		this.samples = [];
		this.sampleCount = 0;
		this.durationMs = 0;
		this.capReached = false;
		this.startedAt = Date.now();
		this.isRecording = true;
		this.intervalId = setInterval(() => this.captureSample(), SAMPLE_INTERVAL_MS);
	}

	stop() {
		if (!this.isRecording) return;
		this.isRecording = false;
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	get hasSamples() {
		return this.samples.length > 0;
	}

	private captureSample() {
		if (this.startedAt === null) return;
		if (this.samples.length >= MAX_SAMPLES) {
			this.capReached = true;
			this.stop();
			return;
		}
		const now = Date.now();
		this.samples.push({
			elapsedMs: now - this.startedAt,
			timestamp: now,
			emgRms: telemetry.emg.rms,
			emgMvcPercent: telemetry.emg.mvcPercent,
			fsrGripForceN: telemetry.fsr.gripForce,
			fsrGripStabilityPercent: telemetry.fsr.gripStabilityPercent,
			mpuConcentricVelocity: telemetry.mpu.concentricVelocity,
			mpuVelocityLossPercent: telemetry.mpu.velocityLossPercent,
			heartRateBpm: telemetry.vitals.heartRate,
			spO2: telemetry.vitals.spO2,
			skinTempC: telemetry.vitals.skinTemp
		});
		this.sampleCount = this.samples.length;
		this.durationMs = now - this.startedAt;
	}

	private filenameBase() {
		const iso = new Date(this.startedAt ?? Date.now()).toISOString().replace(/[:.]/g, '-');
		return `session-${iso}`;
	}

	private triggerDownload(blob: Blob, filename: string) {
		if (typeof document === 'undefined') return;
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
	}

	exportJson() {
		if (!this.hasSamples) return;
		const blob = new Blob([JSON.stringify(this.samples, null, 2)], { type: 'application/json' });
		this.triggerDownload(blob, `${this.filenameBase()}.json`);
	}

	exportCsv() {
		if (!this.hasSamples) return;
		const headers = Object.keys(this.samples[0]) as (keyof RecordingSample)[];
		const rows = this.samples.map((sample) =>
			headers
				.map((key) => (key === 'timestamp' ? new Date(sample[key]).toISOString() : sample[key]))
				.join(',')
		);
		const csv = [headers.join(','), ...rows].join('\n');
		const blob = new Blob([csv], { type: 'text/csv' });
		this.triggerDownload(blob, `${this.filenameBase()}.csv`);
	}
}

export const recording = new RecordingManager();
