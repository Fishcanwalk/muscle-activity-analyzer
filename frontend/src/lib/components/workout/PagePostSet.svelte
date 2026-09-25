<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { workout, type SessionSummary } from '$lib/workout/workout.svelte';
	import { telemetry } from '$lib/workout/telemetry.svelte';
	import { calibration } from '$lib/workout/calibration.svelte';
	import {
		compareSessions,
		groupSetsIntoSessions,
		progressVerdict,
		thaiDate,
		type WorkoutSession
	} from '$lib/workout/metrics';
	import fastapiClient from '$lib/api/fastapi-client';
	import { formatDec } from '$lib/utils/format';
	import { Timer, ArrowRight, CheckCircle2, AlertTriangle, Flag } from 'lucide-svelte';

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
			? 'ไม่มีข้อมูลชีพจร'
			: hrrDrop >= 30
				? 'ฟื้นตัวดีมาก (ลดลงเกิน 30 BPM)'
				: hrrDrop >= 15
					? 'ฟื้นตัวดี (ลดลง 15–30 BPM)'
					: 'ควรพักต่อ (ลดลงไม่ถึง 15 BPM)'
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

	// Null until a set has been finished this workout (e.g. the lifter opened this tab
	// directly) -- the page then shows an empty state instead of a placeholder set, so
	// nothing fake can ever be saved to the backend from here.
	let currentSummary = $derived(workout.lastCompletedSet);

	onMount(() => {
		restTimer = setInterval(() => {
			if (restSecondsLeft > 0) restSecondsLeft -= 1;
		}, 1000);
	});

	onDestroy(() => {
		if (restTimer) clearInterval(restTimer);
	});

	// Two actions only, both of which now actually persist data (previously a
	// separate "บันทึกผลเซสชันวันนี้" button was the only thing that saved to the
	// backend, so a lifter who forgot to click it before ending lost that set):
	// starting the next set silently saves the one that just finished, and ending
	// the workout saves whatever hasn't been saved yet before aggregating.
	let isBusy = $state(false);

	async function handleNextSet() {
		if (!currentSummary) return;
		isBusy = true;
		await workout.saveSummary(currentSummary, { silent: true });
		isBusy = false;
		workout.nextSet();
		onStartNextSet();
	}

	// Renders the session-wide numbers in place (rather than immediately switching
	// tabs) so the lifter sees them before moving on -- see handleCloseSummary.
	let sessionSummary = $state<SessionSummary | null>(null);

	// The session that just ended next to this user's previous one, from the backend
	// (GET /v1/sessions/{id}/comparison only ever looks at the caller's own sets).
	type Comparison =
		| { status: 'loading' | 'error' | 'first' }
		| { status: 'ready'; prev: WorkoutSession; curr: WorkoutSession };
	let comparison = $state<Comparison | null>(null);

	async function loadComparison(sessionId: string) {
		comparison = { status: 'loading' };
		try {
			const { data, error } = await fastapiClient.GET('/v1/sessions/{session_id}/comparison', {
				params: { path: { session_id: sessionId } }
			});
			if (error || !data) {
				comparison = { status: 'error' };
				return;
			}
			const [curr] = groupSetsIntoSessions(data.current);
			const [prev] = groupSetsIntoSessions(data.previous);
			comparison = prev ? { status: 'ready', prev, curr } : { status: 'first' };
		} catch {
			comparison = { status: 'error' };
		}
	}

	async function handleEndWorkout() {
		isBusy = true;
		await workout.saveAllPendingSets();
		sessionSummary = workout.endWorkout();
		isBusy = false;
		// The next session has to calibrate again from scratch.
		void calibration.startFresh();
		if (sessionSummary.sessionId) void loadComparison(sessionSummary.sessionId);
	}

	function handleCloseSummary() {
		sessionSummary = null;
		comparison = null;
		onFinishSession();
	}
</script>

