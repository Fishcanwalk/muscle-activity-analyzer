<script lang="ts">
	import { telemetry } from '$lib/workout/telemetry.svelte';
	import { formatDec } from '$lib/utils/format';
	import { Gauge, HandPalm, Heartbeat } from 'phosphor-svelte';

	type Status = 'live' | 'stale' | 'never';
	const STATUS: Record<Status, { dot: string; label: string }> = {
		live: { dot: 'bg-emerald-500', label: 'ทำงาน' },
		stale: { dot: 'bg-amber-500', label: 'สัญญาณขาด' },
		never: { dot: 'bg-muted-foreground/40', label: 'ไม่พบเซนเซอร์' }
	};

	let cards = $derived([
		{ id: 'mpu', title: 'ความเร็ว rep ล่าสุด', icon: Gauge, status: telemetry.sensorStatus.mpu },
		{ id: 'fsr', title: 'แรงบีบมือ (% สูงสุด)', icon: HandPalm, status: telemetry.sensorStatus.fsr },
		{ id: 'vitals', title: 'หัวใจ', icon: Heartbeat, status: telemetry.sensorStatus.vitals }
	] as const);
</script>

<!-- Compact tiles, rendered straight into PageLiveStudio's stats row (no wrapper). -->
{#each cards as card (card.id)}
	<div class="rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
		<div class="flex items-center justify-between gap-2 text-xs text-muted-foreground">
			<span class="flex items-center gap-1.5">
				<card.icon size={14} />
				{card.title}
			</span>
			<span class={['h-2 w-2 shrink-0 rounded-full', STATUS[card.status].dot]} title={STATUS[card.status].label}></span>
		</div>

		{#if card.id === 'mpu'}
			<div class="text-3xl leading-tight font-bold tabular-nums text-foreground">
				{formatDec(telemetry.mpu.lastRepVelocity, 2)}<span class="text-sm font-normal text-muted-foreground"> m/s</span>
			</div>
			<div class={['text-xs', telemetry.mpu.isEffectiveZone ? 'font-semibold text-emerald-600' : 'text-muted-foreground']}>
				ช้าลงจาก rep แรก {Math.round(telemetry.mpu.velocityLossPercent)}%{telemetry.mpu.isEffectiveZone ? ' · โซนกระตุ้นดี' : ''}
			</div>
		{:else if card.id === 'fsr'}
			<div class="text-3xl leading-tight font-bold tabular-nums text-foreground">
				{Math.round(telemetry.fsr.gripPercent)}<span class="text-sm font-normal text-muted-foreground">%</span>
			</div>
			<div class={['text-xs', telemetry.fsr.isStable ? 'text-muted-foreground' : 'font-semibold text-amber-600']}>
				ความนิ่ง {Math.round(telemetry.fsr.gripStabilityPercent)}% · {telemetry.fsr.isStable ? 'นิ่ง' : 'ไม่นิ่ง'}
			</div>
		{:else}
			<div class="text-3xl leading-tight font-bold tabular-nums text-foreground">
				{telemetry.vitals.heartRate > 0 ? Math.round(telemetry.vitals.heartRate) : '–'}<span class="text-sm font-normal text-muted-foreground"> BPM</span>
			</div>
			<div class="text-xs text-muted-foreground tabular-nums">
				SpO₂ {telemetry.vitals.spO2 > 0 ? `${Math.round(telemetry.vitals.spO2)}%` : '–'} · ผิว {telemetry.vitals.skinTemp > 0 ? `${formatDec(telemetry.vitals.skinTemp, 1)}°C` : '–'}
			</div>
		{/if}
	</div>
{/each}
