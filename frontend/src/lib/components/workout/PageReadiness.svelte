<script lang="ts">
	import { readiness } from '$lib/workout/readiness.svelte';
	import { calibration } from '$lib/workout/calibration.svelte';
	import { telemetry } from '$lib/workout/telemetry.svelte';
	import { Heart, Droplets, Thermometer, CheckCircle2, XCircle, Circle, Zap, ArrowRight, AlertTriangle } from 'lucide-svelte';

	interface Props {
		onProceed: () => void;
		onGoCalibrate: () => void;
	}

	let { onProceed, onGoCalibrate }: Props = $props();

	const fmt = (n: number, suffix = '') => (n > 0 ? `${n}${suffix}` : '–');

	let hrBadge = $derived(
		readiness.restingHr === 0
			? { label: 'ไม่มีข้อมูล', tone: 'muted' }
			: readiness.restingHr <= 75
				? { label: 'Optimal (≤ 75)', tone: 'cyan' }
				: readiness.restingHr <= 80
					? { label: 'ปกติ (≤ 80)', tone: 'emerald' }
					: { label: 'สูงกว่าปกติ', tone: 'amber' }
	);
	let spo2Badge = $derived(
		readiness.restingSpo2 === 0
			? { label: 'ไม่มีข้อมูล', tone: 'muted' }
			: readiness.restingSpo2 >= 95
				? { label: 'Normal', tone: 'emerald' }
				: { label: 'ต่ำกว่าปกติ', tone: 'amber' }
	);
	// Score ring / status pill colour follows the result instead of always reading green.
	let scoreTone = $derived(
		readiness.overallScore === null
			? 'muted'
			: readiness.overallScore >= 92
				? 'emerald'
				: readiness.overallScore >= 85
					? 'amber'
					: 'rose'
	);
	const RING_CLASS: Record<string, string> = {
		muted: 'border-border text-muted-foreground',
		emerald: 'border-emerald-500 text-emerald-600 shadow-[0_0_20px_rgba(16,185,129,0.3)]',
		amber: 'border-amber-500 text-amber-600 shadow-[0_0_20px_rgba(245,158,11,0.3)]',
		rose: 'border-rose-500 text-rose-600 shadow-[0_0_20px_rgba(244,63,94,0.3)]'
	};
	const BADGE_CLASS: Record<string, string> = {
		muted: 'border-border bg-muted text-muted-foreground',
		cyan: 'border-cyan-500/40 bg-cyan-500/15 text-cyan-600',
		emerald: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-600',
		amber: 'border-amber-500/40 bg-amber-500/15 text-amber-600',
		rose: 'border-rose-500/40 bg-rose-500/15 text-rose-600'
	};

	// null = can't judge yet (no test run / no reading).
	let criteria = $derived([
		{
			id: 'cns',
			label: `CNS Readiness ≥ 85% (ปัจจุบัน ${readiness.cnsReadinessPercent === null ? '–' : `${readiness.cnsReadinessPercent}%`})`,
			pass: readiness.cnsReadinessPercent === null ? null : readiness.cnsReadinessPercent >= 85
		},
		{
			id: 'hr',
			label: `Resting Heart Rate ≤ 80 BPM (ปัจจุบัน ${fmt(readiness.restingHr, ' BPM')})`,
			pass: readiness.restingHr === 0 ? null : readiness.restingHr <= 80
		},
		{
			id: 'sensors',
			label: 'เซนเซอร์ส่งข้อมูลครบทุกตัว',
			pass: Object.values(telemetry.sensorStatus).every((s) => s === 'live')
		}
	]);

	function handleStartTest() {
		readiness.startGripTest();
	}
</script>

