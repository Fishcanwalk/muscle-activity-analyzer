<script lang="ts">
	import type { PageProps } from './$types';
	import { resolve } from '$app/paths';
	import { ArrowLeft, CheckCircle, Warning, ArrowRight } from 'phosphor-svelte';
	import AccountShell from '$lib/components/account/AccountShell.svelte';
	import { formatDec } from '$lib/utils/format';
	import {
		compareSessions,
		groupSetsIntoSessions,
		summarizeSets,
		thaiDate,
		thaiTime,
		uvToMvcPercent,
		DEFAULT_MVC_UV,
		type SetResult
	} from '$lib/workout/metrics';

	let { data }: PageProps = $props();

	let session = $derived(summarizeSets('current', data.sets)!);
	let previous = $derived(groupSetsIntoSessions(data.previous)[0] ?? null);
	let comparisonRows = $derived(previous ? compareSessions(previous, session) : null);

	let lastSet = $derived(session.sets.at(-1)!);
	let bestVelocity = $derived(
		Math.max(0, ...session.sets.flatMap((s) => (s.reps ?? []).map((r) => r.concentricVelocity)))
	);
	let effectiveReps = $derived(session.sets.reduce((sum, s) => sum + s.effectiveReps, 0));

	const repPeakPct = (set: SetResult, peakUv: number) =>
		uvToMvcPercent(peakUv, set.emgMvcUv ?? DEFAULT_MVC_UV);

	let tiles = $derived([
		{ label: 'จำนวนเซต', value: `${session.sets.length}` },
		{ label: 'ครั้งทั้งหมด', value: `${session.totalReps}`, hint: `คลีน ${session.cleanReps} · โกง ${session.cheatedReps}` },
		{ label: 'Form Purity', value: `${session.purityPercent}%`, hint: 'สัดส่วนครั้งที่ท่าคลีน' },
		{ label: 'Clean Volume', value: `${formatDec(session.cleanVolumeKg, 1)} kg`, hint: 'น้ำหนัก × ครั้งที่คลีน' },
		{ label: 'น้ำหนักสูงสุด', value: `${formatDec(session.maxWeightKg, 1)} kg` },
		{ label: 'EMG สูงสุด', value: `${session.peakEmgPercent}%`, hint: 'ของแรงเกร็งสุด (MVC) ที่ calibrate ไว้' },
		{ label: 'High-Tension TUT', value: `${formatDec(session.highTensionTutSeconds, 1)} วินาที` },
		{ label: 'ความเร็วสูงสุด', value: `${formatDec(bestVelocity, 2)} m/s`, hint: `Effective reps ${effectiveReps} ครั้ง` }
	]);
</script>

<svelte:head>
	<title>Session {thaiDate(session.startedAt)} - Cyberpump</title>
</svelte:head>

<AccountShell
	title="Session {thaiDate(session.startedAt)}"
	description="{thaiTime(session.startedAt)}–{thaiTime(lastSet.created_at)} น. · {session.exercises.join(', ')}"
