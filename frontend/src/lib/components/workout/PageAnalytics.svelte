<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { history, type HistoryRange } from '$lib/workout/history.svelte';
	import Chart from 'chart.js/auto';
	import { Trophy, RotateCcw, LayoutDashboard } from 'lucide-svelte';

	interface Props {
		onStartNewWorkout: () => void;
	}

	let { onStartNewWorkout }: Props = $props();

	// Refetch every time the tab opens so sets saved earlier in this workout show up.
	onMount(() => {
		history.load();
	});

	// Chart.js instances are imperative DOM widgets. Each attachment re-runs (destroying
	// the previous chart via its cleanup) whenever the filtered trend data changes.
	function volumeChart(canvas: HTMLCanvasElement) {
		const trend = history.sessionsTrend;
		const labels = trend.map((t) => t.session);
		const volumeData = trend.map((t) => t.cleanVolume);

		const chart = new Chart(canvas, {
			type: 'bar',
			data: {
				labels,
				datasets: [
					{
						label: 'ปริมาณงานคลีน (kg)',
						data: volumeData,
						backgroundColor: 'rgba(16, 185, 129, 0.6)',
						borderColor: '#10b981',
						borderWidth: 2,
						borderRadius: 6
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: { labels: { color: '#52525b' } }
				},
				scales: {
					x: { ticks: { color: '#52525b' }, grid: { color: 'rgba(0,0,0,0.06)' } },
					y: { ticks: { color: '#52525b' }, grid: { color: 'rgba(0,0,0,0.06)' } }
				}
			}
		});
		return () => chart.destroy();
	}

	function romChart(canvas: HTMLCanvasElement) {
		const trend = history.sessionsTrend;
		const labels = trend.map((t) => t.session);
		const romData = trend.map((t) => t.rom);
		const emgData = trend.map((t) => t.sEmgRms);

		const chart = new Chart(canvas, {
			type: 'line',
			data: {
				labels,
				datasets: [
					{
						label: 'ROM เฉลี่ย (°)',
						data: romData,
						borderColor: '#06b6d4',
						backgroundColor: 'rgba(6, 182, 212, 0.1)',
						tension: 0.3,
						fill: true,
						yAxisID: 'y'
					},
					{
						label: 'ออกแรงกล้ามเนื้อสูงสุด (%)',
						data: emgData,
						borderColor: '#a855f7',
						backgroundColor: 'transparent',
						borderDash: [5, 5],
						tension: 0.3,
						yAxisID: 'y1'
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: { labels: { color: '#52525b' } }
				},
				scales: {
					x: { ticks: { color: '#52525b' }, grid: { color: 'rgba(0,0,0,0.06)' } },
					y: {
						type: 'linear',
						display: true,
						position: 'left',
						ticks: { color: '#06b6d4' },
						grid: { color: 'rgba(0,0,0,0.06)' }
					},
					y1: {
						type: 'linear',
						display: true,
						position: 'right',
						ticks: { color: '#a855f7' },
						grid: { drawOnChartArea: false }
					}
				}
			}
		});
		return () => chart.destroy();
	}
</script>

<div class="mx-auto flex max-w-6xl flex-col gap-6 p-6">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div>
			<h2 class="text-2xl font-black tracking-tight text-foreground">
				ขั้นที่ 5 · พัฒนาการ
			</h2>
			<p class="text-sm text-muted-foreground">
				วิเคราะห์พัฒนาการระยะยาวตามหลักวิทยาศาสตร์การกีฬา ไม่โดนหลอกด้วยน้ำหนักที่เพิ่มจากการโกงท่า
			</p>
		</div>

		<div class="flex flex-wrap gap-2">
			<select
				bind:value={history.exerciseFilter}
				class="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground"
			>
				<option value="all">ท่า: ทั้งหมด</option>
				{#each history.exercises as ex (ex)}
					<option value={ex}>ท่า: {ex}</option>
				{/each}
			</select>
			<select
				value={history.range}
				onchange={(e) => (history.range = e.currentTarget.value as HistoryRange)}
				class="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground"
			>
				<option value="last5">5 เซสชันล่าสุด</option>
				<option value="last30days">30 วันล่าสุด</option>
				<option value="all">ทั้งหมด</option>
			</select>
			<a
				href={resolve('/dashboard')}
				class="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
			>
				<LayoutDashboard class="h-3.5 w-3.5" />
				<span>Dashboard</span>
			</a>
			<button
				onclick={onStartNewWorkout}
				class="flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-bold text-black hover:bg-emerald-400"
			>
				<RotateCcw class="h-3.5 w-3.5" />
				<span>เริ่มเวิร์กเอาต์ใหม่</span>
			</button>
		</div>
	</div>

	<!-- Takeaway Card -->
	<div
		class="flex items-center gap-5 rounded-xl border border-emerald-500/30 bg-linear-to-r from-emerald-500/10 via-card to-cyan-500/5 p-6 shadow-xl"
	>
		<div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-600">
			<Trophy class="h-8 w-8" />
		</div>
		<div>
			<h3 class="text-base font-bold text-emerald-600">
				สรุปพัฒนาการล่าสุด
			</h3>
			<p class="mt-1 text-sm text-foreground leading-relaxed">
				{history.takeawayNote}
			</p>
		</div>
	</div>

	<!-- Delta Comparison Table -->
	{#if history.comparison}
	<div class="rounded-xl border border-border bg-card p-6 shadow-md">
		<h3 class="text-lg font-bold text-foreground">เทียบกับเซสชันก่อนหน้า</h3>
		<p class="mt-1 text-sm text-muted-foreground">
			{history.comparison.previousDate} → {history.comparison.currentDate}
		</p>

		<div class="mt-4 overflow-x-auto">
			<table class="w-full text-left text-sm">
				<thead>
					<tr class="border-b border-border bg-background/50 text-muted-foreground uppercase">
						<th class="p-3">ตัวชี้วัดประสิทธิภาพ (Metrics)</th>
						<th class="p-3">เซสชันก่อนหน้า ({history.comparison.previousDate})</th>
						<th class="p-3">เซสชันล่าสุด ({history.comparison.currentDate})</th>
						<th class="p-3">อัตราพัฒนาการ (Delta)</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border">
					{#each history.comparison.metrics as m (m.name)}
						<tr>
							<td class="p-3 font-semibold text-foreground">{m.name}</td>
							<td class="p-3 text-muted-foreground">{m.prev}</td>
							<td class="p-3 font-bold text-foreground">{m.curr}</td>
							<td class="p-3">
								<span
									class="rounded-full px-2.5 py-0.5 font-bold {m.isPositive
										? 'bg-emerald-500/20 text-emerald-600'
										: 'bg-amber-500/20 text-amber-600'}"
								>
									{m.delta}
								</span>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
	{/if}

	<!-- Trend Charts -->
	{#if history.status === 'ready' && history.sessionsTrend.length === 0}
		<div class="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
			ยังไม่มีเซสชันที่ตรงกับตัวกรองนี้ กราฟพัฒนาการจะแสดงเมื่อบันทึกผลเซตแล้ว
		</div>
	{:else}
	<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
		<div class="rounded-xl border border-border bg-card p-5 shadow-md">
			<h3 class="text-base font-bold text-foreground">
				ปริมาณงานที่ไม่โกง (น้ำหนัก × ครั้งที่คลีน)
			</h3>
			<div class="relative mt-4 h-64 w-full">
				<canvas {@attach volumeChart}></canvas>
			</div>
		</div>

		<div class="rounded-xl border border-border bg-card p-5 shadow-md">
			<h3 class="text-base font-bold text-foreground">
				ช่วงการเคลื่อนไหว (ROM) & แรงกล้ามเนื้อ
			</h3>
			<div class="relative mt-4 h-64 w-full">
				<canvas {@attach romChart}></canvas>
			</div>
		</div>
	</div>
	{/if}
</div>
