<script lang="ts">
	import type { PageProps } from './$types';
	import { resolve } from '$app/paths';
	import {
		Lightning,
		Barbell,
		Flame,
		CheckCircle,
		Timer,
		Compass,
		ShieldCheck,
		ChartBar,
		CalendarBlank,
		ArrowUpRight,
		SignOut,
		Target,
		Pulse,
		Crown,
		CaretRight,
		CaretLeft
	} from 'phosphor-svelte';
	import Chart from 'chart.js/auto';
	import { thaiShortDate } from '$lib/workout/metrics';

	let { data }: PageProps = $props();

	let currentUser = $derived(data.user);

	// History + progress chart share one set of filters; the list is paginated on the
	// client (the server sends every session, at most 200 sets' worth).
	const PAGE_SIZE = 8;
	const DAY_MS = 86_400_000;
	const RANGES = [
		{ value: '7', label: '7 วันล่าสุด', days: 7 },
		{ value: '30', label: '30 วันล่าสุด', days: 30 },
		{ value: '90', label: '90 วันล่าสุด', days: 90 },
		{ value: 'all', label: 'ทั้งหมด', days: null }
	] as const;
	// One series per chart (no second y-axis): the lifter picks which measure to follow.
	const METRICS = [
		{ key: 'cleanVolumeKg', label: 'Clean Volume', unit: 'kg', type: 'bar', title: 'ปริมาณงานคลีน (น้ำหนัก × ครั้งที่คลีน)' },
		{ key: 'cleanReps', label: 'ครั้งคลีน', unit: 'ครั้ง', type: 'bar', title: 'จำนวนครั้งที่ทำได้ถูกต้อง' },
		{ key: 'purity', label: 'ท่าคลีน', unit: '%', type: 'line', title: 'ร้อยละท่าคลีน (Form Purity)' },
		{ key: 'peakEmgPercent', label: 'แรงกล้ามเนื้อ', unit: '% MVC', type: 'line', title: 'แรงกล้ามเนื้อสูงสุด (% MVC)' }
	] as const;
	type RangeValue = (typeof RANGES)[number]['value'];
	type MetricKey = (typeof METRICS)[number]['key'];

	let exerciseFilter = $state('all');
	let rangeFilter = $state<RangeValue>('all');
	let metricKey = $state<MetricKey>('cleanVolumeKg');
	let page = $state(1);

	let historyExercises = $derived(
		[...new Set(currentUser.historyLogs.flatMap((log) => log.exercises))].sort()
	);
	let filteredLogs = $derived.by(() => {
		const days = RANGES.find((r) => r.value === rangeFilter)?.days ?? null;
		const cutoff = days === null ? 0 : Date.now() - days * DAY_MS;
		return currentUser.historyLogs.filter(
			(log) =>
				(exerciseFilter === 'all' || log.exercises.includes(exerciseFilter)) &&
				new Date(log.startedAt).getTime() >= cutoff
		);
	});
	let pageCount = $derived(Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE)));
	let currentPage = $derived(Math.min(page, pageCount));
	let pageLogs = $derived(
		filteredLogs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
	);
	let metric = $derived(METRICS.find((m) => m.key === metricKey) ?? METRICS[0]);

	// Chart.js is an imperative widget: the attachment re-runs (destroying the old chart)
	// whenever the filters or the chosen metric change.
	function progressChart(canvas: HTMLCanvasElement) {
		const points = [...filteredLogs].reverse(); // oldest first, left to right
		const m = metric;
		const ink = '#52525b';
		const chart = new Chart(canvas, {
			type: m.type,
			data: {
				labels: points.map((p) => thaiShortDate(p.startedAt)),
				datasets: [
					{
						label: `${m.label} (${m.unit})`,
						data: points.map((p) => p[m.key]),
						backgroundColor: m.type === 'bar' ? 'rgba(16, 185, 129, 0.75)' : '#10b981',
						borderColor: '#10b981',
						borderWidth: 2,
						borderRadius: 4,
						pointRadius: 4,
						pointHoverRadius: 6,
						tension: 0
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				interaction: { mode: 'index', intersect: false },
				plugins: {
					legend: { display: false },
					tooltip: {
						callbacks: {
							title: (items) => {
								const p = points[items[0].dataIndex];
								return `${p.date} · ${p.exercise}`;
							},
							label: (item) => `${m.label}: ${item.formattedValue} ${m.unit}`
						}
					}
				},
				scales: {
					x: { ticks: { color: ink }, grid: { display: false } },
					y: {
						beginAtZero: true,
						max: m.key === 'purity' ? 100 : undefined,
						ticks: { color: ink },
						grid: { color: 'rgba(0,0,0,0.06)' }
					}
				}
			}
		});
		return () => chart.destroy();
	}
</script>

<svelte:head>
	<title>{currentUser.name} - Cyberpump Dashboard</title>
</svelte:head>

<div class="min-h-screen bg-muted/40 text-foreground pb-12 font-sans antialiased">
	<!-- Top Navigation -->
	<header class="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md px-4 py-2.5">
		<div class="max-w-6xl mx-auto flex items-center justify-between gap-4">
			<!-- Logo -->
			<div class="flex items-center gap-2.5">
				<div class="w-8 h-8 rounded-lg bg-muted border border-border flex items-center justify-center text-emerald-600">
					<Lightning size={18} weight="fill" />
				</div>
				<div>
					<span class="text-sm font-bold tracking-wider text-foreground">CYBERPUMP</span>
					<span class="ml-2 text-sm text-muted-foreground">ภาพรวม</span>
				</div>
			</div>

			<!-- Actions -->
			<div class="flex items-center gap-2">
				<a
					href={resolve('/home')}
					class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm transition shadow-sm"
				>
					<Barbell size={14} weight="bold" />
					<span>เริ่มออกกำลังกาย</span>
					<ArrowUpRight size={12} weight="bold" />
				</a>

				<a
					href={resolve('/billing')}
					class="p-1.5 rounded-lg border border-border bg-muted/50 hover:bg-muted text-muted-foreground hover:text-amber-600 transition"
					title="แพ็กเกจ"
				>
					<Crown size={16} />
				</a>

				<form action="/logout" method="POST" class="inline">
					<button
						type="submit"
						class="p-1.5 rounded-lg border border-border bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition"
						title="Sign Out"
					>
						<SignOut size={16} />
					</button>
				</form>
			</div>
		</div>
	</header>

	<main class="max-w-6xl mx-auto px-4 pt-6 space-y-6">
		<!-- User Summary Bar -->
		<div class="rounded-xl border border-border bg-card p-4">
			<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
				<div class="flex items-center gap-3">
					<div class="w-11 h-11 rounded-lg bg-muted border border-border flex items-center justify-center tabular-nums font-bold text-sm text-emerald-600">
						{currentUser.avatar}
					</div>
					<div>
						<div class="flex items-center gap-2">
							<h1 class="text-base font-semibold text-foreground">{currentUser.name}</h1>
							<span class="px-2 py-0.5 rounded text-xs font-medium bg-muted text-foreground/80 border border-border">
								{currentUser.level}
							</span>
						</div>
						<div class="flex items-center gap-3 text-xs text-muted-foreground mt-1 tabular-nums">
							<span class="flex items-center gap-1">
								<Target size={13} class="text-muted-foreground" />
								{currentUser.targetMuscle}
							</span>
							<span>·</span>
							<span class="text-foreground/80 font-semibold">{currentUser.weightKg} kg</span>
						</div>
					</div>
				</div>

				<div class="flex items-center gap-4 text-xs tabular-nums">
					<div class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted border border-border">
						<Flame size={14} class="text-amber-600" weight="fill" />
						<span class="text-muted-foreground">ฝึกติดต่อกัน</span>
						<span class="font-semibold text-foreground">{currentUser.streakDays}d</span>
					</div>
					<div class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted border border-border">
						<ChartBar size={14} class="text-emerald-600" />
						<span class="text-muted-foreground">เซสชัน</span>
						<span class="font-semibold text-foreground">{currentUser.totalSessions}</span>
					</div>
					<div class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted border border-border">
						<ShieldCheck size={14} class="text-cyan-600" />
						<span class="text-muted-foreground">ท่าคลีน</span>
						<span class="font-semibold text-emerald-600">
							{currentUser.formProgression[currentUser.formProgression.length - 1]?.purity ?? 0}%
						</span>
					</div>
				</div>
			</div>
		</div>

		<!-- PRs Bento Grid -->
		<div>
			<h2 class="mb-3 text-base font-semibold text-foreground">สถิติดีที่สุด</h2>
			<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
				<!-- Clean Reps -->
				<div class="p-3 rounded-xl bg-card border border-border hover:border-border transition">
					<div class="flex items-center justify-between text-muted-foreground mb-1">
						<span class="text-sm">ครั้งคลีนสูงสุด</span>
						<CheckCircle size={14} class="text-emerald-600" />
					</div>
					<div class="text-2xl font-bold tabular-nums text-foreground">
						{currentUser.personalRecords.maxCleanReps}
						<span class="text-xs text-muted-foreground font-sans font-normal">reps</span>
					</div>
					<div class="text-xs text-muted-foreground mt-0.5">ในหนึ่งเซต</div>
				</div>

				<!-- Volume -->
				<div class="p-3 rounded-xl bg-card border border-border hover:border-border transition">
					<div class="flex items-center justify-between text-muted-foreground mb-1">
						<span class="text-sm">ปริมาณงานคลีน</span>
						<Barbell size={14} class="text-emerald-600" />
					</div>
					<div class="text-2xl font-bold tabular-nums text-foreground">
						{currentUser.personalRecords.highestVolumeKg}
						<span class="text-xs text-muted-foreground font-sans font-normal">kg</span>
					</div>
					<div class="text-xs text-muted-foreground mt-0.5">น้ำหนัก × ครั้ง ต่อเซต</div>
				</div>

				<!-- Longest TUT -->
				<div class="p-3 rounded-xl bg-card border border-border hover:border-border transition">
					<div class="flex items-center justify-between text-muted-foreground mb-1">
						<span class="text-sm">เวลาเกร็งนานสุด</span>
						<Timer size={14} class="text-amber-600" />
					</div>
					<div class="text-2xl font-bold tabular-nums text-foreground">
						{currentUser.personalRecords.longestTutSec}
						<span class="text-xs text-muted-foreground font-sans font-normal">s</span>
					</div>
					<div class="text-xs text-muted-foreground mt-0.5">Time under tension</div>
				</div>

				<!-- Peak Muscle Effort -->
				<div class="p-3 rounded-xl bg-card border border-border hover:border-border transition">
					<div class="flex items-center justify-between text-muted-foreground mb-1">
						<span class="text-sm">ออกแรงสูงสุด</span>
						<Lightning size={14} class="text-cyan-600" />
					</div>
					<div class="text-2xl font-bold tabular-nums text-foreground">
						{currentUser.personalRecords.peakEmgPercent}
						<span class="text-xs text-muted-foreground font-sans font-normal">%</span>
					</div>
					<div class="text-xs text-muted-foreground mt-0.5">% ของแรงสูงสุดที่เคยทำได้</div>
				</div>

				<!-- Fastest rep -->
				<div class="p-3 rounded-xl bg-card border border-border hover:border-border transition">
					<div class="flex items-center justify-between text-muted-foreground mb-1">
						<span class="text-sm">ความเร็วยกสูงสุด</span>
						<Compass size={14} class="text-blue-600" />
					</div>
					<div class="text-2xl font-bold tabular-nums text-foreground">
						{currentUser.personalRecords.bestVelocityMs} <span class="text-sm font-normal text-muted-foreground">m/s</span>
					</div>
					<div class="text-xs text-muted-foreground mt-0.5">rep ที่เร็วที่สุด</div>
				</div>

				<!-- Cheat Rate -->
				<div class="p-3 rounded-xl bg-card border border-border hover:border-border transition">
					<div class="flex items-center justify-between text-muted-foreground mb-1">
						<span class="text-sm">โกงท่าน้อยสุด</span>
						<ShieldCheck size={14} class="text-emerald-600" />
					</div>
					<div class="text-2xl font-bold tabular-nums text-foreground">
						{currentUser.personalRecords.lowestCheatPercent}%
					</div>
					<div class="text-xs text-muted-foreground mt-0.5">% ของครั้งในเซต</div>
				</div>
			</div>
		</div>

		<!-- Analytics Section: Two Clean Columns -->
		<div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
			<!-- Weekly Volume Load (Clean vs Cheated) -->
			<div class="lg:col-span-7 rounded-xl border border-border bg-card p-4 space-y-3">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-2">
						<Barbell size={16} class="text-muted-foreground" />
						<span class="text-base font-semibold text-foreground">ปริมาณงานรายสัปดาห์</span>
					</div>
					<div class="flex items-center gap-3 text-xs tabular-nums">
						<span class="flex items-center gap-1.5 text-foreground/80">
							<span class="w-2 h-2 rounded-sm bg-emerald-500"></span> คลีน
						</span>
						<span class="flex items-center gap-1.5 text-muted-foreground">
							<span class="w-2 h-2 rounded-sm bg-muted-foreground/25"></span> โกง
						</span>
					</div>
				</div>

				<div class="space-y-2.5 pt-1 tabular-nums text-xs">
					{#each currentUser.weeklyVolume as wv (wv.week)}
						{@const total = wv.clean + wv.cheated}
						{@const cleanPct = total > 0 ? Math.round((wv.clean / total) * 100) : 0}
						<div class="space-y-1">
							<div class="flex justify-between text-xs">
								<span class="text-foreground/80 font-sans">{wv.week}</span>
								<span class="text-muted-foreground">
									<strong class="text-foreground">{wv.clean} kg</strong> ({cleanPct}%)
								</span>
							</div>
							<div class="h-2 w-full rounded-full bg-muted overflow-hidden flex">
								<div class="h-full bg-emerald-500" style="width: {cleanPct}%"></div>
								<div class="h-full bg-muted-foreground/25" style="width: {100 - cleanPct}%"></div>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Form Purity & ROM Progression -->
			<div class="lg:col-span-5 rounded-xl border border-border bg-card p-4 space-y-3">
				<div class="flex items-center gap-2">
					<Pulse size={16} class="text-muted-foreground" />
					<span class="text-base font-semibold text-foreground">ความคลีนและแรงกล้ามเนื้อย้อนหลัง</span>
				</div>

				<div class="space-y-1.5 tabular-nums text-xs">
					{#each currentUser.formProgression as fp (fp.id)}
						<div class="flex items-center justify-between p-2 rounded-lg bg-muted/50 border border-border">
							<span class="text-muted-foreground text-xs font-sans">{fp.session}</span>
							<div class="flex items-center gap-3">
								<span class="text-emerald-600 font-semibold">{fp.purity}%</span>
								<span class="text-xs text-muted-foreground">ออกแรง {fp.emgPercent}%</span>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>

		<!-- History + progress: one card, one filter row for both the chart and the list -->
		<div class="rounded-xl border border-border bg-card p-4 space-y-4">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div class="flex items-center gap-2">
					<CalendarBlank size={16} class="text-muted-foreground" />
					<span class="text-base font-semibold text-foreground">ประวัติการฝึกและพัฒนาการ</span>
				</div>
				<div class="flex flex-wrap items-center gap-2 text-sm">
					<select
						bind:value={exerciseFilter}
						onchange={() => (page = 1)}
						aria-label="กรองตามท่า"
						class="h-9 rounded-lg border border-input bg-background px-2.5"
					>
						<option value="all">ทุกท่า</option>
						{#each historyExercises as ex (ex)}
							<option value={ex}>{ex}</option>
						{/each}
					</select>
					<select
						bind:value={rangeFilter}
						onchange={() => (page = 1)}
						aria-label="ช่วงเวลา"
						class="h-9 rounded-lg border border-input bg-background px-2.5"
					>
						{#each RANGES as r (r.value)}
							<option value={r.value}>{r.label}</option>
						{/each}
					</select>
				</div>
			</div>

			{#if currentUser.historyLogs.length === 0}
				<div class="text-center py-6 text-xs text-muted-foreground">
					ยังไม่มีประวัติการฝึก กด "เริ่มออกกำลังกาย" ด้านบนเพื่อเริ่มเซตแรก
				</div>
			{:else if filteredLogs.length === 0}
				<div class="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
					ไม่มี session ที่ตรงกับตัวกรองนี้ ลองเลือกท่าหรือช่วงเวลาอื่น
				</div>
			{:else}
				<!-- Progress chart -->
				<div class="space-y-3 rounded-lg border border-border bg-background/60 p-3">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<div class="flex items-center gap-2">
							<Pulse size={15} class="text-muted-foreground" />
							<span class="text-sm font-semibold text-foreground">{metric.title}</span>
						</div>
						<div class="flex rounded-lg border border-border bg-muted/60 p-0.5" role="group" aria-label="เลือกตัวชี้วัด">
							{#each METRICS as m (m.key)}
								<button
									type="button"
									onclick={() => (metricKey = m.key)}
									aria-pressed={metricKey === m.key}
									class={[
										'rounded-md px-2.5 py-1 text-xs transition',
										metricKey === m.key
											? 'bg-background font-semibold text-foreground shadow-sm'
											: 'text-muted-foreground hover:text-foreground'
									]}
								>
									{m.label}
								</button>
							{/each}
						</div>
					</div>
					<div class="relative h-56 w-full">
						<canvas {@attach progressChart} aria-label="{metric.title} ของ {filteredLogs.length} session"></canvas>
					</div>
				</div>

				<!-- Session list -->
				<div class="space-y-2">
					{#each pageLogs as log (log.id)}
						<a
							href={resolve('/(auth)/sessions/[id]', { id: log.id })}
							class="group block p-3 rounded-lg bg-muted/50 border border-border hover:border-foreground/30 hover:bg-muted transition"
						>
							<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
								<div class="flex items-center gap-2.5">
									<span class="font-medium text-foreground">{log.exercise}</span>
									<span class="px-1.5 py-0.2 rounded bg-muted text-xs tabular-nums text-foreground/80">{log.weightKg} kg</span>
									<span class="text-muted-foreground tabular-nums text-xs">{log.date}</span>
								</div>

								<div class="flex items-center gap-3 tabular-nums text-xs">
									<span class="text-foreground/80">{log.sets} เซต · {log.totalReps} ครั้ง</span>
									<span class="text-emerald-600 font-semibold">คลีน {log.purity}%</span>
									<span class="flex items-center gap-0.5 text-muted-foreground group-hover:text-foreground">
										ดูรายละเอียด <CaretRight size={12} />
									</span>
								</div>
							</div>
							{#if log.notes}
								<div class="text-xs text-muted-foreground mt-2 pl-2 border-l border-border font-sans">
									{log.notes}
								</div>
							{/if}
						</a>
					{/each}
				</div>

				<!-- Pagination -->
				<div class="flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums text-muted-foreground">
					<span>
						แสดง {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredLogs.length)}
						จาก {filteredLogs.length} session
					</span>
					{#if pageCount > 1}
						<div class="flex items-center gap-1">
							<button
								type="button"
								onclick={() => (page = currentPage - 1)}
								disabled={currentPage === 1}
								class="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
							>
								<CaretLeft size={12} /> ก่อนหน้า
							</button>
							<span class="px-2">หน้า {currentPage} / {pageCount}</span>
							<button
								type="button"
								onclick={() => (page = currentPage + 1)}
								disabled={currentPage === pageCount}
								class="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
							>
								ถัดไป <CaretRight size={12} />
							</button>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</main>
</div>
