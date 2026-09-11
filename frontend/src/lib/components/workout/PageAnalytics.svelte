<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { history } from '$lib/workout/history.svelte';
	import Chart from 'chart.js/auto';
	import { Trophy } from 'lucide-svelte';

	let volumeCanvas: HTMLCanvasElement | null = $state(null);
	let romCanvas: HTMLCanvasElement | null = $state(null);
	let volumeChart: any = null;
	let romChart: any = null;

	onMount(() => {
		initCharts();
	});

	onDestroy(() => {
		if (volumeChart) volumeChart.destroy();
		if (romChart) romChart.destroy();
	});

	function initCharts() {
		const trend = history.sessionsTrend;
		const labels = trend.map((t) => t.session);
		const volumeData = trend.map((t) => t.cleanVolume);
		const romData = trend.map((t) => t.rom);
		const emgData = trend.map((t) => t.sEmgRms);

		if (volumeCanvas) {
			volumeChart = new Chart(volumeCanvas, {
				type: 'bar',
				data: {
					labels,
					datasets: [
						{
							label: 'Clean Volume Load (Weight × Clean Reps)',
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
						legend: { labels: { color: '#9ca3af' } }
					},
					scales: {
						x: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } },
						y: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } }
					}
				}
			});
		}

		if (romCanvas) {
			romChart = new Chart(romCanvas, {
				type: 'line',
				data: {
					labels,
					datasets: [
						{
							label: 'Average ROM (°)',
							data: romData,
							borderColor: '#06b6d4',
							backgroundColor: 'rgba(6, 182, 212, 0.1)',
							tension: 0.3,
							fill: true,
							yAxisID: 'y'
						},
						{
							label: 'Peak sEMG RMS (µV)',
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
						legend: { labels: { color: '#9ca3af' } }
					},
					scales: {
						x: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } },
						y: {
							type: 'linear',
							display: true,
							position: 'left',
							ticks: { color: '#06b6d4' },
							grid: { color: 'rgba(255,255,255,0.05)' }
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
		}
	}
</script>

<div class="mx-auto flex max-w-6xl flex-col gap-6 p-6">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div>
			<h2 class="text-2xl font-black tracking-tight text-foreground">
				4. Progressive Overload & Fatigue Analytics
			</h2>
			<p class="text-sm text-muted-foreground">
				วิเคราะห์พัฒนาการระยะยาวตามหลักวิทยาศาสตร์การกีฬา ไม่โดนหลอกด้วยน้ำหนักที่เพิ่มจากการโกงท่า
			</p>
		</div>

		<div class="flex gap-2">
			<select class="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground">
				<option>ท่า: Biceps Curl</option>
				<option>ท่า: Hammer Curl</option>
			</select>
			<select class="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground">
				<option>5 เซสชันล่าสุด</option>
				<option>30 วันล่าสุด</option>
			</select>
		</div>
	</div>

	<!-- Takeaway Card -->
	<div
		class="flex items-center gap-5 rounded-xl border border-emerald-500/30 bg-linear-to-r from-emerald-500/10 via-card to-cyan-500/5 p-6 shadow-xl"
	>
		<div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
			<Trophy class="h-8 w-8" />
		</div>
		<div>
			<h3 class="text-base font-bold text-emerald-400">
				สรุปพัฒนาการของวันนี้ (Science-Based Progressive Takeaway)
			</h3>
			<p class="mt-1 text-sm text-foreground leading-relaxed">
				{history.takeawayNote}
			</p>
		</div>
	</div>

	<!-- Delta Comparison Table -->
	<div class="rounded-xl border border-border bg-card p-6 shadow-md">
		<span class="text-xs font-bold text-cyan-400 uppercase">Session-to-Session Comparison</span>
		<h3 class="mt-1 text-lg font-bold text-foreground">
			🧬 การเปรียบเทียบเซสชัน: {history.comparison.previousDate} VS {history.comparison.currentDate}
		</h3>

		<div class="mt-4 overflow-x-auto">
			<table class="w-full text-left text-xs">
				<thead>
					<tr class="border-b border-border bg-background/50 text-muted-foreground uppercase">
						<th class="p-3">ตัวชี้วัดประสิทธิภาพ (Metrics)</th>
						<th class="p-3">เซสชันก่อนหน้า ({history.comparison.previousDate})</th>
						<th class="p-3">เซสชันวันนี้ ({history.comparison.currentDate})</th>
						<th class="p-3">อัตราพัฒนาการ (Delta)</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border">
					{#each history.comparison.metrics as m}
						<tr>
							<td class="p-3 font-semibold text-foreground">{m.name}</td>
							<td class="p-3 text-muted-foreground">{m.prev}</td>
							<td class="p-3 font-bold text-foreground">{m.curr}</td>
							<td class="p-3">
								<span
									class="rounded-full px-2.5 py-0.5 font-bold {m.isPositive
										? 'bg-emerald-500/20 text-emerald-400'
										: 'bg-amber-500/20 text-amber-400'}"
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

	<!-- Trend Charts -->
	<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
		<div class="rounded-xl border border-border bg-card p-5 shadow-md">
			<span class="text-xs font-bold text-cyan-400 uppercase">Clean Volume Progression</span>
			<h3 class="mt-1 text-base font-bold text-foreground">
				📈 Clean Volume Load (น้ำหนัก × ครั้งที่ไม่โกง)
			</h3>
			<div class="relative mt-4 h-64 w-full">
				<canvas bind:this={volumeCanvas}></canvas>
			</div>
		</div>

		<div class="rounded-xl border border-border bg-card p-5 shadow-md">
			<span class="text-xs font-bold text-cyan-400 uppercase">Kinematics & Electrophysiology</span>
			<h3 class="mt-1 text-base font-bold text-foreground">
				📊 ROM Expansion & Neural Drive (sEMG RMS)
			</h3>
			<div class="relative mt-4 h-64 w-full">
				<canvas bind:this={romCanvas}></canvas>
			</div>
		</div>
	</div>
</div>

