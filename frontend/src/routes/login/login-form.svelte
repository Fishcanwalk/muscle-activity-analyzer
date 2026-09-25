<script lang="ts">
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import * as Form from '../../lib/components/ui/form';
	import { loginSchema } from '$lib/schemas/auth.schema';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { Input } from '../../lib/components/ui/input';
	import { Button } from '../../lib/components/ui/button';
	import { Lightning, Eye, EyeClosed, CaretDown } from 'phosphor-svelte';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';

	// Minimal, non-fabricated quick-picker: just the 3 demo accounts seeded by the
	// backend (see backend/app/seed.py / backend/README.md "Demo users"), all
	// sharing the password below. Replaces the old mock `userManager`/`PRESET_USERS`
	// profile data, which is no longer used by the (now real) auth flow.
	const DEMO_ACCOUNTS = [
		{ email: 'nont@cyberpump.io', name: 'ธนาวัฒน์ (นนท์)' },
		{ email: 'karn@cyberpump.io', name: 'กานต์ กิตติธร' },
		{ email: 'suphawit@cyberpump.io', name: 'ศุภวิชญ์ พัฒนศักดิ์' }
	];
	const DEMO_PASSWORD = 'cyberpump123';

	function demoInitials(name: string): string {
		return name
			.trim()
			.split(/\s+/)
			.map((p) => p[0])
			.slice(0, 2)
			.join('')
			.toUpperCase();
	}

	type LoginFormProps = {
		form: SuperValidated<Infer<typeof loginSchema>>;
	};

	let { form: superform }: LoginFormProps = $props();

	let formRef = $state<HTMLFormElement | null>(null);
	let showPassword = $state(false);
	let showDemoAccounts = $state(false);

	const form = superForm(superform, {
		validators: zod4Client(loginSchema),
		resetForm: false,
		onResult: async (event) => {
			if (event.result.type === 'redirect') {
				toast.success('เข้าสู่ระบบสำเร็จ');
				const endpoint = String(event.result.location || '/dashboard');
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
		$formData.password = DEMO_PASSWORD;
		if (formRef) {
			setTimeout(() => {
				formRef?.requestSubmit();
			}, 50);
		}
	}
</script>

<div class="mx-auto w-full max-w-sm space-y-6">
	<!-- Branding -->
	<div class="space-y-1.5 text-center">
		<div
			class="mx-auto inline-flex items-center justify-center rounded-xl border border-border bg-muted p-3 text-emerald-600"
		>
			<Lightning size={26} weight="fill" />
		</div>
		<h1 class="text-2xl font-bold tracking-tight text-foreground">CYBERPUMP</h1>
		<p class="text-sm text-muted-foreground">เข้าสู่ระบบเพื่อดูข้อมูลการฝึกของคุณ</p>
	</div>

	<!-- Login Form -->
	<div class="rounded-2xl border border-border bg-card p-6 shadow-sm">
		<form bind:this={formRef} class="grid gap-4" method="POST" use:enhance>
			<Form.Field {form} name="email">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label class="text-sm text-foreground/80">อีเมล</Form.Label>
						<Input
							{...props}
							type="email"
							placeholder="nont@cyberpump.io"
							bind:value={$formData.email}
							class="h-10 border-border bg-muted/60 text-sm text-foreground"
						/>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors class="text-xs" />
			</Form.Field>
			<Form.Field {form} name="password">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label class="text-sm text-foreground/80">รหัสผ่าน</Form.Label>
						<div class="relative">
							<Input
								{...props}
								type={showPassword ? 'text' : 'password'}
								placeholder="••••••"
								bind:value={$formData.password}
								class="h-10 border-border bg-muted/60 pr-10 text-sm text-foreground"
							/>
							<button
								type="button"
								onclick={() => (showPassword = !showPassword)}
								class="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground/80"
								aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
							>
								{#if showPassword}
									<EyeClosed size={16} />
								{:else}
									<Eye size={16} />
								{/if}
							</button>
						</div>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors class="text-xs" />
			</Form.Field>
			{#if $message?.type === 'error'}
				<div class="text-center text-xs text-rose-600">
					{$message.text}
				</div>
			{/if}

			<Button
				type="submit"
				class="mt-1 h-10 w-full bg-emerald-500 text-sm font-semibold text-zinc-950 hover:bg-emerald-600"
				disabled={$submitting}
			>
				เข้าสู่ระบบ
			</Button>
		</form>
	</div>

	<!-- Demo Accounts (collapsed by default to keep the page focused on the real login form) -->
	<div class="rounded-xl border border-border bg-muted/50">
		<button
			type="button"
			onclick={() => (showDemoAccounts = !showDemoAccounts)}
			class="flex w-full items-center justify-between px-3 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground/80"
		>
			<span>ลองใช้บัญชีตัวอย่าง</span>
			<CaretDown
				size={14}
				class="transition-transform {showDemoAccounts ? 'rotate-180' : ''}"
			/>
		</button>
		{#if showDemoAccounts}
			<div class="space-y-1.5 px-3 pb-3">
				{#each DEMO_ACCOUNTS as u (u.email)}
					<button
						type="button"
						disabled={$submitting}
						onclick={() => selectDemoUser(u.email)}
						class="group flex w-full items-center justify-between rounded-lg border border-border bg-muted/60 p-2.5 text-left transition hover:border-border hover:bg-muted disabled:opacity-50"
					>
						<div class="flex items-center gap-2.5">
							<span
								class="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted text-xs font-semibold text-foreground group-hover:border-border"
							>
								{demoInitials(u.name)}
							</span>
							<div>
								<div
									class="text-xs font-medium text-foreground transition-colors group-hover:text-emerald-600"
								>
									{u.name}
								</div>
								<div class="text-xs text-muted-foreground">
									{u.email}
								</div>
							</div>
						</div>
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<p class="text-center text-sm text-muted-foreground">
		ยังไม่มีบัญชี?
		<a href="/register" class="text-emerald-600 hover:underline">สมัครสมาชิก</a>
	</p>
</div>
