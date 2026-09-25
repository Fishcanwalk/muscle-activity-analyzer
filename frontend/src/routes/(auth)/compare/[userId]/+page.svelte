<script lang="ts">
	import type { PageProps } from './$types';
	import { resolve } from '$app/paths';
	import { ArrowLeft, Trophy } from 'phosphor-svelte';
	import AccountShell from '$lib/components/account/AccountShell.svelte';
	import {
		compareSessions,
		groupSetsIntoSessions,
		summarizeSets,
		thaiDate,
		type MetricComparison,
		type SetResult,
		type WorkoutSession
	} from '$lib/workout/metrics';

	let { data }: PageProps = $props();

	let me = $derived(data.me);
	let them = $derived(data.them);

	// Comparing different exercises says little, so default to one both have done.
	let exercises = $derived([...new Set([...me.sets, ...them.sets].map((s) => s.exercise))].sort());
	let sharedExercises = $derived(
		exercises.filter((ex) => me.sets.some((s) => s.exercise === ex) && them.sets.some((s) => s.exercise === ex))
	);
	let chosenExercise = $state<string | null>(null);
	let exercise = $derived(chosenExercise ?? sharedExercises[0] ?? 'all');

	function forExercise(sets: SetResult[]) {
		return exercise === 'all' ? sets : sets.filter((s) => s.exercise === exercise);
	}

	interface Side {
		sessions: WorkoutSession[];
		latest: WorkoutSession | null;
		overall: WorkoutSession | null;
	}
	function side(id: string, sets: SetResult[]): Side {
		const filtered = forExercise(sets);
		const sessions = groupSetsIntoSessions(filtered);
		return { sessions, latest: sessions.at(-1) ?? null, overall: summarizeSets(id, filtered) };
	}
	let mine = $derived(side('me', me.sets));
	let theirs = $derived(side('them', them.sets));

	// compareSessions(prev, curr): "prev" is the other user, "curr" is you, so each
	// delta reads as how you stand relative to them.
	let latestRows = $derived(
		mine.latest && theirs.latest ? compareSessions(theirs.latest, mine.latest) : null
	);
	let overallRows = $derived(
		mine.overall && theirs.overall ? compareSessions(theirs.overall, mine.overall) : null
	);

	function lead(rows: MetricComparison[]) {
		const ahead = rows.filter((r) => r.isPositive && r.prev !== r.curr).length;
		const tied = rows.filter((r) => r.prev === r.curr).length;
		return { ahead, tied, behind: rows.length - ahead - tied, total: rows.length };
	}
</script>

<svelte:head>
	<title>คุณ vs {them.user.name} - Cyberpump</title>
</svelte:head>

{#snippet table(rows: MetricComparison[])}
	<div class="overflow-x-auto">
		<table class="w-full text-left text-sm">
			<thead>
				<tr class="border-b border-border text-muted-foreground">
					<th class="p-3">ตัวชี้วัด</th>
					<th class="p-3">{them.user.name}</th>
					<th class="p-3">คุณ</th>
					<th class="p-3">คุณเทียบกับเขา</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-border">
				{#each rows as m (m.name)}
					{@const tied = m.prev === m.curr}
					<tr>
						<td class="p-3 font-medium">{m.name}</td>
						<td class={['p-3 tabular-nums', !m.isPositive && !tied ? 'font-bold' : 'text-muted-foreground']}>{m.prev}</td>
						<td class={['p-3 tabular-nums', m.isPositive && !tied ? 'font-bold' : 'text-muted-foreground']}>{m.curr}</td>
						<td class="p-3">
							<span
								class={[
									'rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums',
									tied
										? 'bg-muted text-muted-foreground'
										: m.isPositive
											? 'bg-emerald-500/15 text-emerald-700'
											: 'bg-amber-500/15 text-amber-700'
								]}
							>
								{tied ? 'เท่ากัน' : m.delta === 'ใหม่' ? 'คุณนำ' : `${m.isPositive ? 'คุณนำ' : 'เขานำ'} ${m.delta}`}
							</span>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/snippet}

{#snippet scoreboard(rows: MetricComparison[])}
	{@const s = lead(rows)}
	<p class="flex items-center gap-2 text-sm">
		<Trophy size={16} weight="fill" class={s.ahead > s.behind ? 'text-amber-500' : 'text-muted-foreground'} />
		คุณนำ <strong class="tabular-nums">{s.ahead}</strong> · เขานำ <strong class="tabular-nums">{s.behind}</strong>
		{#if s.tied}· เท่ากัน <strong class="tabular-nums">{s.tied}</strong>{/if}
		จาก {s.total} ตัวชี้วัด
	</p>
{/snippet}

<AccountShell title="คุณ vs {them.user.name}" description="เทียบ performance ระหว่างคุณกับผู้ใช้ที่เลือก">
	<a href={resolve('/compare')} class="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
		<ArrowLeft size={14} /> เลือกผู้ใช้คนอื่น
	</a>

	<section class="grid gap-3 sm:grid-cols-2">
		{#each [{ label: 'คุณ', user: me.user, sessions: mine.sessions.length }, { label: 'ผู้ใช้ที่เลือก', user: them.user, sessions: theirs.sessions.length }] as person (person.label)}
			<div class="rounded-xl border border-border bg-card p-4 shadow-sm">
				<p class="text-sm text-muted-foreground">{person.label}</p>
				<p class="text-lg font-bold">{person.user.name}</p>
				<p class="text-sm text-muted-foreground">
					{person.sessions} session{exercise === 'all' ? '' : ` ท่า ${exercise}`} · ฝึกล่าสุด
					{person.user.lastWorkoutAt ? thaiDate(person.user.lastWorkoutAt) : '–'}
				</p>
			</div>
		{/each}
	</section>

	<label class="flex flex-wrap items-center gap-3 text-sm font-medium">
		ท่าที่ใช้เทียบ
		<select
			value={exercise}
			onchange={(e) => (chosenExercise = e.currentTarget.value)}
			class="h-10 rounded-lg border border-input bg-card px-3 text-base"
		>
			<option value="all">ทุกท่า</option>
			{#each exercises as ex (ex)}
				<option value={ex}>{ex}{sharedExercises.includes(ex) ? '' : ' (มีแค่ฝ่ายเดียว)'}</option>
			{/each}
		</select>
	</label>

	{#if !latestRows || !overallRows}
		<p class="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
			{!mine.latest ? 'คุณ' : them.user.name}ยังไม่มีข้อมูลการฝึก{exercise === 'all' ? '' : `ท่า ${exercise}`} เลือกท่าอื่นเพื่อเทียบ
		</p>
	{:else}
		<section class="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
			<div>
				<h2 class="text-lg font-semibold">session ล่าสุด</h2>
				<p class="text-sm text-muted-foreground">
					{them.user.name}: {thaiDate(theirs.latest!.startedAt)} · คุณ: {thaiDate(mine.latest!.startedAt)}
				</p>
			</div>
			{@render scoreboard(latestRows)}
			{@render table(latestRows)}
		</section>

		<section class="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
			<div>
				<h2 class="text-lg font-semibold">สะสมทั้งหมด</h2>
				<p class="text-sm text-muted-foreground">
					รวมทุก session ที่บันทึกไว้ (ครั้ง, ปริมาณงาน และ TUT เป็นผลรวม จึงขึ้นกับจำนวน session ด้วย)
				</p>
			</div>
			{@render scoreboard(overallRows)}
			{@render table(overallRows)}
		</section>
	{/if}
</AccountShell>
