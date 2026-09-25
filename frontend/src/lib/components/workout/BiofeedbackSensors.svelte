<script lang="ts">
	import { telemetry } from '$lib/workout/telemetry.svelte';
	import { formatDec, nToKg } from '$lib/utils/format';
	import { Gauge, HandPalm, Heartbeat } from 'phosphor-svelte';

	type Status = 'live' | 'stale' | 'never';
	const STATUS: Record<Status, { dot: string; label: string }> = {
		live: { dot: 'bg-emerald-500', label: 'ทำงาน' },
		stale: { dot: 'bg-amber-500', label: 'สัญญาณขาด' },
		never: { dot: 'bg-muted-foreground/40', label: 'ไม่พบเซนเซอร์' }
	};

	// Summary cards only -- the raw MPU axes live in PageLiveStudio's developer section.
	let cards = $derived([
		{ id: 'mpu', title: 'ความเร็วการยก', icon: Gauge, status: telemetry.sensorStatus.mpu },
		{ id: 'fsr', title: 'แรงบีบมือ', icon: HandPalm, status: telemetry.sensorStatus.fsr },
		{ id: 'vitals', title: 'หัวใจและร่างกาย', icon: Heartbeat, status: telemetry.sensorStatus.vitals }
	] as const);
</script>

<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
	{#each cards as card (card.id)}
		<div class="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm">
			<div class="flex items-center justify-between">
				<span class="flex items-center gap-2 text-sm font-semibold text-foreground">
					<card.icon size={18} class="text-muted-foreground" />
					{card.title}
				</span>
				<span class="flex items-center gap-1.5 text-xs text-muted-foreground">
					<span class={['h-2 w-2 rounded-full', STATUS[card.status].dot]}></span>
					{STATUS[card.status].label}
				</span>
			</div>

			{#if card.id === 'mpu'}
				<div class="text-3xl font-bold tabular-nums text-foreground">
					{formatDec(telemetry.mpu.concentricVelocity, 2)}
					<span class="text-base font-normal text-muted-foreground">m/s</span>
				</div>
				<div class="flex items-center justify-between text-sm">
					<span class="text-muted-foreground">ช้าลงจากครั้งแรก</span>
					<span
						class={[
							'font-semibold tabular-nums',
							telemetry.mpu.isEffectiveZone ? 'text-emerald-600' : 'text-foreground'
						]}
					>
						{Math.round(telemetry.mpu.velocityLossPercent)}%
					</span>
				</div>
				<div class="h-2 w-full overflow-hidden rounded-full bg-muted">
					<div
						class="h-full bg-linear-to-r from-cyan-500 via-emerald-500 to-rose-500 transition-all duration-150"
						style="width: {Math.min(100, telemetry.mpu.velocityLossPercent)}%;"
					></div>
				</div>
				<p class="text-xs text-muted-foreground">
					{telemetry.mpu.isEffectiveZone
						? 'อยู่ในโซนกระตุ้นกล้ามเนื้อที่ดี (ช้าลง 25–45%)'
						: 'เมื่อช้าลง 25–45% จากครั้งแรก คือช่วงที่กระตุ้นกล้ามเนื้อได้ดี'}
				</p>
			{:else if card.id === 'fsr'}
				<div class="text-3xl font-bold tabular-nums text-foreground">
					{formatDec(nToKg(telemetry.fsr.gripForce), 1)}
					<span class="text-base font-normal text-muted-foreground">กก.</span>
				</div>
				<div class="flex items-center justify-between text-sm">
					<span class="text-muted-foreground">ความนิ่งของมือ</span>
					<span
						class={[
							'font-semibold tabular-nums',
							telemetry.fsr.isStable ? 'text-emerald-600' : 'text-amber-600'
						]}
					>
						{Math.round(telemetry.fsr.gripStabilityPercent)}% · {telemetry.fsr.isStable ? 'นิ่ง' : 'ไม่นิ่ง'}
					</span>
				</div>
				<div class="h-2 w-full overflow-hidden rounded-full bg-muted">
					<div
						class="h-full bg-emerald-500 transition-all"
						style="width: {telemetry.fsr.gripStabilityPercent}%"
					></div>
				</div>
			{:else}
				<div class="text-3xl font-bold tabular-nums text-foreground">
					{telemetry.vitals.heartRate > 0 ? Math.round(telemetry.vitals.heartRate) : '–'}
					<span class="text-base font-normal text-muted-foreground">BPM</span>
				</div>
				<dl class="grid grid-cols-3 gap-2 text-sm">
					<div>
						<dt class="text-xs text-muted-foreground">สูงสุด</dt>
						<dd class="font-semibold tabular-nums">{Math.round(telemetry.vitals.peakHr) || '–'}</dd>
					</div>
					<div>
						<dt class="text-xs text-muted-foreground">ออกซิเจน</dt>
						<dd class="font-semibold tabular-nums">
							{telemetry.vitals.spO2 > 0 ? `${Math.round(telemetry.vitals.spO2)}%` : '–'}
						</dd>
					</div>
					<div>
						<dt class="text-xs text-muted-foreground">อุณหภูมิผิว</dt>
						<dd class="font-semibold tabular-nums">
							{telemetry.vitals.skinTemp > 0 ? `${formatDec(telemetry.vitals.skinTemp, 1)}°C` : '–'}
						</dd>
					</div>
				</dl>
			{/if}
		</div>
	{/each}
</div>
