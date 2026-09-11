<script lang="ts">
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import * as Card from '../../lib/components/ui/card';
	import * as Form from '../../lib/components/ui/form';
	import { loginSchema } from '$lib/schemas/auth.schema';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { Input } from '../../lib/components/ui/input';
	import { Button } from '../../lib/components/ui/button';
	import { Lightning, ArrowRight, User, ShieldCheck } from 'phosphor-svelte';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { PRESET_USERS, userManager } from '$lib/workout/user.svelte';

	type LoginFormProps = {
		form: SuperValidated<Infer<typeof loginSchema>>;
	};

	let { form: superform }: LoginFormProps = $props();

	let formRef = $state<HTMLFormElement | null>(null);

	const form = superForm(superform, {
		validators: zod4Client(loginSchema),
		resetForm: false,
		onResult: async (event) => {
			if (event.result.type === 'redirect') {
				toast.success('เข้าสู่ระบบสำเร็จ');
				const endpoint = String(event.result.location || '/dashboard');
				userManager.switchUser($formData.email);
				await goto(endpoint);
			}
			if (event.result.type === 'error') {
				toast.error('เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
			}
			if (event.result.type === 'failure') {
				toast.error('เข้าสู่ระบบไม่สำเร็จ ตรวจสอบอีเมลและรหัสผ่าน');
			}
		}
	});

	const { form: formData, enhance, submitting, message } = form;

	function selectDemoUser(email: string) {
		$formData.email = email;
		$formData.password = 'password123';
		if (formRef) {
			setTimeout(() => {
				formRef?.requestSubmit();
			}, 50);
		}
	}
</script>

<div class="mx-auto w-full max-w-sm space-y-4">
	<!-- Branding -->
	<div class="text-center space-y-1">
		<div class="inline-flex items-center justify-center p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-emerald-400">
			<Lightning size={24} weight="fill" />
		</div>
		<h1 class="text-xl font-bold tracking-tight text-zinc-100">CYBERPUMP</h1>
		<p class="text-xs text-zinc-400">Workout Performance & Biofeedback</p>
	</div>

	<!-- Demo Accounts Quick Select -->
	<div class="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 space-y-2">
		<div class="flex items-center justify-between text-xs text-zinc-400 px-1 font-medium">
			<span>เลือกโปรไฟล์ผู้ใช้งาน</span>
			<span class="text-[10px] text-zinc-400">1-Click Login</span>
		</div>
		<div class="space-y-1.5">
			{#each Object.values(PRESET_USERS) as u}
				<button
					type="button"
					disabled={$submitting}
					onclick={() => selectDemoUser(u.email)}
					class="w-full flex items-center justify-between p-2.5 rounded-lg border border-zinc-800/80 bg-zinc-950/60 hover:bg-zinc-800 hover:border-zinc-700 transition text-left group disabled:opacity-50"
				>
					<div class="flex items-center gap-2.5">
						<span class="w-8 h-8 rounded-md bg-zinc-900 border border-zinc-800 flex items-center justify-center text-xs font-semibold text-zinc-200 group-hover:border-zinc-700">
							{u.avatar}
						</span>
						<div>
							<div class="text-xs font-medium text-zinc-200 group-hover:text-emerald-400 transition-colors">
								{u.name}
							</div>
							<div class="text-[11px] text-zinc-400">
								{u.weightKg} kg · {u.totalSessions} Sessions
							</div>
						</div>
					</div>
					<ArrowRight size={14} class="text-zinc-500 group-hover:text-zinc-300 group-hover:translate-x-0.5 transition-all" />
				</button>
			{/each}
		</div>
	</div>

	<!-- Standard Login Form -->
	<div class="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
		<form bind:this={formRef} class="grid gap-3" method="POST" use:enhance>
			<Form.Field {form} name="email">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label class="text-xs text-zinc-400">อีเมล</Form.Label>
						<Input
							{...props}
							type="email"
							placeholder="nont@cyberpump.io"
							bind:value={$formData.email}
							class="h-9 bg-zinc-950 border-zinc-800 text-xs text-zinc-200"
						/>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors class="text-[11px]" />
			</Form.Field>
			<Form.Field {form} name="password">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label class="text-xs text-zinc-400">รหัสผ่าน</Form.Label>
						<Input
							{...props}
							type="password"
							placeholder="••••••"
							bind:value={$formData.password}
							class="h-9 bg-zinc-950 border-zinc-800 text-xs text-zinc-200"
						/>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors class="text-[11px]" />
			</Form.Field>
			{#if $message?.type === 'error'}
				<div class="text-center text-xs text-rose-400">
					{$message.text}
				</div>
			{/if}

			<Button type="submit" class="w-full h-9 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-semibold text-xs mt-1" disabled={$submitting}>
				เข้าสู่ระบบ
			</Button>
		</form>
	</div>
</div>
