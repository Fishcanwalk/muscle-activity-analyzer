<script lang="ts">
	import type { PageProps } from './$types';
	import WorkoutDashboard from '$lib/components/workout/WorkoutDashboard.svelte';

	let { data }: PageProps = $props();
</script>

<WorkoutDashboard />
