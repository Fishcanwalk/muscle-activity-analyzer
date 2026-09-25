<script lang="ts">
	import { resolve } from '$app/paths';
	import { telemetry } from '$lib/workout/telemetry.svelte';
	import { workout, type WorkoutTab } from '$lib/workout/workout.svelte';
	import { calibration } from '$lib/workout/calibration.svelte';
	import { readiness } from '$lib/workout/readiness.svelte';
	import {
		Lightning,
		Barbell,
		Timer,
		TrendUp,
		Gear,
		Heartbeat,
		Layout,
		SignOut,
		Plug,
		Check,
		CaretRight,
		Crown,
		UsersThree
	} from 'phosphor-svelte';

	interface Props {
		activeTab: WorkoutTab;
		onTabChange: (tab: WorkoutTab) => void;
		user: { name?: string; email: string; avatar?: string | null; [key: string]: unknown };
	}

	let { activeTab, onTabChange, user }: Props = $props();

	let displayName = $derived(user.name || user.email);
	let avatarInitials = $derived(
		user.avatar ||
			(user.name
				? user.name
						.trim()
						.split(/\s+/)
						.map((p) => p[0])
						.slice(0, 2)
						.join('')
						.toUpperCase()
				: user.email.slice(0, 2).toUpperCase())
	);

	// Tabs in the order a workout actually goes through them (see WorkoutManager.initTab).
	// `done` marks steps already completed in this visit so the lifter can see where
	// they are in the flow; every step stays clickable.
	let steps = $derived([
		{ id: 'calibration', label: 'Calibration', icon: Gear, color: 'text-muted-foreground', done: calibration.isCalibrated },
		{ id: 'readiness', label: 'Readiness', icon: Heartbeat, color: 'text-emerald-600', done: readiness.isComplete },
		{ id: 'studio', label: 'Live Studio', icon: Barbell, color: 'text-cyan-600', done: false },
		{ id: 'postset', label: 'Post-Set', icon: Timer, color: 'text-amber-600', done: workout.lastCompletedSet !== null },
		{ id: 'analytics', label: 'Analytics', icon: TrendUp, color: 'text-purple-600', done: false }
	] satisfies { id: WorkoutTab; label: string; icon: unknown; color: string; done: boolean }[]);

	type Status = 'live' | 'stale' | 'never';
	// Green only if every sensor behind that board is live, grey if none ever reported.
	function combinedStatus(...statuses: Status[]): Status {
		if (statuses.every((x) => x === 'live')) return 'live';
		if (statuses.every((x) => x === 'never')) return 'never';
		return 'stale';
	}
	// The Arduino forwards sEMG + FSR over UART; MPU6050 / MAX30102 / MLX90614 hang off the ESP32 itself.
	let arduinoStatus = $derived(combinedStatus(telemetry.sensorStatus.emg, telemetry.sensorStatus.fsr));
	let esp32Status = $derived(combinedStatus(telemetry.sensorStatus.mpu, telemetry.sensorStatus.vitals));
	// One pill summarizing every board, with the per-device breakdown in its tooltip.
	const STATUS_TEXT: Record<Status, string> = { live: 'ทำงาน', stale: 'สัญญาณขาด', never: 'ไม่พบ' };
	let hardware = $derived.by(() => {
		if (telemetry.connectionState === 'error' || telemetry.connectionState === 'reconnecting') {
			return { tone: 'rose', label: 'ขาดการเชื่อมต่อ' };
		}
		const all = [arduinoStatus, esp32Status];
		if (all.every((x) => x === 'never')) return { tone: 'muted', label: 'รอบอร์ดส่งข้อมูล' };
		if (all.every((x) => x === 'live')) return { tone: 'emerald', label: 'อุปกรณ์พร้อม' };
		return { tone: 'amber', label: 'อุปกรณ์ขาดบางตัว' };
	});
	let hardwareTitle = $derived(
		`Arduino (EMG, FSR): ${STATUS_TEXT[arduinoStatus]}\nESP32 (MPU, ชีพจร, อุณหภูมิ): ${STATUS_TEXT[esp32Status]}\nกล้อง: ${telemetry.isWebcamActive ? 'เปิด' : 'ปิด'}`
	);
	const TONE_CLASS: Record<string, string> = {
		emerald: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700',
		amber: 'border-amber-500/40 bg-amber-500/10 text-amber-700',
		rose: 'border-rose-500/40 bg-rose-500/10 text-rose-700',
		muted: 'border-border bg-muted text-muted-foreground'
	};
