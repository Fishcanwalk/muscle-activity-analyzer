<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { workout, type SessionSummary } from '$lib/workout/workout.svelte';
	import { telemetry } from '$lib/workout/telemetry.svelte';
	import { formatDec } from '$lib/utils/format';
	import { Timer, ArrowRight, Save, CheckCircle2, AlertTriangle, Flag } from 'lucide-svelte';

	interface Props {
		onStartNextSet: () => void;
		onFinishSession: () => void;
	}

	let { onStartNextSet, onFinishSession }: Props = $props();

	let restSecondsLeft = $state(120);
	let restTimer: any = null;

	// Live MAX30102 heart-rate recovery: peak is the session-wide max seen so far
	// (telemetry.vitals.peakHr), current updates live while resting on this page.
	let hrrPeak = $derived(Math.round(telemetry.vitals.peakHr));
	let hrrCurrent = $derived(Math.round(telemetry.vitals.heartRate));
	let hrrDrop = $derived(hrrPeak - hrrCurrent);
	let hrrTone = $derived(
		hrrPeak === 0 ? 'muted' : hrrDrop >= 30 ? 'emerald' : hrrDrop >= 15 ? 'cyan' : 'amber'
	);
	let hrrLabel = $derived(
		hrrPeak === 0
			? 'No Heart Rate Data'
			: hrrDrop >= 30
				? 'Excellent Recovery (>30 BPM drop in 1 min)'
				: hrrDrop >= 15
					? 'Good Recovery (15-30 BPM drop)'
					: 'Needs More Rest (<15 BPM drop)'
	);
	let hrrMessage = $derived(
		hrrPeak === 0
			? 'ยังไม่มีข้อมูลอัตราการเต้นหัวใจ วางนิ้วบนเซนเซอร์ MAX30102'
			: hrrDrop >= 30
				? 'การฟื้นตัวของระบบหัวใจและหลอดเลือดอยู่ในเกณฑ์ยอดเยี่ยม ร่างกายพร้อมสำหรับเซตถัดไป'
				: hrrDrop >= 15
					? 'การฟื้นตัวอยู่ในเกณฑ์ดี พักต่ออีกสักครู่ก่อนเริ่มเซตถัดไป'
					: 'หัวใจยังฟื้นตัวไม่เต็มที่ แนะนำพักเพิ่มก่อนเริ่มเซตถัดไป'
	);

	let currentSummary = $derived(
		workout.lastCompletedSet || {
			setNumber: 2,
			exercise: 'Biceps Curl',
			weightKg: 12.5,
			durationSeconds: 34,
			totalReps: 8,
			cleanReps: 7,
			cheatedReps: 1,
			formPurityPercent: 88,
			effectiveReps: 4,
			highTensionTutSeconds: 18.2,
			reps: [
				{
					repNumber: 1,
					concentricVelocity: 0.52,
					rom: 123,
					isClean: true,
					velocityLossPercent: 0,
					peakEmg: 470,
					cheatReason: null
				},
				{
					repNumber: 2,
					concentricVelocity: 0.5,
					rom: 124,
					isClean: true,
					velocityLossPercent: 4,
					peakEmg: 480,
					cheatReason: null
				},
				{
					repNumber: 3,
					concentricVelocity: 0.48,
					rom: 122,
					isClean: true,
					velocityLossPercent: 8,
					peakEmg: 485,
					cheatReason: null
				},
				{
					repNumber: 4,
					concentricVelocity: 0.44,
					rom: 123,
					isClean: true,
					velocityLossPercent: 15,
					peakEmg: 490,
					cheatReason: null
				},
				{
					repNumber: 5,
					concentricVelocity: 0.41,
					rom: 125,
					isClean: true,
					velocityLossPercent: 21,
					peakEmg: 505,
					cheatReason: null
				},
				{
					repNumber: 6,
					concentricVelocity: 0.38,
					rom: 124,
					isClean: true,
					velocityLossPercent: 27,
					peakEmg: 512,
					cheatReason: null
				},
				{
					repNumber: 7,
					concentricVelocity: 0.34,
					rom: 122,
					isClean: true,
					velocityLossPercent: 35,
					peakEmg: 520,
					cheatReason: null
				},
				{
					repNumber: 8,
					concentricVelocity: 0.31,
					rom: 120,
					isClean: false,
					cheatReason: 'Torso Swing',
					velocityLossPercent: 40,
					peakEmg: 490
				}
			],
			timestamp: '18:32:10',
			sessionId: null
		}
	);

	onMount(() => {
		restTimer = setInterval(() => {
			if (restSecondsLeft > 0) restSecondsLeft -= 1;
		}, 1000);
	});

	onDestroy(() => {
		if (restTimer) clearInterval(restTimer);
	});

	function handleNextSet() {
		workout.nextSet();
		onStartNextSet();
	}

	let isSaving = $state(false);

	async function handleSaveSession() {
		isSaving = true;
		await workout.saveSummary(currentSummary);
		isSaving = false;
		onFinishSession();
	}

	// "จบการออกกำลังกาย" is a separate, additive action from saving a single set
	// above -- it aggregates every set completed this workout (workout.endWorkout())
	// and renders the result in place, rather than immediately switching tabs, so
	// the lifter sees the session-wide numbers before moving on.
	let sessionSummary = $state<SessionSummary | null>(null);

	function handleEndWorkout() {
		sessionSummary = workout.endWorkout();
	}

	function handleCloseSummary() {
		sessionSummary = null;
		onFinishSession();
	}