<div class="mx-auto flex max-w-6xl flex-col gap-6 p-6">
	{#if sessionSummary}
		<!-- Whole-workout aggregate: every set completed since the sessionId was
		     generated (first startSet()), across possibly multiple exercises. -->
		<div
			class="flex flex-col gap-4 rounded-xl border border-emerald-500/30 bg-linear-to-r from-emerald-500/10 via-card to-cyan-500/5 p-6 shadow-xl"
		>
			<div>
				<span class="flex items-center gap-2 text-sm font-semibold text-emerald-700">
					<Flag class="h-4 w-4" /> Session Summary
				</span>
				<h3 class="mt-1 text-lg font-bold text-foreground">สรุปผลการออกกำลังกายวันนี้</h3>
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
					<span class="text-sm text-muted-foreground">ครั้งทั้งหมด / คลีน</span>
					<div class="text-xl font-black text-foreground">
						{sessionSummary.totalReps}
						<span class="text-xs font-normal text-muted-foreground">/ คลีน {sessionSummary.cleanReps}</span>
					</div>
				</div>

				<div class="rounded-lg border border-border bg-background/50 p-3">
					<span class="text-xs text-muted-foreground">ปริมาณงานรวม (Volume)</span>
					<div class="text-xl font-black text-emerald-600">
						{sessionSummary.totalVolumeKg.toFixed(1)} <span class="text-xs font-normal text-muted-foreground">kg</span>
					</div>
				</div>

				<div class="rounded-lg border border-border bg-background/50 p-3">
					<span class="text-xs text-muted-foreground">Form Purity เฉลี่ย</span>
					<div class="text-xl font-black text-cyan-600">{sessionSummary.avgFormPurityPercent}%</div>
				</div>
			</div>

			<div class="rounded-lg border border-border bg-background/60 p-4">
				<h4 class="text-base font-bold text-foreground">เทียบกับ session ก่อนหน้าของคุณ</h4>
				{#if !comparison || comparison.status === 'loading'}
					<p class="mt-2 text-sm text-muted-foreground">กำลังโหลดข้อมูล session ก่อนหน้า...</p>
				{:else if comparison.status === 'error'}
					<p class="mt-2 text-sm text-rose-600">
						โหลดผลเทียบไม่สำเร็จ (session นี้อาจบันทึกไปยังเซิร์ฟเวอร์ไม่ครบ) ดูพัฒนาการได้ที่หน้า Analytics
					</p>
				{:else if comparison.status === 'first'}
					<p class="mt-2 text-sm text-muted-foreground">
						นี่คือ session แรกของคุณ ครั้งหน้าระบบจะนำผลครั้งนี้มาเทียบให้
					</p>
				{:else if comparison.status === 'ready'}
					{@const { prev, curr } = comparison}
					<p class="mt-1 text-sm text-muted-foreground">
						{thaiDate(prev.startedAt)} ({prev.exercises.join(', ')}) → ครั้งนี้ ({curr.exercises.join(', ')})
					</p>
					{#if prev.exercises.join() !== curr.exercises.join()}
						<p class="mt-1 text-sm text-amber-700">ท่าที่เล่นไม่เหมือนกัน ผลเทียบบางตัวอาจเทียบกันตรง ๆ ไม่ได้</p>
					{/if}
					<div class="mt-3 overflow-x-auto">
						<table class="w-full text-left text-sm">
							<thead>
								<tr class="border-b border-border text-muted-foreground">
									<th class="p-2">ตัวชี้วัด</th>
									<th class="p-2">ครั้งก่อน</th>
									<th class="p-2">ครั้งนี้</th>
									<th class="p-2">เปลี่ยนแปลง</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-border">
								{#each compareSessions(prev, curr) as m (m.name)}
									<tr>
										<td class="p-2 font-medium text-foreground">{m.name}</td>
										<td class="p-2 tabular-nums text-muted-foreground">{m.prev}</td>
										<td class="p-2 font-bold tabular-nums text-foreground">{m.curr}</td>
										<td class="p-2">
											<span
												class={[
													'rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums',
													m.isPositive ? 'bg-emerald-500/15 text-emerald-700' : 'bg-amber-500/15 text-amber-700'
												]}
											>
												{m.delta}
											</span>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<p class="mt-3 text-sm font-medium text-foreground">{progressVerdict(prev, curr)}</p>
				{/if}
			</div>

			<button
				onclick={handleCloseSummary}
				class="flex w-fit items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 font-bold text-black shadow-lg shadow-emerald-500/20 hover:bg-emerald-400"
			>
				<span>เสร็จสิ้น</span>
				<ArrowRight class="h-4 w-4" />
			</button>
		</div>
	{:else if currentSummary}
	<!-- Rest Countdown Banner -->
	<div
		class="flex flex-wrap items-center justify-between gap-6 rounded-xl border border-cyan-500/30 bg-linear-to-r from-cyan-500/10 via-card to-emerald-500/5 p-6 shadow-xl"
	>
		<div>
			<span class="flex items-center gap-2 text-sm font-semibold text-cyan-700">
				<Timer class="h-4 w-4" /> เวลาพักก่อนเซตถัดไป
			</span>
			<div class="text-4xl font-black text-foreground">
				{String(Math.floor(restSecondsLeft / 60)).padStart(2, '0')}:{String(
					restSecondsLeft % 60
				).padStart(2, '0')}
			</div>
			<p class="mt-1 text-sm text-muted-foreground">
				พัก 2–3 นาทีให้กล้ามเนื้อฟื้นแรงก่อนเริ่มเซตถัดไป
			</p>
		</div>

		<div class="flex flex-wrap gap-3">
			<button
				onclick={handleNextSet}
				disabled={isBusy}
				class="flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 font-bold text-black shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 disabled:opacity-50"
			>
				<span>{isBusy ? 'กำลังบันทึก...' : `เริ่มเซตถัดไป (Set #${currentSummary.setNumber + 1})`}</span>
				<ArrowRight class="h-4 w-4" />
			</button>
			<button
				onclick={handleEndWorkout}
				disabled={isBusy}
				class="flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 font-semibold text-rose-600 hover:bg-rose-500/20 disabled:opacity-50"
			>
				<Flag class="h-4 w-4" />
				<span>{isBusy ? 'กำลังบันทึก...' : 'บันทึกผลและจบการออกกำลังกาย'}</span>
			</button>
		</div>
	</div>

	<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
		<!-- Left: Stimulus Scorecard & Audit -->
		<div class="flex flex-col gap-6">
			<div class="rounded-xl border border-border bg-card p-6 shadow-md">
				<h3 class="text-lg font-bold text-foreground">
					สรุปเซต #{currentSummary.setNumber}
				</h3>

				<div class="mt-4 grid grid-cols-2 gap-3">
					<div class="rounded-lg border border-border bg-background/50 p-3">
						<span class="text-sm text-muted-foreground">ครั้งทั้งหมด / คลีน</span>
						<div class="text-xl font-black text-foreground">
							{currentSummary.totalReps} <span class="text-xs font-normal text-muted-foreground">/ คลีน {currentSummary.cleanReps}</span>
						</div>
						<span class="text-xs text-emerald-600">คลีน {currentSummary.formPurityPercent}%</span>
					</div>

					<div class="rounded-lg border border-border bg-background/50 p-3">
						<span class="text-sm text-muted-foreground">ครั้งที่กระตุ้นกล้ามเนื้อ</span>
						<div class="text-xl font-black text-emerald-600">
							{currentSummary.effectiveReps} <span class="text-xs font-normal text-muted-foreground">reps</span>
						</div>
						<span class="text-xs text-cyan-600">ช้าลง ≥ 25% จากครั้งแรก</span>
					</div>

					<div class="rounded-lg border border-border bg-background/50 p-3">
						<span class="text-sm text-muted-foreground">เวลาเกร็งหนัก</span>
						<div class="text-xl font-black text-foreground">
							{currentSummary.highTensionTutSeconds} <span class="text-xs font-normal text-muted-foreground">s</span>
						</div>
						<span class="text-xs text-muted-foreground">ช่วงเวลาที่ออกแรงหนัก</span>
					</div>

					<div class="rounded-lg border border-border bg-background/50 p-3">
						<span class="text-sm text-muted-foreground">อุณหภูมิกล้ามเนื้อเพิ่มขึ้น</span>
						<div class="text-xl font-black text-amber-600">
							{telemetry.vitals.deltaTemp >= 0 ? '+' : ''}{formatDec(telemetry.vitals.deltaTemp)} <span class="text-xs font-normal text-muted-foreground">°C</span>
						</div>
						<span class="text-xs text-amber-600">เลือดไหลเวียนมากขึ้น (pump)</span>
					</div>
				</div>
			</div>

			<!-- Anti-Cheat Audit -->
			<div class="rounded-xl border border-border bg-card p-6 shadow-md">
				<h3 class="text-lg font-bold text-foreground">
					การตรวจท่าโกง
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
						<div class="flex gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-600">
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
					<strong class="text-cyan-700">คำแนะนำสำหรับเซตถัดไป:</strong>
					<p class="mt-1">
						ล็อกข้อศอกให้อยู่ข้างลำตัวก่อนเริ่มงอแขน หากครั้งสุดท้ายเริ่มยกไม่ขึ้น ให้ลดความเร็วลงอย่างช้าๆ (Eccentric Control) แทนการเหวี่ยงตัว
					</p>
				</div>
			</div>
		</div>

		<!-- Right: Velocity Loss Table & HRR -->
		<div class="flex flex-col gap-6">
			<div class="rounded-xl border border-border bg-card p-6 shadow-md">
				<h3 class="text-lg font-bold text-foreground">ความเร็วแต่ละครั้ง</h3>

				<div class="mt-3 overflow-x-auto">
					<table class="w-full text-left text-sm">
						<thead>
							<tr class="border-b border-border text-muted-foreground">
								<th class="py-2 font-medium">ครั้งที่</th>
								<th class="font-medium">ความเร็ว</th>
								<th class="font-medium">ช้าลง</th>
								<th class="font-medium">ROM</th>
								<th class="font-medium">ท่า</th>
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
												? 'bg-emerald-500/20 text-emerald-600'
												: 'text-foreground'}"
										>
											{r.velocityLossPercent}%
										</span>
									</td>
									<td>{r.rom}°</td>
									<td>
										{#if r.isClean}
											<span class="rounded bg-emerald-500/20 px-1.5 py-0.5 font-bold text-emerald-600">
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
				<h3 class="text-lg font-bold text-foreground">การฟื้นตัวของหัวใจ</h3>

				<div class="mt-4 grid grid-cols-3 gap-2 rounded-lg border border-border bg-background/50 p-4 text-center">
					<div>
						<span class="text-sm text-muted-foreground">สูงสุดขณะยก</span>
						<div class="text-lg font-black text-destructive">{hrrPeak} <span class="text-xs font-normal">BPM</span></div>
					</div>
					<div>
						<span class="text-sm text-muted-foreground">ตอนนี้ (พัก)</span>
						<div class="text-lg font-black text-emerald-600">{hrrCurrent} <span class="text-xs font-normal">BPM</span></div>
					</div>
					<div>
						<span class="text-sm text-muted-foreground">ลดลง</span>
						<div class="text-lg font-black text-cyan-600">{-hrrDrop} <span class="text-xs font-normal">BPM</span></div>
					</div>
				</div>

				<div class="mt-3">
					<span
						class="rounded-full border px-3 py-0.5 text-xs font-bold {hrrTone === 'emerald'
							? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-600'
							: hrrTone === 'cyan'
								? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-600'
								: hrrTone === 'amber'
									? 'border-amber-500/40 bg-amber-500/15 text-amber-600'
									: 'border-border bg-muted/30 text-muted-foreground'}"
					>
						{hrrLabel}
					</span>
					<p class="mt-1 text-sm text-muted-foreground">
						{hrrMessage}
					</p>
				</div>
			</div>
		</div>
	</div>
	{:else}
	<div class="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-10 text-center shadow-md">
		<h3 class="text-lg font-bold text-foreground">ยังไม่มีเซตที่จบในการออกกำลังกายนี้</h3>
		<p class="max-w-md text-sm text-muted-foreground">
			เริ่มเซตที่ Live Studio แล้วกด "จบเซต" สรุปผลของเซตนั้นจะแสดงที่นี่
		</p>
		<button
			onclick={onStartNextSet}
			class="flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 font-bold text-black shadow-lg shadow-emerald-500/20 hover:bg-emerald-400"
		>
			<span>ไปที่ Live Studio</span>
			<ArrowRight class="h-4 w-4" />
		</button>
	</div>
	{/if}
</div>

