<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { env } from '$env/dynamic/public';
	import { QueryClientProvider } from '@tanstack/svelte-query';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import { logger } from '$lib/logger';

	let { children, data } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>
		{env.PUBLIC_APP_TITLE}
	</title>
</svelte:head>

<Toaster position="top-center" expand={true} richColors />

<QueryClientProvider client={data.queryClient}>
	{@render children?.()}
</QueryClientProvider>
