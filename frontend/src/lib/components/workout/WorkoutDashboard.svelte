<script lang="ts">
	import WorkoutHeader from './WorkoutHeader.svelte';
	import PageReadiness from './PageReadiness.svelte';
	import PageLiveStudio from './PageLiveStudio.svelte';
	import PagePostSet from './PagePostSet.svelte';
	import PageAnalytics from './PageAnalytics.svelte';
	import PageCalibration from './PageCalibration.svelte';
	import { onMount } from 'svelte';
	import { workout } from '$lib/workout/workout.svelte';
	import { calibration } from '$lib/workout/calibration.svelte';

	interface Props {
		user: { name?: string; email: string; avatar?: string | null; [key: string]: unknown };
	}

	let { user }: Props = $props();

	// Client-only: `workout`/`calibration` are module singletons, which during SSR
	// would be shared across every request, so they're only seeded after mount.
	onMount(() => {
		calibration.restoreOrStartFresh();
		workout.initTab();
	});
</script>

<div class="flex min-h-screen flex-col bg-background text-foreground">
	<WorkoutHeader
		activeTab={workout.activeTab}
		onTabChange={(tab) => (workout.activeTab = tab)}
		{user}
	/>

	<main class="flex-1 pb-10">
		{#if workout.activeTab === 'readiness'}
			<PageReadiness
				onProceed={() => (workout.activeTab = 'studio')}
				onGoCalibrate={() => (workout.activeTab = 'calibration')}
			/>
		{:else if workout.activeTab === 'studio'}
			<PageLiveStudio
				onFinishSet={() => (workout.activeTab = 'postset')}
				onGoCalibrate={() => (workout.activeTab = 'calibration')}
			/>
		{:else if workout.activeTab === 'postset'}
			<PagePostSet
				onStartNextSet={() => (workout.activeTab = 'studio')}
				onFinishSession={() => (workout.activeTab = 'analytics')}
			/>
		{:else if workout.activeTab === 'analytics'}
			<PageAnalytics onStartNewWorkout={() => (workout.activeTab = 'calibration')} />
		{:else if workout.activeTab === 'calibration'}
			<PageCalibration onProceed={() => (workout.activeTab = 'readiness')} />
		{/if}
	</main>
</div>

