<script lang="ts">
	import { readiness } from '$lib/workout/readiness.svelte';
	import { Activity, Heart, Droplets, Thermometer, CheckCircle2, Zap } from 'lucide-svelte';

	interface Props {
		onProceed: () => void;
	}

	let { onProceed }: Props = $props();

	function handleStartTest() {
		readiness.startGripTest();
	}
</script>

<div class="mx-auto flex max-w-6xl flex-col gap-6 p-6">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div>
			<h2 class="text-2xl font-black tracking-tight text-foreground">
				1. Daily CNS Readiness & Health Check
			</h2>
			<p class="text-sm text-muted-foreground">
				ตรวจเช็กความพร้อมของระบบประสาทส่วนกลาง (Central Nervous System) และสัญญาณชีพก่อนเริ่มยกเวท
			</p>
		</div>
		<button
			onclick={onProceed}
			class="flex items-center gap-2 rounded-lg bg-linear-to-r from-emerald-500 to-emerald-600 px-5 py-2.5 font-bold text-black shadow-lg shadow-emerald-500/20 transition-all hover:translate-y-[-1px] hover:shadow-emerald-500/30"
		>
			<Zap class="h-4 w-4 fill-black" />
			<span>ไปที่ห้องซ้อม (Start Workout Studio)</span>
		</button>
	</div>

	<!-- AI Recommendation Card -->
	<div
		class="flex flex-wrap items-center gap-6 rounded-xl border border-emerald-500/30 bg-linear-to-r from-emerald-500/10 via-card to-cyan-500/5 p-6 shadow-xl"
	>
		<div class="flex min-w-[120px] flex-col items-center gap-2">
			<div
				class="flex h-20 w-20 items-center justify-center rounded-full border-4 border-emerald-500 bg-card shadow-[0_0_20px_rgba(16,185,129,0.3)]"
			>
				<span class="text-3xl font-black text-emerald-400">{readiness.overallScore}</span>
				<span class="text-xs text-muted-foreground">/100</span>
			</div>
			<span
				class="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3 py-0.5 text-xs font-bold text-emerald-400 uppercase"
			>
				{readiness.statusLabel}
			</span>
		</div>
		<div class="flex-1">
			<h3 class="text-base font-bold text-foreground">AI Science-Based Workout Recommendation</h3>
			<p class="mt-1 text-sm text-muted-foreground leading-relaxed">
				{readiness.recommendation}
			</p>
			<div class="mt-3 flex flex-wrap gap-4 text-xs text-foreground font-medium">
				<span class="flex items-center gap-1.5 text-emerald-400">
					<CheckCircle2 class="h-4 w-4" /> CNS Freshness: <strong>{readiness.cnsReadinessPercent}%</strong>
				</span>
				<span class="flex items-center gap-1.5 text-cyan-400">
					<CheckCircle2 class="h-4 w-4" /> Resting HR: <strong>{readiness.restingHr} BPM</strong>
				</span>
				<span class="flex items-center gap-1.5 text-amber-400">
					<CheckCircle2 class="h-4 w-4" /> Baseline Skin Temp: <strong>{readiness.baselineSkinTemp}°C</strong>
				</span>
			</div>
		</div>
	</div>

	<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
		<!-- FSR Grip Squeeze Test Card -->
		<div class="flex flex-col justify-between rounded-xl border border-border bg-card p-6 shadow-md">
			<div>
				<div class="flex items-center justify-between">
					<span class="text-xs font-bold tracking-wider text-cyan-400 uppercase">
						FSR A2 (Arduino Uno)
					</span>
					<span class="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">5-Second MVC</span>
				</div>
				<h3 class="mt-1 text-lg font-bold text-foreground">
					1. Central Nervous System (CNS) Grip Test
				</h3>
				<p class="mt-2 text-xs text-muted-foreground leading-relaxed">
					แรงบีบมือสูงสุด (Max Voluntary Contraction: MVC) มีความสัมพันธ์โดยตรงกับความพร้อมของระบบประสาทส่วนกลาง หากแรงบีบลดลงเกิน 10–15% แปลว่าร่างกายยังไม่ฟื้นตัวเต็มที่
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
							<div class="text-xl font-black text-emerald-400">
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
							class="mt-4 flex animate-pulse items-center justify-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-2.5 text-xs font-bold text-amber-400"
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
					class="w-full rounded-lg border border-cyan-500/50 bg-cyan-500/10 py-3 text-sm font-bold text-cyan-400 transition-all hover:bg-cyan-500/20 hover:shadow-[0_0_15px_rgba(6,182,212,0.25)] disabled:cursor-not-allowed disabled:opacity-50"
				>
					{readiness.isTesting
						? 'กำลังทดสอบ...'
						: readiness.isComplete
							? '🔄 ทดสอบซ้ำ (Retest 5s)'
							: '⚡ เริ่มทดสอบแรงบีบ 5 วินาที'}
				</button>
			</div>
		</div>

		<!-- Physiological Resting Vitals Card -->
		<div class="flex flex-col justify-between rounded-xl border border-border bg-card p-6 shadow-md">
			<div>
				<div class="flex items-center justify-between">
					<span class="text-xs font-bold tracking-wider text-cyan-400 uppercase">
						MAX30102 & MLX90614 (ESP32)
					</span>
					<span class="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">I2C Bus</span>
				</div>
				<h3 class="mt-1 text-lg font-bold text-foreground">
					2. Pre-Workout Physiological Vitals
				</h3>

				<div class="mt-4 flex flex-col gap-3">
					<div class="flex items-center gap-4 rounded-lg border border-border bg-background/50 p-3">
						<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10 text-red-400">
							<Heart class="h-5 w-5 fill-red-400/30 text-red-400" />
						</div>
						<div class="flex-1">
							<span class="text-xs text-muted-foreground">Resting Heart Rate</span>
							<div class="text-lg font-black text-foreground">
								{readiness.restingHr} <span class="text-xs font-normal text-muted-foreground">BPM</span>
							</div>
						</div>
						<span class="rounded-full border border-cyan-500/40 bg-cyan-500/15 px-2.5 py-0.5 text-xs font-bold text-cyan-400">
							Optimal (60–75)
						</span>
					</div>

					<div class="flex items-center gap-4 rounded-lg border border-border bg-background/50 p-3">
						<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
							<Droplets class="h-5 w-5 text-emerald-400" />
						</div>
						<div class="flex-1">
							<span class="text-xs text-muted-foreground">Blood Oxygen (SpO2)</span>
							<div class="text-lg font-black text-foreground">
								{readiness.restingSpo2} <span class="text-xs font-normal text-muted-foreground">%</span>
							</div>
						</div>
						<span class="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-400">
							Normal
						</span>
					</div>

					<div class="flex items-center gap-4 rounded-lg border border-border bg-background/50 p-3">
						<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
							<Thermometer class="h-5 w-5 text-amber-400" />
						</div>
						<div class="flex-1">
							<span class="text-xs text-muted-foreground">Baseline Muscle Temp</span>
							<div class="text-lg font-black text-foreground">
								{readiness.baselineSkinTemp} <span class="text-xs font-normal text-muted-foreground">°C</span>
							</div>
						</div>
						<span class="text-xs text-muted-foreground">Pre-Hyperemia State</span>
					</div>
				</div>
			</div>

			<div class="mt-6 border-t border-border pt-4">
				<h4 class="text-xs font-bold text-muted-foreground uppercase tracking-wider">
					📋 เกณฑ์การอนุมัติการฝึกตามหลักวิทยาศาสตร์:
				</h4>
				<div class="mt-2 flex flex-col gap-1.5 text-xs text-muted-foreground">
					<div class="flex items-center gap-2">
						<CheckCircle2 class="h-4 w-4 text-emerald-400" />
						<span>CNS Readiness ≥ 85% (ปัจจุบัน {readiness.cnsReadinessPercent}%) - ผ่านเกณฑ์</span>
					</div>
					<div class="flex items-center gap-2">
						<CheckCircle2 class="h-4 w-4 text-emerald-400" />
						<span>Resting Heart Rate ≤ 80 BPM (ปัจจุบัน {readiness.restingHr} BPM) - พร้อมฝึก</span>
					</div>
					<div class="flex items-center gap-2">
						<CheckCircle2 class="h-4 w-4 text-emerald-400" />
						<span>I2C Bus & Sensor Latency ≤ 20 ms - ปลอดสัญญาณกวน</span>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>

