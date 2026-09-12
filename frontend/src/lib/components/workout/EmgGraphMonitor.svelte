<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { telemetry } from '$lib/workout/telemetry.svelte';
	import { formatDec } from '$lib/utils/format';
	import {
		Lightning,
		Play,
		Pause,
		ArrowsOut,
		Clock,
		Sliders,
		CheckCircle,
		Pulse,
		Cpu,
		ArrowClockwise,
		Copy,
		Check
	} from 'phosphor-svelte';

	let canvasElement: HTMLCanvasElement | null = $state(null);
	let animationFrameId: number | null = null;

	// Display settings
	let gain = $state<number>(1); // 1x, 2x, 0.5x
	let timeWindowSec = $state<number>(4); // 2s, 4s, 8s
	let isPaused = $state<boolean>(false);
	let showApiHelper = $state<boolean>(false);
	let copiedCurl = $state<boolean>(false);

	// Running metrics
	let peakUv = $state<number>(0);
	let meanRms = $state<number>(0);
	let rmsHistory: number[] = [];

	// Local buffer for smooth rendering
	const BUFFER_SIZE = 200;
	let waveBuffer: number[] = Array(BUFFER_SIZE).fill(0);

	function updateWaveform() {
		if (isPaused) {
			animationFrameId = requestAnimationFrame(updateWaveform);
			return;
		}

		// Pull latest from telemetry
		const currentRaw = telemetry.emg.rawBuffer[telemetry.emg.rawBuffer.length - 1] ?? 0;
		const currentRms = telemetry.emg.rms;

		waveBuffer.shift();
		waveBuffer.push(currentRaw);

		rmsHistory.push(currentRms);
		if (rmsHistory.length > 50) rmsHistory.shift();

		meanRms = Math.round(rmsHistory.reduce((a, b) => a + b, 0) / rmsHistory.length);
		if (currentRms > peakUv) peakUv = currentRms;

		drawCanvas();
		animationFrameId = requestAnimationFrame(updateWaveform);
	}

	function drawCanvas() {
		if (!canvasElement) return;
		const ctx = canvasElement.getContext('2d');
		if (!ctx) return;

		const width = canvasElement.width;
		const height = canvasElement.height;
		const centerY = height / 2;

		// Clear canvas with dark zinc background
		ctx.fillStyle = '#09090b';
		ctx.fillRect(0, 0, width, height);

		// Grid lines & scales — telemetry.emg values are µV per docs/sensor_usage.md
		const maxDisplayUv = 600 / gain;
		const gridSteps = 4;
		ctx.lineWidth = 1;

		for (let i = -gridSteps; i <= gridSteps; i++) {
			const y = centerY + (i * (height / 2)) / gridSteps;
			const uvValue = Math.round((-i * maxDisplayUv) / gridSteps);

			ctx.strokeStyle = i === 0 ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.04)';
			ctx.beginPath();
			ctx.moveTo(45, y);
			ctx.lineTo(width, y);
			ctx.stroke();

			// Voltage scale labels
			ctx.fillStyle = i === 0 ? '#a1a1aa' : '#52525b';
			ctx.font = '10px ui-monospace, monospace';
			ctx.textAlign = 'right';
			ctx.fillText(`${uvValue >= 0 ? '+' : ''}${uvValue}µV`, 40, y + 3);
		}

		// Vertical time grid lines
		const timeSteps = 8;
		for (let j = 1; j <= timeSteps; j++) {
			const x = 45 + ((width - 45) / timeSteps) * j;
			ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, height);
			ctx.stroke();
		}

		// Reference Lines: High Tension (280 µV per docs/sensor_usage.md) & MVC (500 µV)
		const tensionY = centerY - (280 / maxDisplayUv) * (height / 2);
		ctx.setLineDash([4, 4]);
		ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
		ctx.beginPath();
		ctx.moveTo(45, tensionY);
		ctx.lineTo(width, tensionY);
		ctx.stroke();

		ctx.fillStyle = '#10b981';
		ctx.font = '9px ui-monospace, monospace';
		ctx.textAlign = 'left';
		ctx.fillText('HIGH TENSION (280µV)', width - 120, tensionY - 4);
		ctx.setLineDash([]);

		// Draw RMS Envelope area
		ctx.beginPath();
		const stepX = (width - 45) / (waveBuffer.length - 1);
		ctx.moveTo(45, centerY);

		for (let i = 0; i < waveBuffer.length; i++) {
			const x = 45 + i * stepX;
			const val = waveBuffer[i];
			const scaledVal = (Math.abs(val) / maxDisplayUv) * (height / 2);
			const y = centerY - Math.min(height / 2 - 2, scaledVal);
			ctx.lineTo(x, y);
		}
		ctx.lineTo(width, centerY);
		ctx.closePath();
		ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
		ctx.fill();

		// Draw Raw sEMG Waveform
		ctx.beginPath();
		ctx.lineWidth = 1.8;
		ctx.strokeStyle = telemetry.emg.isHighTension ? '#10b981' : '#34d399';
		ctx.shadowColor = telemetry.emg.isHighTension ? 'rgba(16, 185, 129, 0.6)' : 'transparent';
		ctx.shadowBlur = telemetry.emg.isHighTension ? 8 : 0;

		for (let i = 0; i < waveBuffer.length; i++) {
			const x = 45 + i * stepX;
			const val = waveBuffer[i];
			const scaledVal = (val / maxDisplayUv) * (height / 2);
			const y = centerY - Math.max(-height / 2 + 2, Math.min(height / 2 - 2, scaledVal));

			if (i === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		}
		ctx.stroke();
		ctx.shadowBlur = 0; // reset
	}

	function resetPeak() {
		peakUv = telemetry.emg.rms;
	}

	function copyCurlCode() {
		const code = `curl -X POST http://localhost:5174/api/emg \\
  -H "Content-Type: application/json" \\
  -d '{"raw": 2200, "rms": 285.5, "mvcPercent": 52, "board": "esp32"}'`;
		navigator.clipboard.writeText(code);
		copiedCurl = true;
		setTimeout(() => (copiedCurl = false), 2000);
	}

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