</script>

<div class="mx-auto flex max-w-6xl flex-col gap-6 p-6">
	<!-- Rest Countdown Banner -->
	<div
		class="flex flex-wrap items-center justify-between gap-6 rounded-xl border border-cyan-500/30 bg-linear-to-r from-cyan-500/10 via-card to-emerald-500/5 p-6 shadow-xl"
	>
		<div>
			<span class="flex items-center gap-2 text-xs font-bold tracking-wider text-cyan-400 uppercase">
				<Timer class="h-4 w-4" /> กำลังพักฟื้นกล้ามเนื้อ (Rest Interval)
			</span>
			<div class="text-4xl font-black text-foreground">
				{String(Math.floor(restSecondsLeft / 60)).padStart(2, '0')}:{String(
					restSecondsLeft % 60
				).padStart(2, '0')}
			</div>
			<p class="mt-1 text-xs text-muted-foreground">
				การพัก 2–3 นาทีช่วยฟื้นฟู ATP-PC เพื่อรักษาแรงตึงเชิงกลในเซตถัดไป
			</p>
		</div>

		<div class="flex flex-wrap gap-3">
			<button
				onclick={handleNextSet}
				class="flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 font-bold text-black shadow-lg shadow-emerald-500/20 hover:bg-emerald-400"
			>
				<span>เริ่มเซตถัดไป (Set #{currentSummary.setNumber + 1})</span>
				<ArrowRight class="h-4 w-4" />
			</button>
			<button
				onclick={handleSaveSession}
				disabled={isSaving}
				class="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 font-semibold text-foreground hover:border-cyan-500 disabled:opacity-50"
			>
				<Save class="h-4 w-4" />
				<span>{isSaving ? 'กำลังบันทึก...' : 'บันทึกผลเซสชันวันนี้'}</span>
			</button>
			<button
				onclick={handleEndWorkout}
				class="flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 font-semibold text-rose-400 hover:bg-rose-500/20"
			>
				<Flag class="h-4 w-4" />
				<span>จบการออกกำลังกาย</span>
			</button>
		</div>
	</div>

	{#if sessionSummary}
		<!-- Whole-workout aggregate: every set completed since the sessionId was
		     generated (first startSet()), across possibly multiple exercises. -->
		<div
			class="flex flex-col gap-4 rounded-xl border border-emerald-500/30 bg-linear-to-r from-emerald-500/10 via-card to-cyan-500/5 p-6 shadow-xl"
		>
			<div>
				<span class="flex items-center gap-2 text-xs font-bold tracking-wider text-emerald-400 uppercase">
					<Flag class="h-4 w-4" /> Session Summary
				</span>
				<h3 class="mt-1 text-lg font-bold text-foreground">🏁 สรุปผลการออกกำลังกายวันนี้</h3>
			</div>

			<div class="grid grid-cols-2 gap-3 md:grid-cols-3">
				<div class="rounded-lg border border-border bg-background/50 p-3">
					<span class="text-xs text-muted-foreground">จำนวนเซตทั้งหมด</span>
					<div class="text-xl font-black text-foreground">{sessionSummary.totalSets}</div>
				</div>

				<div class="rounded-lg border border-border bg-background/50 p-3">
					<span class="text-xs text-muted-foreground">ท่าออกกำลังกาย</span>
					<div class="text-sm font-bold text-foreground">
						{sessionSummary.exercises.length ? sessionSummary.exercises.join(', ') : '-'}
					</div>
				</div>

				<div class="rounded-lg border border-border bg-background/50 p-3">
					<span class="text-xs text-muted-foreground">Total / Clean Reps</span>
					<div class="text-xl font-black text-foreground">
						{sessionSummary.totalReps}
						<span class="text-xs font-normal text-muted-foreground">/ {sessionSummary.cleanReps} Clean</span>
					</div>
				</div>

				<div class="rounded-lg border border-border bg-background/50 p-3">
					<span class="text-xs text-muted-foreground">ปริมาณงานรวม (Volume)</span>
					<div class="text-xl font-black text-emerald-400">
						{sessionSummary.totalVolumeKg.toFixed(1)} <span class="text-xs font-normal text-muted-foreground">kg</span>
					</div>
				</div>

				<div class="rounded-lg border border-border bg-background/50 p-3">
					<span class="text-xs text-muted-foreground">Form Purity เฉลี่ย</span>
					<div class="text-xl font-black text-cyan-400">{sessionSummary.avgFormPurityPercent}%</div>
				</div>
			</div>

			<button
				onclick={handleCloseSummary}
				class="flex w-fit items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 font-bold text-black shadow-lg shadow-emerald-500/20 hover:bg-emerald-400"
			>
				<span>เสร็จสิ้น</span>
				<ArrowRight class="h-4 w-4" />
			</button>
		</div>
	{/if}

	<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
		<!-- Left: Stimulus Scorecard & Audit -->
		<div class="flex flex-col gap-6">
			<div class="rounded-xl border border-border bg-card p-6 shadow-md">
				<span class="text-xs font-bold text-cyan-400 uppercase">Session Breakdown</span>
				<h3 class="mt-1 text-lg font-bold text-foreground">
					🎯 Hypertrophy Stimulus Scorecard (เซต #{currentSummary.setNumber})
				</h3>

				<div class="mt-4 grid grid-cols-2 gap-3">
					<div class="rounded-lg border border-border bg-background/50 p-3">
						<span class="text-xs text-muted-foreground">Total / Clean Reps</span>
						<div class="text-xl font-black text-foreground">
							{currentSummary.totalReps} <span class="text-xs font-normal text-muted-foreground">/ {currentSummary.cleanReps} Clean</span>
						</div>
						<span class="text-xs text-emerald-400">{currentSummary.formPurityPercent}% Purity</span>
					</div>

					<div class="rounded-lg border border-border bg-background/50 p-3">
						<span class="text-xs text-muted-foreground">Effective Reps</span>
						<div class="text-xl font-black text-emerald-400">
							{currentSummary.effectiveReps} <span class="text-xs font-normal text-muted-foreground">reps</span>
						</div>
						<span class="text-xs text-cyan-400">Optimal Stimulus Zone</span>
					</div>

					<div class="rounded-lg border border-border bg-background/50 p-3">
						<span class="text-xs text-muted-foreground">High-Tension TUT</span>
						<div class="text-xl font-black text-foreground">
							{currentSummary.highTensionTutSeconds} <span class="text-xs font-normal text-muted-foreground">s</span>
						</div>
						<span class="text-xs text-muted-foreground">Zone > 280 µV</span>
					</div>

					<div class="rounded-lg border border-border bg-background/50 p-3">
						<span class="text-xs text-muted-foreground">Muscle Pump (MLX90614)</span>
						<div class="text-xl font-black text-amber-400">
							{telemetry.vitals.deltaTemp >= 0 ? '+' : ''}{formatDec(telemetry.vitals.deltaTemp)} <span class="text-xs font-normal text-muted-foreground">°C</span>
						</div>
						<span class="text-xs text-amber-400">Local Hyperemia 🔥</span>
					</div>
				</div>
			</div>

			<!-- Anti-Cheat Audit -->
			<div class="rounded-xl border border-border bg-card p-6 shadow-md">
				<span class="text-xs font-bold text-cyan-400 uppercase">MediaPipe Anti-Cheat Audit</span>
				<h3 class="mt-1 text-lg font-bold text-foreground">
					🕵️ รายงานการโกงท่าทาง (Form Breakdown Audit)
				</h3>

				<div class="mt-3">
					{#if currentSummary.cheatedReps > 0}
						<div class="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
							<AlertTriangle class="h-5 w-5 shrink-0" />
							<div>
								<strong>ตรวจพบการเหวี่ยงตัว (Torso Momentum):</strong>
								<p class="mt-0.5 text-muted-foreground">
									ในครั้งที่ 8 ตรวจพบลำตัวเอนไปข้างหลัง 11.4° (เกินเกณฑ์ปลอดภัย 8°) เพื่อใช้แรงเหวี่ยงช่วยยก
								</p>
								<span class="mt-1 inline-block rounded bg-destructive/20 px-1.5 py-0.5 font-bold text-destructive">
									ตัดเป็น Cheated Rep (-15% Score)
								</span>
							</div>
						</div>
					{:else}
						<div class="flex gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400">
							<CheckCircle2 class="h-5 w-5 shrink-0" />
							<div>
								<strong>ยอดเยี่ยม! ไม่พบการโกงท่าทางในเซตนี้</strong>
								<p class="mt-0.5 text-muted-foreground">
									มุมลำตัวนิ่งตลอดการยก และไม่มีการยกไหล่ช่วย Biceps ได้รับแรงตึงเต็ม 100%
								</p>
							</div>
						</div>
					{/if}
				</div>

				<div class="mt-4 rounded-lg border-l-4 border-cyan-500 bg-background/50 p-3 text-xs text-muted-foreground">
					<strong class="text-cyan-400">💡 คำแนะนำเชิงวิทยาศาสตร์สำหรับเซตถัดไป:</strong>
					<p class="mt-1">
						ล็อกข้อศอกให้อยู่ข้างลำตัวก่อนเริ่มงอแขน หากครั้งสุดท้ายเริ่มยกไม่ขึ้น ให้ลดความเร็วลงอย่างช้าๆ (Eccentric Control) แทนการเหวี่ยงตัว
					</p>
				</div>
			</div>
		</div>

		<!-- Right: Velocity Loss Table & HRR -->
		<div class="flex flex-col gap-6">
			<div class="rounded-xl border border-border bg-card p-6 shadow-md">
				<span class="text-xs font-bold text-cyan-400 uppercase">MPU-6050 (VBT Analytics)</span>
				<h3 class="mt-1 text-lg font-bold text-foreground">📉 Rep-by-Rep Velocity Loss Curve</h3>

				<div class="mt-3 overflow-x-auto">
					<table class="w-full text-left text-xs">
						<thead>
							<tr class="border-b border-border text-muted-foreground uppercase">
								<th class="py-2">Rep #</th>
								<th>Velocity</th>
								<th>Loss</th>
								<th>ROM</th>
								<th>Form</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-border">
							{#each currentSummary.reps as r (r.repNumber)}
								<tr class={r.isClean ? '' : 'bg-destructive/10'}>
									<td class="py-2 font-bold">#{r.repNumber}</td>
									<td>{r.concentricVelocity} m/s</td>
									<td>
										<span
											class="rounded px-1.5 py-0.5 font-bold {r.velocityLossPercent >= 30
												? 'bg-emerald-500/20 text-emerald-400'
												: 'text-foreground'}"
										>
											{r.velocityLossPercent}%
										</span>
									</td>
									<td>{r.rom}°</td>
									<td>
										{#if r.isClean}
											<span class="rounded bg-emerald-500/20 px-1.5 py-0.5 font-bold text-emerald-400">
												Clean
											</span>
										{:else}
											<span class="rounded bg-destructive/20 px-1.5 py-0.5 font-bold text-destructive">
												{r.cheatReason}
											</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>

			<!-- 1-Minute Heart Rate Recovery -->
			<div class="rounded-xl border border-border bg-card p-6 shadow-md">
				<span class="text-xs font-bold text-cyan-400 uppercase">MAX30102 Cardiovascular Recovery</span>
				<h3 class="mt-1 text-lg font-bold text-foreground">💓 1-Minute Heart Rate Recovery (HRR)</h3>

				<div class="mt-4 grid grid-cols-3 gap-2 rounded-lg border border-border bg-background/50 p-4 text-center">
					<div>
						<span class="text-xs text-muted-foreground">Peak ขณะยก</span>
						<div class="text-lg font-black text-destructive">{hrrPeak} <span class="text-xs font-normal">BPM</span></div>
					</div>
					<div>
						<span class="text-xs text-muted-foreground">ปัจจุบัน (พัก)</span>
						<div class="text-lg font-black text-emerald-400">{hrrCurrent} <span class="text-xs font-normal">BPM</span></div>
					</div>
					<div>
						<span class="text-xs text-muted-foreground">อัตราลดลง (HRR)</span>
						<div class="text-lg font-black text-cyan-400">{-hrrDrop} <span class="text-xs font-normal">BPM</span></div>
					</div>
				</div>

				<div class="mt-3">
					<span
						class="rounded-full border px-3 py-0.5 text-xs font-bold {hrrTone === 'emerald'
							? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400'
							: hrrTone === 'cyan'
								? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-400'
								: hrrTone === 'amber'
									? 'border-amber-500/40 bg-amber-500/15 text-amber-400'
									: 'border-border bg-muted/30 text-muted-foreground'}"
					>
						{hrrLabel}
					</span>
					<p class="mt-1 text-xs text-muted-foreground">
						{hrrMessage}
					</p>
				</div>
			</div>
		</div>
	</div>
</div>

