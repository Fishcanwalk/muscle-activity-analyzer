<script lang="ts">
	import type { PageProps } from './$types';
	import type { components } from '$lib/api/paths/fastapi';
	import { onMount } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { Crown, Check, Spinner, WarningCircle, CreditCard } from 'phosphor-svelte';
	import fastapiClient from '$lib/api/fastapi-client';
	import AccountShell from '$lib/components/account/AccountShell.svelte';
	import { collectCardToken } from '$lib/billing/omise';
	import { thaiDate } from '$lib/workout/metrics';

	type Plan = components['schemas']['Plan'];

	let { data }: PageProps = $props();

	let config = $derived(data.config);
	let overview = $derived(data.overview);
	let subscription = $derived(overview?.subscription ?? null);
	let currentPlanId = $derived(overview?.plan.id ?? 'free');
	let isPaid = $derived((overview?.plan.priceSatang ?? 0) > 0);
	let busy = $state<string | null>(null);

	const formatPrice = (plan: Plan) =>
		plan.priceSatang === 0
			? 'ฟรี'
			: `฿${(plan.priceSatang / 100).toLocaleString('th-TH')} / ${plan.interval === 'month' ? 'เดือน' : plan.interval}`;

	const featureLines = (plan: Plan) => [
		plan.features.historyDays === null
			? 'ดูประวัติการฝึกย้อนหลังได้ทั้งหมด'
			: `ดูประวัติการฝึกย้อนหลัง ${plan.features.historyDays} วัน`,
		'นับครั้งด้วยกล้อง / EMG / Hybrid'
	];

	let statusLine = $derived.by(() => {
		if (!subscription || !isPaid) return null;
		const end = subscription.currentPeriodEnd ? thaiDate(subscription.currentPeriodEnd) : '–';
		if (subscription.status === 'past_due') return { tone: 'rose', text: `ตัดเงินรอบใหม่ไม่สำเร็จ ใช้งานได้อีกไม่กี่วันหลัง ${end}` };
		if (subscription.cancelAtPeriodEnd) return { tone: 'amber', text: `ยกเลิกแล้ว ใช้งานได้ถึง ${end}` };
		if (subscription.provider === 'omise') return { tone: 'emerald', text: `ต่ออายุอัตโนมัติ ${end}` };
		return { tone: 'emerald', text: `ใช้งานได้ถึง ${end}` };
	});

	const TONE: Record<string, string> = {
		emerald: 'bg-emerald-500/10 text-emerald-700',
		amber: 'bg-amber-500/10 text-amber-700',
		rose: 'bg-rose-500/10 text-rose-700'
	};

	function errorMessage(status: number, detail: unknown): string {
		if (status === 409) return 'คุณใช้แพ็กเกจนี้อยู่แล้ว';
		if (status === 503) return 'ยังไม่เปิดรับชำระเงิน';
		if (status === 402) return `ชำระเงินไม่สำเร็จ${typeof detail === 'string' ? `: ${detail}` : ''}`;
		return 'ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง';
	}

	async function upgrade(plan: Plan) {
		if (!config || config.provider === 'disabled') return;
		busy = plan.id;
		try {
			let cardToken: string | undefined;
			if (config.provider === 'omise') {
				if (!config.omisePublicKey) {
					toast.error('ยังไม่ได้ตั้งค่า Omise public key');
					return;
				}
				const token = await collectCardToken(
					config.omisePublicKey,
					plan.priceSatang,
					plan.currency,
					`ชำระ ${formatPrice(plan)}`
				);
				if (!token) return;
				cardToken = token;
			}

			const { data: result, error, response } = await fastapiClient.POST('/v1/billing/checkout', {
				body: { planId: plan.id, cardToken }
			});
			if (error || !result) {
				toast.error(errorMessage(response.status, (error as { detail?: unknown })?.detail));
				return;
			}
			if (result.authorizeUri) {
				// 3-D Secure: the bank's page sends the user back to /billing?omise_return=1.
				window.location.href = result.authorizeUri;
				return;
			}
			toast.success(`เปิดใช้แพ็กเกจ ${plan.name} แล้ว`);
			await invalidateAll();
		} catch {
			toast.error('เปิดหน้าชำระเงินไม่สำเร็จ ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต');
		} finally {
			busy = null;
		}
	}

	async function cancel() {
		if (!confirm('ยกเลิกแพ็กเกจ? จะยังใช้งานได้จนถึงวันสิ้นสุดรอบที่ชำระไว้ และจะไม่ถูกตัดเงินรอบถัดไป')) return;
		busy = 'cancel';
		const { error } = await fastapiClient.POST('/v1/billing/cancel');
		busy = null;
		if (error) {
			toast.error('ยกเลิกไม่สำเร็จ');
			return;
		}
		toast.success('ยกเลิกการต่ออายุแล้ว');
		await invalidateAll();
	}

	async function resume() {
		busy = 'resume';
		const { error } = await fastapiClient.POST('/v1/billing/resume');
		busy = null;
		if (error) {
			toast.error('เปิดต่ออายุไม่สำเร็จ');
			return;
		}
		toast.success('เปิดต่ออายุอัตโนมัติแล้ว');
		await invalidateAll();
	}

	// Back from the bank's 3-D Secure page: ask the backend to re-check the charge.
	onMount(async () => {
		if (!page.url.searchParams.has('omise_return')) return;
		const { data: refreshed } = await fastapiClient.POST('/v1/billing/refresh');
		if (refreshed && refreshed.plan.priceSatang > 0) toast.success(`เปิดใช้แพ็กเกจ ${refreshed.plan.name} แล้ว`);
		else if (refreshed?.subscription?.lastError) toast.error(`ชำระเงินไม่สำเร็จ: ${refreshed.subscription.lastError}`);
		else toast.info('กำลังรอผลการชำระเงินจากธนาคาร');
		await goto(page.url.pathname, { replaceState: true, invalidateAll: true });
	});
