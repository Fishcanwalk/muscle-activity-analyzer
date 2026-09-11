<script lang="ts">
	import type { PageProps } from './$types';
	import { enhance } from '$app/forms';
	import { userManager, type UserProfile } from '$lib/workout/user.svelte';
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
		User,
		Target,
		Pulse
	} from 'phosphor-svelte';

	let { data }: PageProps = $props();

	let selectedUser = $state<UserProfile | null>(null);
	let currentUser = $derived<UserProfile>(selectedUser ?? data.user);

	function switchLocalUser(user: UserProfile) {
		selectedUser = user;
		userManager.switchUser(user.email);
	}
</script>

<svelte:head>
	<title>{currentUser.name} - Cyberpump Dashboard</title>
</svelte:head>

<div class="min-h-screen bg-zinc-950 text-zinc-100 pb-12 font-sans antialiased">
	<!-- Top Navigation -->
	<header class="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md px-4 py-2.5">
		<div class="max-w-6xl mx-auto flex items-center justify-between gap-4">
			<!-- Logo -->
			<div class="flex items-center gap-2.5">
				<div class="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-emerald-400">
					<Lightning size={18} weight="fill" />
				</div>
				<div>
					<span class="text-sm font-bold tracking-wider text-zinc-100">CYBERPUMP</span>
					<span class="text-[10px] text-zinc-400 ml-2 font-mono">DASHBOARD</span>
				</div>
			</div>

			<!-- User Switcher & Actions -->
			<div class="flex items-center gap-2">
				<!-- User selector pills -->
				<div class="hidden md:flex items-center gap-1 bg-zinc-900/80 border border-zinc-800 p-1 rounded-lg">
					{#each data.presetUsers as u}
						<form action="?/switchUser" method="POST" use:enhance={() => {
							return async ({ result }) => {
								if (result.type === 'success') {
									switchLocalUser(u);
								}
							};
						}}>
							<input type="hidden" name="email" value={u.email} />
							<button
								type="submit"
								onclick={() => switchLocalUser(u)}
								class="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition {currentUser.email === u.email
									? 'bg-zinc-800 text-zinc-100 font-medium'
									: 'text-zinc-400 hover:text-zinc-200'}"
							>
								<span class="text-[10px] font-mono text-zinc-400">{u.avatar}</span>
								<span>{u.name.split(' ')[0]}</span>
							</button>
						</form>
					{/each}
				</div>

				<a
					href="/home"
					class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs transition shadow-sm"
				>
					<Barbell size={14} weight="bold" />
					<span>Live Studio</span>
					<ArrowUpRight size={12} weight="bold" />
				</a>

				<form action="/logout" method="POST" class="inline">
					<button
						type="submit"
						class="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
						title="Sign Out"
					>
						<SignOut size={16} />
					</button>
				</form>
			</div>
		</div>
	</header>

	<main class="max-w-6xl mx-auto px-4 pt-6 space-y-6">
		<!-- Mobile User Switcher -->
		<div class="flex md:hidden items-center gap-1 overflow-x-auto pb-1">
			{#each data.presetUsers as u}
				<button
					type="button"
					onclick={() => switchLocalUser(u)}
					class="flex items-center gap-1 px-2.5 py-1 rounded text-xs whitespace-nowrap {currentUser.email === u.email
						? 'bg-zinc-800 text-zinc-100 font-medium border border-zinc-700'
						: 'bg-zinc-900 text-zinc-400 border border-zinc-800'}"
				>
					<span class="text-[10px] font-mono text-zinc-400">{u.avatar}</span>
					<span>{u.name.split(' ')[0]}</span>
				</button>
			{/each}
		</div>

		<!-- User Summary Bar -->
		<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
			<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
				<div class="flex items-center gap-3">
					<div class="w-11 h-11 rounded-lg bg-zinc-900 border border-zinc-700/80 flex items-center justify-center font-mono font-bold text-sm text-emerald-400">
						{currentUser.avatar}
					</div>
					<div>
						<div class="flex items-center gap-2">
							<h1 class="text-base font-semibold text-zinc-100">{currentUser.name}</h1>
							<span class="px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700">
								{currentUser.level}
							</span>
						</div>
						<div class="flex items-center gap-3 text-xs text-zinc-400 mt-1 font-mono">
							<span class="flex items-center gap-1">
								<Target size={13} class="text-zinc-400" />
								{currentUser.targetMuscle}
							</span>
							<span>·</span>
							<span class="text-zinc-300 font-semibold">{currentUser.weightKg} kg</span>
						</div>
					</div>
				</div>

				<div class="flex items-center gap-4 text-xs font-mono">
					<div class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800">
						<Flame size={14} class="text-amber-400" weight="fill" />
						<span class="text-zinc-400">Streak:</span>
						<span class="font-semibold text-zinc-200">{currentUser.streakDays}d</span>
					</div>
					<div class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800">
						<ChartBar size={14} class="text-emerald-400" />
						<span class="text-zinc-400">Sessions:</span>
						<span class="font-semibold text-zinc-200">{currentUser.totalSessions}</span>
					</div>
					<div class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800">
						<ShieldCheck size={14} class="text-cyan-400" />
						<span class="text-zinc-400">Purity:</span>
						<span class="font-semibold text-emerald-400">
							{currentUser.formProgression[currentUser.formProgression.length - 1]?.purity || 92}%
						</span>
					</div>
				</div>
			</div>
		</div>

		<!-- PRs Bento Grid -->
		<div>
			<div class="text-xs font-medium text-zinc-400 mb-2.5 flex items-center justify-between">
				<span>PERSONAL RECORDS</span>
				<span class="font-mono text-[10px] text-zinc-400">SCIENCE METRICS</span>
			</div>
			<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
				<!-- Clean Reps -->
				<div class="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800 hover:border-zinc-700 transition">
					<div class="flex items-center justify-between text-zinc-400 mb-1">
						<span class="text-[11px]">Clean Reps</span>
						<CheckCircle size={14} class="text-emerald-400" />
					</div>
					<div class="text-xl font-bold font-mono text-zinc-100">
						{currentUser.personalRecords.maxCleanReps}
						<span class="text-xs text-zinc-400 font-sans font-normal">reps</span>
					</div>
					<div class="text-[10px] text-zinc-400 mt-0.5">Strict form</div>
				</div>

				<!-- Volume -->
				<div class="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800 hover:border-zinc-700 transition">
					<div class="flex items-center justify-between text-zinc-400 mb-1">
						<span class="text-[11px]">Clean Volume</span>
						<Barbell size={14} class="text-emerald-400" />
					</div>
					<div class="text-xl font-bold font-mono text-zinc-100">
						{currentUser.personalRecords.highestVolumeKg}
						<span class="text-xs text-zinc-400 font-sans font-normal">kg</span>
					</div>
					<div class="text-[10px] text-zinc-400 mt-0.5">Tonnage/set</div>
				</div>

				<!-- Longest TUT -->
				<div class="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800 hover:border-zinc-700 transition">
					<div class="flex items-center justify-between text-zinc-400 mb-1">
						<span class="text-[11px]">Max TUT</span>
						<Timer size={14} class="text-amber-400" />
					</div>
					<div class="text-xl font-bold font-mono text-zinc-100">
						{currentUser.personalRecords.longestTutSec}
						<span class="text-xs text-zinc-400 font-sans font-normal">s</span>
					</div>
					<div class="text-[10px] text-zinc-400 mt-0.5">Time under tension</div>
				</div>

				<!-- Peak sEMG -->
				<div class="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800 hover:border-zinc-700 transition">
					<div class="flex items-center justify-between text-zinc-400 mb-1">
						<span class="text-[11px]">Peak sEMG</span>
						<Lightning size={14} class="text-cyan-400" />
					</div>
					<div class="text-xl font-bold font-mono text-zinc-100">
						{currentUser.personalRecords.peakEmgUv}
						<span class="text-xs text-zinc-400 font-sans font-normal">µV</span>
					</div>
					<div class="text-[10px] text-zinc-400 mt-0.5">Motor unit drive</div>
				</div>

				<!-- Best ROM -->
				<div class="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800 hover:border-zinc-700 transition">
					<div class="flex items-center justify-between text-zinc-400 mb-1">
						<span class="text-[11px]">Best ROM</span>
						<Compass size={14} class="text-blue-400" />
					</div>
					<div class="text-xl font-bold font-mono text-zinc-100">
						{currentUser.personalRecords.bestRomDeg}°
					</div>
					<div class="text-[10px] text-zinc-400 mt-0.5">Full stretch</div>
				</div>

				<!-- Cheat Rate -->
				<div class="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800 hover:border-zinc-700 transition">
					<div class="flex items-center justify-between text-zinc-400 mb-1">
						<span class="text-[11px]">Lowest Cheat</span>
						<ShieldCheck size={14} class="text-emerald-400" />
					</div>
					<div class="text-xl font-bold font-mono text-zinc-100">
						{currentUser.personalRecords.lowestCheatPercent}%
					</div>
					<div class="text-[10px] text-zinc-400 mt-0.5">Momentum loss</div>
				</div>
			</div>
		</div>

		<!-- Analytics Section: Two Clean Columns -->
		<div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
			<!-- Weekly Volume Load (Clean vs Cheated) -->
			<div class="lg:col-span-7 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-2">
						<Barbell size={16} class="text-zinc-400" />
						<span class="text-xs font-semibold text-zinc-200 uppercase tracking-wide">Weekly Volume Breakdown</span>
					</div>
					<div class="flex items-center gap-3 text-[11px] font-mono">
						<span class="flex items-center gap-1.5 text-zinc-300">
							<span class="w-2 h-2 rounded-sm bg-emerald-500"></span> Clean
						</span>
						<span class="flex items-center gap-1.5 text-zinc-400">
							<span class="w-2 h-2 rounded-sm bg-zinc-700"></span> Cheat
						</span>
					</div>
				</div>

				<div class="space-y-2.5 pt-1 font-mono text-xs">
					{#each currentUser.weeklyVolume as wv}
						{@const total = wv.clean + wv.cheated}
						{@const cleanPct = Math.round((wv.clean / total) * 100)}
						<div class="space-y-1">
							<div class="flex justify-between text-[11px]">
								<span class="text-zinc-300 font-sans">{wv.week}</span>
								<span class="text-zinc-400">
									<strong class="text-zinc-200">{wv.clean} kg</strong> ({cleanPct}%)
								</span>
							</div>
							<div class="h-2 w-full rounded-full bg-zinc-800 overflow-hidden flex">
								<div class="h-full bg-emerald-500" style="width: {cleanPct}%"></div>
								<div class="h-full bg-zinc-700" style="width: {100 - cleanPct}%"></div>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Form Purity & ROM Progression -->
			<div class="lg:col-span-5 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
				<div class="flex items-center gap-2">
					<Pulse size={16} class="text-zinc-400" />
					<span class="text-xs font-semibold text-zinc-200 uppercase tracking-wide">Purity & ROM History</span>
				</div>

				<div class="space-y-1.5 font-mono text-xs">
					{#each currentUser.formProgression as fp}
						<div class="flex items-center justify-between p-2 rounded-lg bg-zinc-900/60 border border-zinc-850">
							<span class="text-zinc-400 text-[11px] font-sans">{fp.session}</span>
							<div class="flex items-center gap-3">
								<span class="text-zinc-300">{fp.rom}°</span>
								<span class="text-emerald-400 font-semibold">{fp.purity}%</span>
								<span class="text-[10px] text-zinc-400">{fp.emg} µV</span>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>

		<!-- History Logs Table -->
		<div class="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2">
					<CalendarBlank size={16} class="text-zinc-400" />
					<span class="text-xs font-semibold text-zinc-200 uppercase tracking-wide">Workout Logs</span>
				</div>
				<span class="text-[11px] font-mono text-zinc-400">{currentUser.historyLogs.length} sessions</span>
			</div>

			{#if currentUser.historyLogs.length === 0}
				<div class="text-center py-6 text-xs text-zinc-400">
					No past workout history. Start a session in Live Studio.
				</div>
			{:else}
				<div class="space-y-2">
					{#each currentUser.historyLogs as log}
						<div class="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 transition">
							<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
								<div class="flex items-center gap-2.5">
									<span class="font-medium text-zinc-200">{log.exercise}</span>
									<span class="px-1.5 py-0.2 rounded bg-zinc-800 text-[11px] font-mono text-zinc-300">{log.weightKg} kg</span>
									<span class="text-zinc-400 font-mono text-[11px]">{log.date}</span>
								</div>

								<div class="flex items-center gap-3 font-mono text-[11px]">
									<span class="text-zinc-300">{log.sets} sets · {log.totalReps} reps</span>
									<span class="text-emerald-400 font-semibold">{log.purity}% Clean</span>
									<span class="text-cyan-400">{log.rom}° ROM</span>
									<span class="text-amber-400">+{log.pumpDeltaT}°C</span>
								</div>
							</div>
							<div class="text-[11px] text-zinc-400 mt-2 pl-2 border-l border-zinc-700 font-sans">
								{log.notes}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</main>
</div>
