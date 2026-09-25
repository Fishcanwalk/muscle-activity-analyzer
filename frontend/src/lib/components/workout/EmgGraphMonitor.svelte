<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { telemetry } from '$lib/workout/telemetry.svelte';
	import { EMG_BUFFER_SIZE } from '$lib/telemetry-constants';
	import { Play, Pause, Pulse, ArrowClockwise } from 'phosphor-svelte';

	let canvasElement: HTMLCanvasElement | null = $state(null);
	let animationFrameId: number | null = null;

	// Display settings
	let gain = $state<number>(1); // 1x, 2x, 0.5x
	let timeWindowSec = $state<number>(4); // 2s, 4s, 8s
	let isPaused = $state<boolean>(false);

	// Running metrics
	let peakUv = $state<number>(0);
	let meanRms = $state<number>(0);
	let rmsHistory: number[] = [];

	// Amplitudes arrive on a µV-like scale; users see them as % of their calibrated MVC.
	const toPct = (uv: number) => Math.round((uv / (telemetry.serverCalibration.emgMvc || 1)) * 100);
	let peakPercent = $derived(Math.min(999, toPct(peakUv)));
	let meanPercent = $derived(toPct(meanRms));

	// Local buffer for rendering, kept in sync with the server's rolling EMG buffer
	// (same size, shared via EMG_BUFFER_SIZE) so every sample that arrives gets drawn.
	const BUFFER_SIZE = EMG_BUFFER_SIZE;
	let waveBuffer: number[] = Array(BUFFER_SIZE).fill(0);

	// Runs once per incoming telemetry batch (not once per animation frame), so every
	// sample the server sent is captured instead of only the single latest value.
	$effect(() => {
		const incoming = telemetry.emg.rawBuffer;
		if (isPaused || incoming.length === 0) return;

		waveBuffer =
			incoming.length >= BUFFER_SIZE
				? incoming.slice(-BUFFER_SIZE)
				: [...Array(BUFFER_SIZE - incoming.length).fill(0), ...incoming];

		const currentRms = telemetry.emg.rms;
		rmsHistory.push(currentRms);
		if (rmsHistory.length > 50) rmsHistory.shift();

		meanRms = Math.round(rmsHistory.reduce((a, b) => a + b, 0) / rmsHistory.length);
		if (currentRms > peakUv) peakUv = currentRms;
	});

	function updateWaveform() {
		drawCanvas();
		animationFrameId = requestAnimationFrame(updateWaveform);
	}

	function drawCanvas() {
		if (!canvasElement) return;
		const ctx = canvasElement.getContext('2d');
		if (!ctx) return;

		const width = canvasElement.width;
		const height = canvasElement.height;
		const left = 45;
		const bottom = height - 4;
		const plotH = bottom - 6;

		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, width, height);

		// The module's SIG output is already an envelope (≥ 0), so the trace is drawn
		// one-sided from the bottom and scaled in % of this user's calibrated MVC -- the
		// same units the rep thresholds use, so the lines below are exactly what counts.
		const cal = telemetry.serverCalibration;
		const mvcUv = cal.emgMvc || 1;
		const maxPct = 120 / gain;
		const yOf = (pct: number) => bottom - (Math.min(pct, maxPct) / maxPct) * plotH;

		ctx.lineWidth = 1;
		ctx.font = '12px ui-sans-serif, sans-serif';
		ctx.textAlign = 'right';
		const gridStep = maxPct > 150 ? 50 : 25;
		for (let pct = 0; pct <= maxPct; pct += gridStep) {
			const y = yOf(pct);
			ctx.strokeStyle = pct === 0 ? 'rgba(0, 0, 0, 0.18)' : 'rgba(0, 0, 0, 0.06)';
			ctx.beginPath();
			ctx.moveTo(left, y);
			ctx.lineTo(width, y);
			ctx.stroke();
			ctx.fillStyle = '#71717a';
			ctx.fillText(`${pct}%`, left - 6, y + 3);
		}

		const timeSteps = 8;
		for (let j = 1; j <= timeSteps; j++) {
			const x = left + ((width - left) / timeSteps) * j;
			ctx.strokeStyle = 'rgba(0, 0, 0, 0.04)';
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, bottom);
			ctx.stroke();
		}

		// Rep-counting thresholds (emgRepDetector.ts): start / end of a contraction and
		// the "real effort" peak a clean rep must reach.
		const thresholds = [
			{ pct: cal.emgRepPeakPct, color: '#7c3aed', dash: [2, 3], label: `ออกแรงจริง ${cal.emgRepPeakPct}%` },
			{ pct: cal.emgRepOnPct, color: '#059669', dash: [6, 4], label: `เริ่มเกร็ง ${cal.emgRepOnPct}%` },
			{ pct: cal.emgRepOffPct, color: '#d97706', dash: [6, 4], label: `จบ rep ${cal.emgRepOffPct}%` }
		];
		ctx.textAlign = 'left';
		ctx.font = '12px ui-sans-serif, sans-serif';
		for (const t of thresholds) {
			const y = yOf(t.pct);
			ctx.setLineDash(t.dash);
			ctx.strokeStyle = t.color;
			ctx.beginPath();
			ctx.moveTo(left, y);
			ctx.lineTo(width, y);
			ctx.stroke();
			ctx.fillStyle = t.color;
			ctx.fillText(t.label, width - 120, y - 4);
		}
		ctx.setLineDash([]);

		const stepX = (width - left) / (waveBuffer.length - 1);
		const contracting = telemetry.emgRep.state === 'CONTRACT';

		ctx.beginPath();
		ctx.moveTo(left, bottom);
		for (let i = 0; i < waveBuffer.length; i++) {
			ctx.lineTo(left + i * stepX, yOf((Math.max(0, waveBuffer[i]) / mvcUv) * 100));
		}
		ctx.lineTo(width, bottom);
		ctx.closePath();
		ctx.fillStyle = contracting ? 'rgba(16, 185, 129, 0.18)' : 'rgba(16, 185, 129, 0.08)';
		ctx.fill();

		ctx.beginPath();
		ctx.lineWidth = 1.8;
		ctx.strokeStyle = contracting ? '#047857' : '#059669';
		for (let i = 0; i < waveBuffer.length; i++) {
			const x = left + i * stepX;
			const y = yOf((Math.max(0, waveBuffer[i]) / mvcUv) * 100);
			if (i === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		}
		ctx.stroke();
	}

	function resetPeak() {
		peakUv = telemetry.emg.rms;
	}

	const STATUS = {
		live: { dot: 'bg-emerald-500', label: 'สัญญาณปกติ' },
		stale: { dot: 'bg-amber-500', label: 'สัญญาณขาด' },
		never: { dot: 'bg-muted-foreground/40', label: 'ไม่พบเซนเซอร์' }
	} as const;

	const ZOOMS = [
		{ value: 0.5, label: '0.5×', title: 'ซูมออก' },
		{ value: 1, label: '1×', title: 'ขนาดปกติ' },
		{ value: 2, label: '2×', title: 'ซูมเข้า' }
	];

	onMount(() => {
		// Auto-resize canvas buffer to actual CSS pixels
		if (canvasElement) {
			canvasElement.width = canvasElement.parentElement?.clientWidth || 700;
			canvasElement.height = 240;
		}

		window.addEventListener('resize', () => {
			if (canvasElement && canvasElement.parentElement) {
				canvasElement.width = canvasElement.parentElement.clientWidth;
			}
		});

		animationFrameId = requestAnimationFrame(updateWaveform);
	});

	onDestroy(() => {
		if (animationFrameId) cancelAnimationFrame(animationFrameId);
	});
