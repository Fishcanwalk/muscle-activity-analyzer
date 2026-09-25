<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Lightning, Barbell, Layout, Crown, UsersThree } from 'phosphor-svelte';

	interface Props {
		title: string;
		description?: string;
		children: Snippet;
	}

	let { title, description, children }: Props = $props();

	const links = [
		{ href: '/home', label: 'ออกกำลังกาย', icon: Barbell },
		{ href: '/dashboard', label: 'ภาพรวม', icon: Layout },
		{ href: '/compare', label: 'เทียบผู้ใช้', icon: UsersThree },
		{ href: '/billing', label: 'แพ็กเกจ', icon: Crown }
	] as const;
</script>

<div class="min-h-screen bg-muted/40 pb-12 text-foreground">
	<header class="sticky top-0 z-40 border-b border-border bg-background/90 px-4 py-2.5 backdrop-blur-md">
		<div class="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
			<div class="flex items-center gap-2.5">
				<div class="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted text-emerald-600">
					<Lightning size={18} weight="fill" />
				</div>
				<span class="text-sm font-bold tracking-wider">CYBERPUMP</span>
			</div>
			<nav class="flex flex-wrap items-center gap-1 text-sm">
				{#each links as link (link.href)}
					<a
						href={resolve(link.href)}
						aria-current={page.url.pathname.startsWith(link.href) ? 'page' : undefined}
						class={[
							'flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition',
							page.url.pathname.startsWith(link.href)
								? 'bg-foreground text-background font-semibold'
								: 'text-muted-foreground hover:bg-muted hover:text-foreground'
						]}
					>
						<link.icon size={15} />
						{link.label}
					</a>
				{/each}
			</nav>
		</div>
	</header>

	<main class="mx-auto max-w-4xl space-y-6 px-4 pt-6">
		<div>
			<h1 class="text-2xl font-bold">{title}</h1>
			{#if description}
				<p class="mt-1 text-sm text-muted-foreground">{description}</p>
			{/if}
		</div>
		{@render children()}
	</main>
</div>
