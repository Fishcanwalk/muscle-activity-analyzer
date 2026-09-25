<script lang="ts">
	import RegisterForm from './register-form.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<div class="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
	<RegisterForm form={data.form} />
</div>
