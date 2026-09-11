<script lang="ts">
	import { telemetry } from '$lib/workout/telemetry.svelte';
	import { formatDec } from '$lib/utils/format';
	import { Gauge, Target, HandPalm, Heartbeat, ThermometerSimple, TrendDown } from 'phosphor-svelte';
</script>

<div class="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 font-sans text-zinc-100 antialiased">
	<!-- VBT Velocity Card (spans 2 columns on desktop) -->
	<div class="col-span-1 md:col-span-2 lg:col-span-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5 flex flex-col justify-between shadow-sm">
		<div class="flex items-center justify-between pb-2 border-b border-zinc-800/60">
			<div class="flex items-center gap-2">
				<span class="text-[10px] font-bold tracking-wider text-cyan-400 font-mono uppercase">
					MPU-6050 (ESP32)
				</span>
				<span class="text-zinc-600">·</span>
				<h4 class="text-xs font-semibold text-zinc-200">Velocity-Based Training (VBT)</h4>
			</div>
			<span
				class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase {telemetry.mpu
					.isEffectiveZone
					? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
					: 'border-zinc-700 bg-zinc-800 text-zinc-400'}"
			>
				{#if telemetry.mpu.isEffectiveZone}
					<Target size={11} weight="bold" class="text-emerald-400" />
					<span>Zone (30-40%)</span>
				{:else}
					<Gauge size={11} class="text-zinc-400" />
					<span>Regular</span>
				{/if}
			</span>
		</div>

		<div class="grid grid-cols-2 gap-2.5 py-2">
			<div class="rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-2.5">
				<div class="flex items-center justify-between text-zinc-400 text-[11px] mb-0.5 font-mono">
					<span>Concentric Velocity</span>
					<Gauge size={13} class="text-cyan-400" />
				</div>
				<div class="text-xl font-bold font-mono text-zinc-100">
					{formatDec(telemetry.mpu.concentricVelocity)} <span class="text-xs font-normal text-zinc-400 font-sans">m/s</span>
				</div>
			</div>

			<div class="rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-2.5">
				<div class="flex items-center justify-between text-zinc-400 text-[11px] mb-0.5 font-mono">
					<span>Velocity Loss</span>
					<TrendDown size={13} class={telemetry.mpu.velocityLossPercent >= 30 ? 'text-emerald-400' : 'text-zinc-400'} />
				</div>
				<div
					class="text-xl font-bold font-mono {telemetry.mpu.velocityLossPercent >= 30
						? 'text-emerald-400'
						: 'text-zinc-100'}"
				>
					{formatDec(telemetry.mpu.velocityLossPercent)} <span class="text-xs font-normal text-zinc-400 font-sans">%</span>
				</div>
			</div>
		</div>

		<!-- Velocity Loss Progress Bar -->
		<div class="relative mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
			<div
				class="h-full bg-gradient-to-r from-cyan-500 via-emerald-400 to-rose-500 transition-all duration-150"
				style="width: {Math.min(100, telemetry.mpu.velocityLossPercent)}%;"
			></div>
		</div>
	</div>

	<!-- FSR Grip Force Card (1 column) -->
	<div class="col-span-1 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5 flex flex-col justify-between shadow-sm">
		<div class="flex items-center justify-between pb-2 border-b border-zinc-800/60">
			<span class="text-[10px] font-mono font-bold text-cyan-400 uppercase">FSR A2 (Uno)</span>
			<HandPalm size={14} class="text-zinc-400" />
		</div>

		<div class="py-2">
			<div class="text-[11px] text-zinc-400 font-mono">Grip Force</div>
			<div class="text-2xl font-bold font-mono text-zinc-100 mt-0.5">
				{formatDec(telemetry.fsr.gripForce)} <span class="text-xs font-normal text-zinc-400 font-sans">N</span>
			</div>
		</div>

		<div class="space-y-1">
			<div class="flex justify-between text-[10px] font-mono">
				<span class="text-zinc-400">Stability</span>
				<span class="text-emerald-400 font-semibold">{formatDec(telemetry.fsr.gripStabilityPercent)}%</span>
			</div>
			<div class="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
				<div class="h-full bg-emerald-500 transition-all" style="width: {telemetry.fsr.gripStabilityPercent}%"></div>
			</div>
		</div>
	</div>

	<!-- MAX30102 / MLX90614 Vitals Card (1 column) -->
	<div class="col-span-1 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5 flex flex-col justify-between shadow-sm">
		<div class="flex items-center justify-between pb-2 border-b border-zinc-800/60">
			<span class="text-[10px] font-mono font-bold text-cyan-400 uppercase">MAX30102 / MLX</span>
			<Heartbeat size={14} class="text-rose-400" />
		</div>

		<div class="py-2">
			<div class="text-[11px] text-zinc-400 font-mono">Heart Rate</div>
			<div class="text-2xl font-bold font-mono text-zinc-100 mt-0.5">
				{formatDec(telemetry.vitals.heartRate)} <span class="text-xs font-normal text-zinc-400 font-sans">BPM</span>
			</div>
		</div>

		<div class="flex items-center justify-between pt-1.5 border-t border-zinc-800/80 text-[11px] font-mono">
			<span class="text-zinc-400 flex items-center gap-1">
				<ThermometerSimple size={13} class="text-amber-400" />
				Pump Temp:
			</span>
			<span class="text-amber-400 font-semibold">+{formatDec(telemetry.vitals.deltaTemp)}°C</span>
		</div>
	</div>
</div>