</script>

<svelte:head>
	<title>แพ็กเกจ - Cyberpump</title>
</svelte:head>

<AccountShell title="แพ็กเกจ" description="เลือกแพ็กเกจที่เหมาะกับการฝึกของคุณ ยกเลิกได้ทุกเมื่อ">
	{#if !config || !overview}
		<p class="rounded-xl border border-border bg-card p-5 text-sm text-rose-600">โหลดข้อมูลแพ็กเกจไม่สำเร็จ</p>
	{:else}
		{#if config.provider === 'mock'}
			<p class="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
				โหมดทดสอบ: กดอัปเกรดแล้วเปิดใช้ทันที ไม่มีการตัดเงินจริง (ตั้ง BILLING_PROVIDER=omise เมื่อพร้อมใช้ Omise)
			</p>
		{:else if config.provider === 'disabled'}
			<p class="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
				ยังไม่เปิดรับชำระเงินในขณะนี้
			</p>
		{/if}

		<section class="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
			<div class="flex items-center gap-3">
				<div class="flex h-11 w-11 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
					<Crown size={22} weight={isPaid ? 'fill' : 'regular'} />
				</div>
				<div>
					<p class="text-sm text-muted-foreground">แพ็กเกจปัจจุบัน</p>
					<p class="text-xl font-bold">{overview.plan.name}</p>
				</div>
			</div>
			<div class="flex flex-col gap-2 sm:items-end">
				{#if statusLine}
					<span class={['rounded-full px-3 py-1 text-sm font-medium', TONE[statusLine.tone]]}>{statusLine.text}</span>
				{/if}
				{#if isPaid && subscription?.cancelAtPeriodEnd}
					<button
						class="text-sm font-semibold text-emerald-700 underline disabled:opacity-50"
						disabled={busy !== null}
						onclick={resume}
					>
						เปิดต่ออายุอัตโนมัติอีกครั้ง
					</button>
				{/if}
			</div>
		</section>

		{#if subscription?.lastError}
			<p class="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-700">
				<WarningCircle size={18} class="mt-0.5 shrink-0" />
				{subscription.lastError}
			</p>
		{/if}

		<section class="grid gap-4 sm:grid-cols-2">
			{#each config.plans as plan (plan.id)}
				{@const isCurrent = plan.id === currentPlanId}
				<div
					class={[
						'flex flex-col rounded-xl border bg-card p-5 shadow-sm',
						isCurrent ? 'border-emerald-500 ring-1 ring-emerald-500/30' : 'border-border'
					]}
				>
					<div class="flex items-center justify-between">
						<h2 class="text-lg font-bold">{plan.name}</h2>
						{#if isCurrent}
							<span class="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">ใช้อยู่</span>
						{/if}
					</div>
					<p class="mt-2 text-3xl font-bold tabular-nums">{formatPrice(plan)}</p>
					<ul class="mt-4 flex-1 space-y-2 text-sm">
						{#each featureLines(plan) as line (line)}
							<li class="flex items-start gap-2">
								<Check size={16} weight="bold" class="mt-0.5 shrink-0 text-emerald-600" />
								{line}
							</li>
						{/each}
					</ul>

					<div class="mt-5">
						{#if isCurrent}
							<button disabled class="h-11 w-full rounded-lg border border-border text-sm font-medium text-muted-foreground">
								แพ็กเกจปัจจุบัน
							</button>
						{:else if plan.priceSatang === 0}
							{#if isPaid && !subscription?.cancelAtPeriodEnd}
								<button
									class="h-11 w-full rounded-lg border border-border text-sm font-medium transition hover:bg-muted disabled:opacity-50"
									disabled={busy !== null}
									onclick={cancel}
								>
									{busy === 'cancel' ? 'กำลังยกเลิก...' : 'ยกเลิกแพ็กเกจที่ชำระเงิน'}
								</button>
							{:else}
								<p class="text-center text-sm text-muted-foreground">กลับเป็น Free เมื่อหมดรอบที่ชำระไว้</p>
							{/if}
						{:else}
							<button
								class="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
								disabled={busy !== null || config.provider === 'disabled'}
								onclick={() => upgrade(plan)}
							>
								{#if busy === plan.id}
									<Spinner size={16} class="animate-spin" />
								{:else}
									<CreditCard size={16} weight="bold" />
								{/if}
								อัปเกรดเป็น {plan.name}
							</button>
						{/if}
					</div>
				</div>
			{/each}
		</section>

		{#if config.provider === 'omise'}
			<p class="text-xs text-muted-foreground">
				ชำระผ่าน Omise ด้วยบัตรเครดิต/เดบิต ระบบจะตัดเงินอัตโนมัติทุกเดือนจนกว่าจะยกเลิก เราไม่เก็บเลขบัตรของคุณ
			</p>
		{/if}
	{/if}
</AccountShell>
