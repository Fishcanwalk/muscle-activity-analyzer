<script lang="ts">
	import { telemetry } from '$lib/workout/telemetry.svelte';
	import { workout } from '$lib/workout/workout.svelte';
	import { userManager } from '$lib/workout/user.svelte';
	import {
		Lightning,
		Barbell,
		Timer,
		TrendUp,
		Gear,
		Heartbeat,
		Layout,
		SignOut,
		Flask,
		Plug
	} from 'phosphor-svelte';

	interface Props {
		activeTab: string;
		onTabChange: (tab: string) => void;
	}

	let { activeTab, onTabChange }: Props = $props();

	function toggleSimulation() {
		if (telemetry.isSimulating) {
			telemetry.stopSimulation();
		} else {
			telemetry.startSimulation();
		}
	}
</script>

<header class="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/90 px-4 pt-2.5 pb-0 backdrop-blur-md">
	<div class="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 pb-2.5">
		<!-- Brand -->
		<div class="flex items-center gap-2.5">
			<div class="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-emerald-400">
				<Lightning size={18} weight="fill" />
			</div>
			<div>
				<div class="text-sm font-bold tracking-wider text-zinc-100">CYBERPUMP</div>
				<div class="text-[10px] text-zinc-400 font-mono tracking-tight uppercase">
					Performance & Biofeedback
				</div>
			</div>
		</div>

		<!-- Status Indicators & User -->
		<div class="flex flex-wrap items-center gap-2 text-xs font-mono">
			<!-- Active User Profile Pill -->
			<a
				href="/dashboard"
				class="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-850 px-2.5 py-1 text-zinc-200 transition group"
				title="User: {userManager.currentUser.name}"
			>
				<span class="w-5 h-5 rounded bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-emerald-400">
					{userManager.currentUser.avatar}
				</span>
				<span class="text-xs font-sans text-zinc-300 group-hover:text-emerald-400 transition-colors">
					{userManager.currentUser.name.split(' ')[0]}
				</span>
			</a>

			<!-- Devices -->
			<div class="hidden sm:flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-400">
				<span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
				<span>Uno R3</span>
			</div>
			<div class="hidden sm:flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-400">
				<span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
				<span>ESP32</span>
			</div>
			<div class="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-400">
				<span class="w-1.5 h-1.5 rounded-full bg-cyan-500"></span>
				<span>CV {telemetry.cv.fps} FPS</span>
			</div>

			<!-- Live / Sim Toggle -->
			<button
				onclick={toggleSimulation}
				class="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-sans transition {telemetry.isSimulating
					? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400'
					: 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'}"
			>
				{#if telemetry.isSimulating}
					<Flask size={13} weight="fill" />
					<span>Sim: 50Hz</span>
				{:else}
					<Plug size={13} />
					<span>Hardware</span>
				{/if}
			</button>

			<!-- Logout -->
			<form action="/logout" method="POST" class="inline">
				<button
					type="submit"
					class="p-1 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-rose-400 transition"
					title="Sign Out"
				>
					<SignOut size={15} />
				</button>
			</form>
		</div>
	</div>

	<!-- Navigation Tabs -->
	<nav class="max-w-7xl mx-auto flex gap-1 overflow-x-auto border-t border-zinc-800/80 pt-1 text-xs font-medium">
		<a
			href="/dashboard"
			class="flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-zinc-400 hover:text-zinc-200 transition whitespace-nowrap"
		>
			<Layout size={14} class="text-emerald-400" />
			<span>Dashboard</span>
		</a>

		<button
			onclick={() => onTabChange('readiness')}
			class="flex items-center gap-1.5 border-b-2 px-3 py-2 transition whitespace-nowrap {activeTab === 'readiness'
				? 'border-emerald-500 text-zinc-100 font-semibold'
				: 'border-transparent text-zinc-400 hover:text-zinc-200'}"
		>
			<Heartbeat size={14} class="text-emerald-400" />
			<span>Readiness</span>
		</button>

		<button
			onclick={() => onTabChange('studio')}
			class="flex items-center gap-1.5 border-b-2 px-3 py-2 transition whitespace-nowrap {activeTab === 'studio'
				? 'border-emerald-500 text-zinc-100 font-semibold'
				: 'border-transparent text-zinc-400 hover:text-zinc-200'}"
		>
			<Barbell size={14} class="text-cyan-400" />
			<span>Live Studio</span>
			{#if workout.isSetRunning}
				<span class="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
			{/if}
		</button>

		<button
			onclick={() => onTabChange('postset')}
			class="flex items-center gap-1.5 border-b-2 px-3 py-2 transition whitespace-nowrap {activeTab === 'postset'
				? 'border-emerald-500 text-zinc-100 font-semibold'
				: 'border-transparent text-zinc-400 hover:text-zinc-200'}"
		>
			<Timer size={14} class="text-amber-400" />
			<span>Post-Set</span>
		</button>

		<button
			onclick={() => onTabChange('analytics')}
			class="flex items-center gap-1.5 border-b-2 px-3 py-2 transition whitespace-nowrap {activeTab === 'analytics'
				? 'border-emerald-500 text-zinc-100 font-semibold'
				: 'border-transparent text-zinc-400 hover:text-zinc-200'}"
		>
			<TrendUp size={14} class="text-purple-400" />
			<span>Overload</span>
		</button>

		<button
			onclick={() => onTabChange('calibration')}
			class="flex items-center gap-1.5 border-b-2 px-3 py-2 transition whitespace-nowrap {activeTab === 'calibration'
				? 'border-emerald-500 text-zinc-100 font-semibold'
				: 'border-transparent text-zinc-400 hover:text-zinc-200'}"
		>
			<Gear size={14} class="text-zinc-400" />
			<span>Calibration</span>
		</button>
	</nav>
</header>