</script>

<div class="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h3 class="flex items-center gap-2 text-base font-semibold text-foreground">
				<Pulse size={18} class="text-emerald-600" />
				คลื่นกล้ามเนื้อ (sEMG)
			</h3>
			<p class="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
				<span class={['h-2 w-2 rounded-full', STATUS[telemetry.sensorStatus.emg].dot]}></span>
				{STATUS[telemetry.sensorStatus.emg].label}
			</p>
		</div>
		<span
			class={[
				'rounded-full px-3 py-1 text-sm font-semibold',
				telemetry.emgRep.state === 'CONTRACT'
					? 'bg-emerald-500/15 text-emerald-700'
					: 'bg-muted text-muted-foreground'
			]}
			title="สถานะตัวนับ rep จาก EMG"
		>
			{telemetry.emgRep.state === 'CONTRACT' ? 'กำลังเกร็ง' : 'พัก'} · {telemetry.emgRep.count} rep
		</span>
	</div>

	<div class="flex flex-wrap items-center justify-between gap-2 text-sm">
		<span class="text-muted-foreground">
			สูงสุด <strong class="tabular-nums text-foreground">{Math.round(peakPercent)}%</strong>
			· เฉลี่ย <strong class="tabular-nums text-foreground">{Math.round(meanPercent)}%</strong>
			<span class="text-xs">ของแรงสูงสุด</span>
		</span>
		<div class="flex items-center gap-1.5">
			<div class="flex rounded-md border border-border bg-muted/60 p-0.5" role="group" aria-label="ซูมกราฟ">
				{#each ZOOMS as z (z.value)}
					<button
						type="button"
						onclick={() => (gain = z.value)}
						title={z.title}
						class={[
							'rounded px-2 py-0.5 text-xs transition',
							gain === z.value
								? 'bg-background font-semibold text-foreground shadow-sm'
								: 'text-muted-foreground hover:text-foreground'
						]}
					>
						{z.label}
					</button>
				{/each}
			</div>
			<button
				type="button"
				onclick={() => (isPaused = !isPaused)}
				class="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted"
			>
				{#if isPaused}
					<Play size={12} weight="fill" /> เล่นต่อ
				{:else}
					<Pause size={12} weight="fill" /> หยุดภาพ
				{/if}
			</button>
			<button
				type="button"
				onclick={resetPeak}
				class="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
				title="รีเซ็ตค่าสูงสุด"
			>
				<ArrowClockwise size={13} />
			</button>
		</div>
	</div>

	<div class="relative w-full overflow-hidden rounded-lg border border-border bg-background">
		<canvas bind:this={canvasElement} height="240" class="block w-full"></canvas>
	</div>
</div>