>
	<a
		href={resolve('/dashboard')}
		class="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
	>
		<ArrowLeft size={14} /> กลับไปภาพรวม
	</a>

	<section class="grid grid-cols-2 gap-3 sm:grid-cols-4">
		{#each tiles as tile (tile.label)}
			<div class="rounded-xl border border-border bg-card p-4 shadow-sm">
				<p class="text-sm text-muted-foreground">{tile.label}</p>
				<p class="mt-1 text-xl font-bold tabular-nums">{tile.value}</p>
				{#if tile.hint}<p class="mt-0.5 text-xs text-muted-foreground">{tile.hint}</p>{/if}
			</div>
		{/each}
	</section>

	{#each session.sets as set (set.id)}
		{@const reps = set.reps ?? []}
		<section class="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
			<div class="flex flex-wrap items-baseline justify-between gap-2">
				<h2 class="text-lg font-semibold">
					เซต {set.setNumber} · {set.exercise}
					<span class="text-sm font-normal text-muted-foreground">{formatDec(set.weightKg, 1)} kg</span>
				</h2>
				<p class="text-sm text-muted-foreground tabular-nums">
					{thaiTime(set.created_at)} น. · {Math.round(set.durationSeconds)} วินาที
				</p>
			</div>

			<div class="flex flex-wrap gap-x-5 gap-y-1 text-sm tabular-nums">
				<span>คลีน <strong>{set.cleanReps}</strong>/{set.totalReps} ครั้ง</span>
				<span>Purity <strong>{set.formPurityPercent}%</strong></span>
				<span>Effective <strong>{set.effectiveReps}</strong> ครั้ง</span>
				<span>TUT <strong>{formatDec(set.highTensionTutSeconds, 1)}</strong> วินาที</span>
			</div>

			{#if reps.length === 0}
				<p class="rounded-lg bg-muted/50 p-4 text-center text-sm text-muted-foreground">
					เซตนี้ไม่มี rep ที่นับได้
				</p>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full text-left text-sm">
						<thead>
							<tr class="border-b border-border text-muted-foreground">
								<th class="p-2">ครั้งที่</th>
								<th class="p-2">ท่า</th>
								<th class="p-2">EMG สูงสุด</th>
								<th class="p-2">ความเร็ว</th>
								<th class="p-2">ความเร็วตก</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-border tabular-nums">
							{#each reps as rep (rep.repNumber)}
								<tr>
									<td class="p-2 font-medium">{rep.repNumber}</td>
									<td class="p-2">
										{#if rep.isClean}
											<span class="inline-flex items-center gap-1 text-emerald-700">
												<CheckCircle size={14} weight="fill" /> คลีน
											</span>
										{:else}
											<span class="inline-flex items-center gap-1 text-amber-700">
												<Warning size={14} weight="fill" /> โกง
												{#if rep.cheatReason}<span class="text-xs text-muted-foreground">({rep.cheatReason})</span>{/if}
											</span>
										{/if}
									</td>
									<td class="p-2">{repPeakPct(set, rep.peakEmg)}% MVC</td>
									<td class="p-2">{formatDec(rep.concentricVelocity, 2)} m/s</td>
									<td class="p-2">{Math.round(rep.velocityLossPercent)}%</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>
	{/each}

	<section class="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
		<div class="flex flex-wrap items-baseline justify-between gap-2">
			<h2 class="text-lg font-semibold">เทียบกับ session ก่อนหน้า</h2>
			{#if previous}
				<a
					href={resolve('/(auth)/sessions/[id]', { id: previous.id })}
					class="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline"
				>
					ดู session {thaiDate(previous.startedAt)} <ArrowRight size={14} />
				</a>
			{/if}
		</div>

		{#if !comparisonRows}
			<p class="text-sm text-muted-foreground">ไม่มี session ก่อนหน้าให้เทียบ</p>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full text-left text-sm">
					<thead>
						<tr class="border-b border-border text-muted-foreground">
							<th class="p-3">ตัวชี้วัด</th>
							<th class="p-3">ครั้งก่อน</th>
							<th class="p-3">ครั้งนี้</th>
							<th class="p-3">เปลี่ยนแปลง</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border">
						{#each comparisonRows as m (m.name)}
							<tr>
								<td class="p-3 font-medium">{m.name}</td>
								<td class="p-3 tabular-nums text-muted-foreground">{m.prev}</td>
								<td class="p-3 tabular-nums font-semibold">{m.curr}</td>
								<td class="p-3">
									<span
										class={[
											'rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums',
											m.prev === m.curr
												? 'bg-muted text-muted-foreground'
												: m.isPositive
													? 'bg-emerald-500/15 text-emerald-700'
													: 'bg-amber-500/15 text-amber-700'
										]}
									>
										{m.delta}
									</span>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
</AccountShell>