<div class="mx-auto flex max-w-6xl flex-col gap-6 p-6">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div>
			<h2 class="text-2xl font-black tracking-tight text-foreground">
				ขั้นที่ 2 · ตรวจความพร้อมก่อนฝึก
			</h2>
			<p class="text-sm text-muted-foreground">
				ตรวจเช็กความพร้อมของระบบประสาทส่วนกลาง (Central Nervous System) และสัญญาณชีพก่อนเริ่มยกเวท
			</p>
		</div>
		<button
			onclick={onProceed}
			class={[
				'flex items-center gap-2 rounded-lg px-5 py-2.5 font-bold transition-all',
				readiness.isComplete
					? 'bg-linear-to-r from-emerald-500 to-emerald-600 text-black shadow-lg shadow-emerald-500/20 hover:translate-y-[-1px] hover:shadow-emerald-500/30'
					: 'border border-border bg-card text-muted-foreground hover:text-foreground'
			]}
		>
			<span>{readiness.isComplete ? 'ถัดไป: เริ่มฝึกที่ Live Studio' : 'ข้ามการทดสอบ ไปที่ Live Studio'}</span>
			<ArrowRight class="h-4 w-4" />
		</button>
	</div>

	{#if !calibration.isCalibrated}
		<div
			class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-400"
		>
			<span class="flex items-center gap-2 font-semibold">
				<AlertTriangle class="h-4 w-4" />
				ยังไม่ได้ปรับเทียบเซนเซอร์ ค่าแรงบีบและ % การออกแรงอาจไม่แม่นยำ
			</span>
			<button
				onclick={onGoCalibrate}
				class="rounded-md border border-amber-500/50 px-3 py-1 font-bold hover:bg-amber-500/20"
			>
				ไปปรับเทียบก่อน
			</button>
		</div>
	{/if}

	<!-- AI Recommendation Card -->
	<div
		class="flex flex-wrap items-center gap-6 rounded-xl border border-emerald-500/30 bg-linear-to-r from-emerald-500/10 via-card to-cyan-500/5 p-6 shadow-xl"
	>
		<div class="flex min-w-[120px] flex-col items-center gap-2">
			<div
				class={['flex h-20 w-20 items-center justify-center rounded-full border-4 bg-card', RING_CLASS[scoreTone]]}
			>
				<span class="text-3xl font-black">{readiness.overallScore ?? '–'}</span>
				<span class="text-xs text-muted-foreground">/100</span>
			</div>
			<span
				class={['rounded-full border px-3 py-0.5 text-xs font-bold uppercase', BADGE_CLASS[scoreTone]]}
			>
				{readiness.statusLabel}
			</span>
		</div>
		<div class="flex-1">
			<h3 class="text-base font-bold text-foreground">คำแนะนำสำหรับวันนี้</h3>
			<p class="mt-1 text-sm text-muted-foreground leading-relaxed">
				{readiness.recommendation}
			</p>
			<div class="mt-3 flex flex-wrap gap-4 text-xs text-foreground font-medium">
				<span class="flex items-center gap-1.5 text-emerald-600">
					CNS Freshness: <strong>{readiness.cnsReadinessPercent === null ? '–' : `${readiness.cnsReadinessPercent}%`}</strong>
				</span>
				<span class="flex items-center gap-1.5 text-cyan-600">
					Resting HR: <strong>{fmt(readiness.restingHr, ' BPM')}</strong>
				</span>
				<span class="flex items-center gap-1.5 text-amber-600">
					Baseline Skin Temp: <strong>{fmt(readiness.baselineSkinTemp, '°C')}</strong>
				</span>
			</div>
		</div>
	</div>

	<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
		<!-- FSR Grip Squeeze Test Card -->
		<div class="flex flex-col justify-between rounded-xl border border-border bg-card p-6 shadow-md">
			<div>
				<h3 class="text-lg font-bold text-foreground">
					ทดสอบแรงบีบมือ
				</h3>
				<p class="mt-2 text-sm text-muted-foreground leading-relaxed">
					บีบเซนเซอร์ที่มือจับเต็มแรง 5 วินาที ถ้าแรงบีบต่ำกว่าปกติเกิน 10–15% แปลว่าร่างกายยังไม่ฟื้นตัวเต็มที่
				</p>

				<div class="mt-4 rounded-lg border border-border bg-background/50 p-4">
					<div class="grid grid-cols-3 gap-2 text-center">
						<div>
							<span class="text-xs text-muted-foreground">แรงบีบปัจจุบัน</span>
							<div class="text-xl font-black text-foreground">
								{readiness.currentGripKg} <span class="text-xs font-normal text-muted-foreground">kg</span>
							</div>
						</div>
						<div>
							<span class="text-xs text-muted-foreground">Peak สูงสุดวันนี้</span>
							<div class="text-xl font-black text-emerald-600">
								{readiness.peakGripKg} <span class="text-xs font-normal text-muted-foreground">kg</span>
							</div>
						</div>
						<div>
							<span class="text-xs text-muted-foreground">Baseline ปกติ</span>
							<div class="text-xl font-black text-muted-foreground">
								{readiness.baselineGripKg} <span class="text-xs font-normal text-muted-foreground">kg</span>
							</div>
						</div>
					</div>

					<div class="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-border">
						<div
							class="h-full bg-linear-to-r from-cyan-500 to-emerald-400 transition-all duration-200"
							style="width: {Math.min(100, (readiness.currentGripKg / readiness.baselineGripKg) * 100)}%;"
						></div>
					</div>

					{#if readiness.isTesting}
						<div
							class="mt-4 flex animate-pulse items-center justify-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-2.5 text-xs font-bold text-amber-600"
						>
							<Zap class="h-4 w-4" />
							<span>บีบเต็มแรงค้างไว้! เหลือเวลา: <strong>{readiness.countdownSeconds}</strong> วินาที</span>
						</div>
					{/if}
				</div>
			</div>

			<div class="mt-6">
				<button
					onclick={handleStartTest}
					disabled={readiness.isTesting}
					class="w-full rounded-lg border border-cyan-500/50 bg-cyan-500/10 py-3 text-sm font-bold text-cyan-600 transition-all hover:bg-cyan-500/20 hover:shadow-[0_0_15px_rgba(6,182,212,0.25)] disabled:cursor-not-allowed disabled:opacity-50"
				>
					{readiness.isTesting
						? 'กำลังทดสอบ...'
						: readiness.isComplete
							? 'ทดสอบซ้ำ (Retest 5s)'
							: 'เริ่มทดสอบแรงบีบ 5 วินาที'}
				</button>
			</div>
		</div>

		<!-- Physiological Resting Vitals Card -->
		<div class="flex flex-col justify-between rounded-xl border border-border bg-card p-6 shadow-md">
			<div>
				<h3 class="text-lg font-bold text-foreground">
					สัญญาณชีพขณะพัก
				</h3>

				<div class="mt-4 flex flex-col gap-3">
					<div class="flex items-center gap-4 rounded-lg border border-border bg-background/50 p-3">
						<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10 text-red-600">
							<Heart class="h-5 w-5 fill-red-400/30 text-red-600" />
						</div>
						<div class="flex-1">
							<span class="text-xs text-muted-foreground">Resting Heart Rate</span>
							<div class="text-lg font-black text-foreground">
								{fmt(readiness.restingHr)} <span class="text-xs font-normal text-muted-foreground">BPM</span>
							</div>
						</div>
						<span class={['rounded-full border px-2.5 py-0.5 text-xs font-bold', BADGE_CLASS[hrBadge.tone]]}>
							{hrBadge.label}
						</span>
					</div>

					<div class="flex items-center gap-4 rounded-lg border border-border bg-background/50 p-3">
						<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
							<Droplets class="h-5 w-5 text-emerald-600" />
						</div>
						<div class="flex-1">
							<span class="text-xs text-muted-foreground">Blood Oxygen (SpO2)</span>
							<div class="text-lg font-black text-foreground">
								{fmt(readiness.restingSpo2)} <span class="text-xs font-normal text-muted-foreground">%</span>
							</div>
						</div>
						<span class={['rounded-full border px-2.5 py-0.5 text-xs font-bold', BADGE_CLASS[spo2Badge.tone]]}>
							{spo2Badge.label}
						</span>
					</div>

					<div class="flex items-center gap-4 rounded-lg border border-border bg-background/50 p-3">
						<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
							<Thermometer class="h-5 w-5 text-amber-600" />
						</div>
						<div class="flex-1">
							<span class="text-xs text-muted-foreground">Baseline Muscle Temp</span>
							<div class="text-lg font-black text-foreground">
								{fmt(readiness.baselineSkinTemp)} <span class="text-xs font-normal text-muted-foreground">°C</span>
							</div>
						</div>
						<span class="text-xs text-muted-foreground">Pre-Hyperemia State</span>
					</div>
				</div>
			</div>

			<div class="mt-6 border-t border-border pt-4">
				<h4 class="text-xs font-bold text-muted-foreground uppercase tracking-wider">
					เกณฑ์ความพร้อม
				</h4>
				<div class="mt-2 flex flex-col gap-1.5 text-xs text-muted-foreground">
					{#each criteria as c (c.id)}
						<div class="flex items-center gap-2">
							{#if c.pass === null}
								<Circle class="h-4 w-4 text-muted-foreground" />
							{:else if c.pass}
								<CheckCircle2 class="h-4 w-4 text-emerald-600" />
							{:else}
								<XCircle class="h-4 w-4 text-amber-600" />
							{/if}
							<span>
								{c.label}{c.pass === null ? ' - ยังไม่มีข้อมูล' : c.pass ? ' - ผ่านเกณฑ์' : ' - ไม่ผ่าน'}
							</span>
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>
</div>