<div class="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3 font-sans antialiased text-zinc-100">
	<!-- Header & Status Row -->
	<div class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
		<div class="flex items-center gap-2.5">
			<div class="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-emerald-400">
				<Pulse size={18} weight="bold" />
			</div>
			<div>
				<div class="flex items-center gap-2">
					<h3 class="text-sm font-bold text-zinc-100 uppercase tracking-wide">sEMG Real-Time Waveform</h3>
					<span class="flex items-center gap-1 px-2 py-0.2 rounded text-[10px] font-mono {telemetry.isWsConnected ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-800 text-zinc-400 border border-zinc-700'}">
						<span class="w-1.5 h-1.5 rounded-full {telemetry.isWsConnected ? 'bg-emerald-500' : 'bg-zinc-500'}"></span>
						{telemetry.isWsConnected ? 'HARDWARE LIVE' : 'HARDWARE OFFLINE'}
					</span>
				</div>
				<p class="text-[11px] text-zinc-400 font-mono">
					Dual-trace: Raw AC Microvolts (µV) & RMS Envelope
				</p>
			</div>
		</div>

		<!-- Control Buttons -->
		<div class="flex items-center gap-1.5 font-mono text-xs">
			<!-- Gain Selector -->
			<div class="flex items-center rounded-lg border border-zinc-800 bg-zinc-950 p-0.5 text-[11px]">
				<button
					type="button"
					onclick={() => (gain = 0.5)}
					class="px-2 py-1 rounded transition {gain === 0.5 ? 'bg-zinc-800 text-zinc-100 font-bold' : 'text-zinc-400 hover:text-zinc-200'}"
					title="Zoom Out (±1000µV)"
				>
					0.5x
				</button>
				<button
					type="button"
					onclick={() => (gain = 1)}
					class="px-2 py-1 rounded transition {gain === 1 ? 'bg-zinc-800 text-zinc-100 font-bold' : 'text-zinc-400 hover:text-zinc-200'}"
					title="Default (±500µV)"
				>
					1x
				</button>
				<button
					type="button"
					onclick={() => (gain = 2)}
					class="px-2 py-1 rounded transition {gain === 2 ? 'bg-zinc-800 text-zinc-100 font-bold' : 'text-zinc-400 hover:text-zinc-200'}"
					title="Zoom In (±250µV)"
				>
					2x
				</button>
			</div>

			<!-- Pause / Run -->
			<button
				type="button"
				onclick={() => (isPaused = !isPaused)}
				class="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-800 bg-zinc-950 hover:bg-zinc-850 text-zinc-300 transition"
			>
				{#if isPaused}
					<Play size={12} weight="fill" class="text-emerald-400" />
					<span>Run</span>
				{:else}
					<Pause size={12} weight="fill" class="text-amber-400" />
					<span>Freeze</span>
				{/if}
			</button>

			<!-- Reset Peak -->
			<button
				type="button"
				onclick={resetPeak}
				class="p-1.5 rounded-lg border border-zinc-800 bg-zinc-950 hover:bg-zinc-850 text-zinc-400 hover:text-zinc-200 transition"
				title="Reset Peak"
			>
				<ArrowClockwise size={13} />
			</button>

			<!-- API Docs Drawer Toggle -->
			<button
				type="button"
				onclick={() => (showApiHelper = !showApiHelper)}
				class="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-800 bg-zinc-950 hover:bg-zinc-800 text-zinc-300 transition text-[11px]"
			>
				<Cpu size={13} class="text-cyan-400" />
				<span>API</span>
			</button>
		</div>
	</div>

	<!-- Instant Metric Badges (High Contrast, Minimal Text) -->
	<div class="grid grid-cols-2 gap-2 font-mono">
		<!-- Current RMS -->
		<div class="p-2.5 rounded-lg bg-zinc-950/80 border border-zinc-800/80">
			<div class="text-[10px] text-zinc-400 uppercase">Current RMS</div>
			<div class="text-xl font-bold {telemetry.emg.isHighTension ? 'text-emerald-400' : 'text-zinc-100'}">
				{formatDec(telemetry.emg.rms)} <span class="text-xs font-normal text-zinc-400 font-sans">µV</span>
			</div>
			<div class="text-[10px] {telemetry.emg.isHighTension ? 'text-emerald-400' : 'text-zinc-400'}">
				{telemetry.emg.isHighTension ? 'HIGH TENSION' : 'BASELINE NOISE'}
			</div>
		</div>

		<!-- Peak Amplitude -->
		<div class="p-2.5 rounded-lg bg-zinc-950/80 border border-zinc-800/80">
			<div class="text-[10px] text-zinc-400 uppercase">Peak Contraction</div>
			<div class="text-xl font-bold text-zinc-100">
				{formatDec(peakUv)} <span class="text-xs font-normal text-zinc-400 font-sans">µV</span>
			</div>
			<div class="text-[10px] text-zinc-400">SESSION MAX</div>
		</div>

		<!-- Activation % MVC -->
		<div class="p-2.5 rounded-lg bg-zinc-950/80 border border-zinc-800/80">
			<div class="text-[10px] text-zinc-400 uppercase">Activation %MVC</div>
			<div class="text-xl font-bold text-cyan-400">
				{formatDec(telemetry.emg.mvcPercent)}<span class="text-xs font-normal text-zinc-400">%</span>
			</div>
			<div class="w-full h-1 rounded-full bg-zinc-800 mt-1 overflow-hidden">
				<div class="h-full bg-cyan-400 transition-all duration-100" style="width: {telemetry.emg.mvcPercent}%"></div>
			</div>
		</div>

		<!-- Mean RMS -->
		<div class="p-2.5 rounded-lg bg-zinc-950/80 border border-zinc-800/80">
			<div class="text-[10px] text-zinc-400 uppercase">Mean Window</div>
			<div class="text-xl font-bold text-zinc-100">
				{formatDec(meanRms)} <span class="text-xs font-normal text-zinc-400 font-sans">µV</span>
			</div>
			<div class="text-[10px] text-zinc-400">50-SAMPLE ROLLING</div>
		</div>

		<!-- Signal Quality / Rate -->
		<!-- <div class="p-2.5 rounded-lg bg-zinc-950/80 border border-zinc-800/80">
			<div class="text-[10px] text-zinc-400 uppercase">Stream Rate</div>
			<div class="text-xl font-bold text-emerald-400">
				{telemetry.streamHz} <span class="text-xs font-normal text-zinc-400 font-sans">Hz</span>
			</div>
			<div class="text-[10px] text-zinc-400">20ms PACKET INTERVAL</div>
		</div> -->
	</div>

	<!-- Oscilloscope Canvas Container -->
	<div class="relative w-full rounded-lg border border-zinc-800/90 overflow-hidden bg-[#09090b]">
		<canvas bind:this={canvasElement} height="240" class="w-full block"></canvas>
	</div>

	<!-- Collapsible API Usage Instructions -->
	{#if showApiHelper}
		<div class="p-3 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2 text-xs font-mono">
			<div class="flex items-center justify-between text-zinc-300 font-bold">
				<span>API ENDPOINT FOR SENDING SENSOR DATA</span>
				<button
					type="button"
					onclick={copyCurlCode}
					class="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] transition"
				>
					{#if copiedCurl}
						<Check size={12} class="text-emerald-400" />
						<span class="text-emerald-400">Copied!</span>
					{:else}
						<Copy size={12} />
						<span>Copy curl</span>
					{/if}
				</button>
			</div>

			<div class="p-2.5 rounded bg-zinc-900/90 border border-zinc-800/80 text-[11px] text-emerald-400 overflow-x-auto select-all">
				POST /api/emg
				<br />
				Content-Type: application/json
				<br />
				{JSON.stringify({ raw: 2200, rms: 285.5, mvcPercent: 52, board: 'esp32' }, null, 2)}
			</div>

			<div class="text-[11px] text-zinc-400">
				<strong>raw</strong> is the sensor's native ADC count (0-4095); the server converts it to µV. <strong>rms</strong>/<strong>mvcPercent</strong>, if provided, are used as-is (already µV / %MVC).
				<br />
				<strong>All-in-one Multi-Sensor:</strong> <code>POST /api/telemetry</code> (accepts EMG, FSR grip, MPU6050, MAX30102).
				<br />
				<strong>Live SSE Stream:</strong> <code>GET /api/telemetry/stream</code> (subscribes to 50Hz continuous push).
			</div>
		</div>
	{/if}
</div>
