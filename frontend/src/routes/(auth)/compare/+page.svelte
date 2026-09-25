<script lang="ts">
	import type { PageProps } from './$types';
	import { resolve } from '$app/paths';
	import { MagnifyingGlass, CaretRight } from 'phosphor-svelte';
	import AccountShell from '$lib/components/account/AccountShell.svelte';
	import { thaiDate } from '$lib/workout/metrics';

	let { data }: PageProps = $props();

	let query = $state('');
	let users = $derived(
		(data.users ?? []).filter((u) => u.name.toLowerCase().includes(query.trim().toLowerCase()))
	);

	// First letter of the first two words, skipping punctuation like "(นนท์)"'s bracket.
	function initials(name: string): string {
		const letters = name
			.split(/\s+/)
			.map((word) => word.match(/\p{L}/u)?.[0])
			.filter(Boolean);
		return letters.length ? letters.slice(0, 2).join('').toUpperCase() : '??';
	}
</script>

<svelte:head>
	<title>เทียบกับผู้ใช้อื่น - Cyberpump</title>
</svelte:head>

<AccountShell
	title="เทียบกับผู้ใช้อื่น"
	description="เลือกผู้ใช้ที่ต้องการเทียบ performance แล้วดูว่าคุณนำหรือตามในตัวชี้วัดไหน"
>
	{#if !data.users}
		<p class="rounded-xl border border-border bg-card p-5 text-sm text-rose-600">โหลดรายชื่อผู้ใช้ไม่สำเร็จ</p>
	{:else}
		<label class="relative block">
			<MagnifyingGlass size={18} class="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
			<input
				bind:value={query}
				placeholder="ค้นหาชื่อผู้ใช้"
				class="h-11 w-full rounded-lg border border-input bg-card pr-3 pl-10 text-base outline-none focus:ring-2 focus:ring-emerald-500/40"
			/>
		</label>

		{#if users.length === 0}
			<p class="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
				{data.users.length === 0 ? 'ยังไม่มีผู้ใช้อื่นในระบบ' : 'ไม่พบผู้ใช้ที่ตรงกับคำค้นหา'}
			</p>
		{:else}
			<ul class="grid gap-3 sm:grid-cols-2">
				{#each users as user (user.id)}
					{@const hasData = user.setCount > 0}
					<li>
						{#if hasData}
							<a
								href={resolve('/(auth)/compare/[userId]', { userId: user.id })}
								class="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-emerald-500/60 hover:shadow-md"
							>
								<span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-sm font-bold text-emerald-700">
									{user.avatar || initials(user.name)}
								</span>
								<span class="min-w-0 flex-1">
									<span class="block truncate font-semibold">{user.name}</span>
									<span class="block text-sm text-muted-foreground">
										{user.sessionCount} session · ฝึกล่าสุด {user.lastWorkoutAt ? thaiDate(user.lastWorkoutAt) : '–'}
									</span>
								</span>
								<CaretRight size={18} class="text-muted-foreground" />
							</a>
						{:else}
							<div class="flex items-center gap-3 rounded-xl border border-dashed border-border bg-card/60 p-4 opacity-70">
								<span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-bold text-muted-foreground">
									{user.avatar || initials(user.name)}
								</span>
								<span class="min-w-0 flex-1">
									<span class="block truncate font-semibold">{user.name}</span>
									<span class="block text-sm text-muted-foreground">ยังไม่มีข้อมูลการฝึก</span>
								</span>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		<p class="text-xs text-muted-foreground">
			ผู้ใช้ทุกคนดูสถิติการฝึกของกันและกันได้ ระบบแสดงเฉพาะชื่อและผลการฝึก ไม่แสดงอีเมล
		</p>
	{/if}
</AccountShell>