</script>

<header class="sticky top-0 z-50 border-b border-border bg-background/90 px-4 pt-3 pb-0 backdrop-blur-md">
	<div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 pb-3">
		<div class="flex items-center gap-2.5">
			<div class="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted text-emerald-600">
				<Lightning size={20} weight="fill" />
			</div>
			<span class="text-base font-bold tracking-wide text-foreground">CYBERPUMP</span>
		</div>

		<div class="flex flex-wrap items-center gap-2 text-sm">
			<div
				class={['flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-medium', TONE_CLASS[hardware.tone]]}
				title={hardwareTitle}
			>
				<Plug size={15} weight={hardware.tone === 'emerald' ? 'fill' : 'regular'} />
				<span>{hardware.label}</span>
			</div>

			<a
				href={resolve('/billing')}
				class="rounded-lg border border-border p-2 text-muted-foreground transition hover:bg-muted hover:text-amber-600"
				title="แพ็กเกจ"
			>
				<Crown size={16} />
			</a>

			<a
				href={resolve('/dashboard')}
				class="group flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-foreground transition hover:bg-muted"
				title="ไปที่ Dashboard ของ {displayName}"
			>
				<span class="flex h-6 w-6 items-center justify-center rounded bg-emerald-500/15 text-xs font-bold text-emerald-700">
					{avatarInitials}
				</span>
				<span class="font-medium">{displayName.split(' ')[0]}</span>
			</a>

			<form action="/logout" method="POST" class="inline">
				<button
					type="submit"
					class="rounded-lg border border-border p-2 text-muted-foreground transition hover:bg-muted hover:text-rose-600"
					title="ออกจากระบบ"
				>
					<SignOut size={16} />
				</button>
			</form>
		</div>
	</div>

	<!-- Navigation Tabs -->
	<nav class="mx-auto flex max-w-7xl gap-1 overflow-x-auto border-t border-border pt-1 text-sm font-medium">
		<a
			href={resolve('/dashboard')}
			class="flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-muted-foreground hover:text-foreground transition whitespace-nowrap"
		>
			<Layout size={14} class="text-emerald-600" />
			<span>Dashboard</span>
		</a>

		<span class="mx-1 my-2 w-px bg-muted" aria-hidden="true"></span>

		{#each steps as step, i (step.id)}
			{#if i > 0}
				<CaretRight size={12} class="shrink-0 self-center text-muted-foreground/70" aria-hidden="true" />
			{/if}
			<button
				onclick={() => onTabChange(step.id)}
				aria-current={activeTab === step.id ? 'step' : undefined}
				class={[
					'flex items-center gap-1.5 border-b-2 px-2.5 py-2 transition whitespace-nowrap',
					activeTab === step.id
						? 'border-emerald-500 text-foreground font-semibold'
						: 'border-transparent text-muted-foreground hover:text-foreground'
				]}
			>
				<span
					class={[
						'flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold',
						step.done
							? 'bg-emerald-500 text-zinc-950'
							: activeTab === step.id
								? 'bg-foreground text-background'
								: 'bg-muted text-muted-foreground'
					]}
				>
					{#if step.done}
						<Check size={10} weight="bold" />
					{:else}
						{i + 1}
					{/if}
				</span>
				<step.icon size={14} class={step.color} />
				<span>{step.label}</span>
				{#if step.id === 'studio' && workout.isSetRunning}
					<span class="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
				{/if}
			</button>
		{/each}

		<span class="mx-1 my-2 w-px bg-muted" aria-hidden="true"></span>

		<a
			href={resolve('/compare')}
			class="flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-muted-foreground hover:text-foreground transition whitespace-nowrap"
		>
			<UsersThree size={14} class="text-purple-600" />
			<span>เทียบผู้ใช้</span>
		</a>
	</nav>
</header>
