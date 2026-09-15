<script lang="ts">
	import LoginForm from './login-form.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<div class="dark flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
	<LoginForm form={data.form} />
</div>
