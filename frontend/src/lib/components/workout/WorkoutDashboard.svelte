<script lang="ts">
	import WorkoutHeader from './WorkoutHeader.svelte';
	import PageReadiness from './PageReadiness.svelte';
	import PageLiveStudio from './PageLiveStudio.svelte';
	import PagePostSet from './PagePostSet.svelte';
	import PageAnalytics from './PageAnalytics.svelte';
	import PageCalibration from './PageCalibration.svelte';

	let activeTab = $state('studio');
</script>

<div class="flex min-h-screen flex-col bg-background text-foreground">
	<WorkoutHeader {activeTab} onTabChange={(tab) => (activeTab = tab)} />

	<main class="flex-1 pb-10">
		{#if activeTab === 'readiness'}
			<PageReadiness onProceed={() => (activeTab = 'studio')} />
		{:else if activeTab === 'studio'}
			<PageLiveStudio onFinishSet={() => (activeTab = 'postset')} />
		{:else if activeTab === 'postset'}
			<PagePostSet
				onStartNextSet={() => (activeTab = 'studio')}
				onFinishSession={() => (activeTab = 'analytics')}
			/>
		{:else if activeTab === 'analytics'}
			<PageAnalytics />
		{:else if activeTab === 'calibration'}
			<PageCalibration />
		{/if}
	</main>
</div>

