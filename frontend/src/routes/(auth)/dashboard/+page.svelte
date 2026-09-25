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
		Pulse
	} from 'phosphor-svelte';

	let { data }: PageProps = $props();

	let currentUser = $derived(data.user);
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

				<!-- Best ROM -->
				<div class="p-3 rounded-xl bg-card border border-border hover:border-border transition">
					<div class="flex items-center justify-between text-muted-foreground mb-1">
						<span class="text-sm">ROM กว้างสุด</span>
						<Compass size={14} class="text-blue-600" />
					</div>
					<div class="text-2xl font-bold tabular-nums text-foreground">
						{currentUser.personalRecords.bestRomDeg}°
					</div>
					<div class="text-xs text-muted-foreground mt-0.5">มุมข้อศอก</div>
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
					<span class="text-base font-semibold text-foreground">ความคลีนและ ROM ย้อนหลัง</span>
				</div>

				<div class="space-y-1.5 tabular-nums text-xs">
					{#each currentUser.formProgression as fp (fp.id)}
						<div class="flex items-center justify-between p-2 rounded-lg bg-muted/50 border border-border">
							<span class="text-muted-foreground text-xs font-sans">{fp.session}</span>
							<div class="flex items-center gap-3">
								<span class="text-foreground/80">{fp.rom}°</span>
								<span class="text-emerald-600 font-semibold">{fp.purity}%</span>
								<span class="text-xs text-muted-foreground">ออกแรง {fp.emgPercent}%</span>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>

		<!-- History Logs Table -->
		<div class="rounded-xl border border-border bg-card p-4 space-y-3">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2">
					<CalendarBlank size={16} class="text-muted-foreground" />
					<span class="text-base font-semibold text-foreground">ประวัติการฝึก</span>
				</div>
				<span class="text-xs tabular-nums text-muted-foreground">{currentUser.historyLogs.length} เซสชัน</span>
			</div>

			{#if currentUser.historyLogs.length === 0}
				<div class="text-center py-6 text-xs text-muted-foreground">
					ยังไม่มีประวัติการฝึก กด "เริ่มออกกำลังกาย" ด้านบนเพื่อเริ่มเซตแรก
				</div>
			{:else}
				<div class="space-y-2">
					{#each currentUser.historyLogs as log (log.id)}
						<div class="p-3 rounded-lg bg-muted/50 border border-border hover:border-border transition">
							<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
								<div class="flex items-center gap-2.5">
									<span class="font-medium text-foreground">{log.exercise}</span>
									<span class="px-1.5 py-0.2 rounded bg-muted text-xs tabular-nums text-foreground/80">{log.weightKg} kg</span>
									<span class="text-muted-foreground tabular-nums text-xs">{log.date}</span>
								</div>

								<div class="flex items-center gap-3 tabular-nums text-xs">
									<span class="text-foreground/80">{log.sets} เซต · {log.totalReps} ครั้ง</span>
									<span class="text-emerald-600 font-semibold">คลีน {log.purity}%</span>
									<span class="text-cyan-600">{log.rom}° ROM</span>
								</div>
							</div>
							{#if log.notes}
								<div class="text-xs text-muted-foreground mt-2 pl-2 border-l border-border font-sans">
									{log.notes}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</main>
</div>
