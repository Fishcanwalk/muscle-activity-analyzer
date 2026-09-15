<script lang="ts">
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import * as Form from '../../lib/components/ui/form';
	import { registerSchema } from '$lib/schemas/auth.schema';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { Input } from '../../lib/components/ui/input';
	import { Button } from '../../lib/components/ui/button';
	import { Lightning, Eye, EyeClosed } from 'phosphor-svelte';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';

	type RegisterFormProps = {
		form: SuperValidated<Infer<typeof registerSchema>>;
	};

	let { form: superform }: RegisterFormProps = $props();

	let showPassword = $state(false);
	let showConfirmPassword = $state(false);

	const form = superForm(superform, {
		validators: zod4Client(registerSchema),
		resetForm: false,
		onResult: async (event) => {
			if (event.result.type === 'redirect') {
				toast.success('สมัครสมาชิกสำเร็จ');
				await goto(String(event.result.location || '/dashboard'));
			}
			if (event.result.type === 'error') {
				toast.error('เกิดข้อผิดพลาดในการสมัครสมาชิก');
			}
			if (event.result.type === 'failure') {
				toast.error('สมัครสมาชิกไม่สำเร็จ ตรวจสอบข้อมูลของคุณ');
			}
		}
	});

	const { form: formData, enhance, submitting, message } = form;
</script>

<div class="mx-auto w-full max-w-sm space-y-6">
	<div class="space-y-1.5 text-center">
		<div
			class="mx-auto inline-flex items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-emerald-400"
		>
			<Lightning size={26} weight="fill" />
		</div>
		<h1 class="text-2xl font-bold tracking-tight text-zinc-100">CYBERPUMP</h1>
		<p class="text-sm text-zinc-400">สร้างบัญชีใหม่เพื่อเริ่มติดตามการฝึกของคุณ</p>
	</div>

	<div class="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 shadow-sm">
		<form class="grid gap-4" method="POST" use:enhance>
			<Form.Field {form} name="name">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label class="text-sm text-zinc-300">ชื่อ</Form.Label>
						<Input
							{...props}
							type="text"
							placeholder="Nont"
							bind:value={$formData.name}
							class="h-10 border-zinc-800 bg-zinc-950 text-sm text-zinc-200"
						/>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors class="text-xs" />
			</Form.Field>
			<Form.Field {form} name="email">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label class="text-sm text-zinc-300">อีเมล</Form.Label>
						<Input
							{...props}
							type="email"
							placeholder="nont@cyberpump.io"
							bind:value={$formData.email}
							class="h-10 border-zinc-800 bg-zinc-950 text-sm text-zinc-200"
						/>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors class="text-xs" />
			</Form.Field>
			<Form.Field {form} name="password">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label class="text-sm text-zinc-300">รหัสผ่าน</Form.Label>
						<div class="relative">
							<Input
								{...props}
								type={showPassword ? 'text' : 'password'}
								placeholder="อย่างน้อย 6 ตัวอักษร"
								bind:value={$formData.password}
								class="h-10 border-zinc-800 bg-zinc-950 pr-10 text-sm text-zinc-200"
							/>
							<button
								type="button"
								onclick={() => (showPassword = !showPassword)}
								class="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-zinc-500 hover:text-zinc-300"
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
			<Form.Field {form} name="confirmPassword">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label class="text-sm text-zinc-300">ยืนยันรหัสผ่าน</Form.Label>
						<div class="relative">
							<Input
								{...props}
								type={showConfirmPassword ? 'text' : 'password'}
								placeholder="••••••"
								bind:value={$formData.confirmPassword}
								class="h-10 border-zinc-800 bg-zinc-950 pr-10 text-sm text-zinc-200"
							/>
							<button
								type="button"
								onclick={() => (showConfirmPassword = !showConfirmPassword)}
								class="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-zinc-500 hover:text-zinc-300"
								aria-label={showConfirmPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
							>
								{#if showConfirmPassword}
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
				<div class="text-center text-xs text-rose-400">
					{$message.text}
				</div>
			{/if}

			<Button
				type="submit"
				class="mt-1 h-10 w-full bg-emerald-500 text-sm font-semibold text-zinc-950 hover:bg-emerald-600"
				disabled={$submitting}
			>
				สมัครสมาชิก
			</Button>
		</form>
	</div>

	<p class="text-center text-sm text-zinc-400">
		มีบัญชีอยู่แล้ว?
		<a href="/login" class="text-emerald-400 hover:underline">เข้าสู่ระบบ</a>
	</p>
</div>
