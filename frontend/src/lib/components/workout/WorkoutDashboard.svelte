<script lang="ts">
	import WorkoutHeader from './WorkoutHeader.svelte';
	import PageReadiness from './PageReadiness.svelte';
	import PageLiveStudio from './PageLiveStudio.svelte';
	import PagePostSet from './PagePostSet.svelte';
	import PageAnalytics from './PageAnalytics.svelte';
	import PageCalibration from './PageCalibration.svelte';
	import { workout } from '$lib/workout/workout.svelte';
</script>

<div class="flex min-h-screen flex-col bg-background text-foreground">
	<WorkoutHeader activeTab={workout.activeTab} onTabChange={(tab) => (workout.activeTab = tab as typeof workout.activeTab)} />

	<main class="flex-1 pb-10">
		{#if workout.activeTab === 'readiness'}
			<PageReadiness onProceed={() => (workout.activeTab = 'studio')} />
		{:else if workout.activeTab === 'studio'}
			<PageLiveStudio onFinishSet={() => (workout.activeTab = 'postset')} />
		{:else if workout.activeTab === 'postset'}
			<PagePostSet
				onStartNextSet={() => (workout.activeTab = 'studio')}
				onFinishSession={() => (workout.activeTab = 'analytics')}
			/>
		{:else if workout.activeTab === 'analytics'}
			<PageAnalytics />
		{:else if workout.activeTab === 'calibration'}
			<PageCalibration />
		{/if}
	</main>
</div>

