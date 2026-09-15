<script lang="ts">
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import * as Form from '../../lib/components/ui/form';
	import { registerSchema } from '$lib/schemas/auth.schema';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { Input } from '../../lib/components/ui/input';
	import { Button } from '../../lib/components/ui/button';
	import { Lightning } from 'phosphor-svelte';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';

	type RegisterFormProps = {
		form: SuperValidated<Infer<typeof registerSchema>>;
	};

	let { form: superform }: RegisterFormProps = $props();

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

<div class="mx-auto w-full max-w-sm space-y-4">
	<div class="space-y-1 text-center">
		<div
			class="inline-flex items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 p-2.5 text-emerald-400"
		>
			<Lightning size={24} weight="fill" />
		</div>
		<h1 class="text-xl font-bold tracking-tight text-zinc-100">CYBERPUMP</h1>
		<p class="text-xs text-zinc-400">Workout Performance & Biofeedback</p>
	</div>

	<div class="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
		<form class="grid gap-3" method="POST" use:enhance>
			<Form.Field {form} name="name">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label class="text-xs text-zinc-400">ชื่อ</Form.Label>
						<Input
							{...props}
							type="text"
							placeholder="Nont"
							bind:value={$formData.name}
							class="h-9 border-zinc-800 bg-zinc-950 text-xs text-zinc-200"
						/>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors class="text-[11px]" />
			</Form.Field>
			<Form.Field {form} name="email">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label class="text-xs text-zinc-400">อีเมล</Form.Label>
						<Input
							{...props}
							type="email"
							placeholder="nont@cyberpump.io"
							bind:value={$formData.email}
							class="h-9 border-zinc-800 bg-zinc-950 text-xs text-zinc-200"
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
							class="h-9 border-zinc-800 bg-zinc-950 text-xs text-zinc-200"
						/>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors class="text-[11px]" />
			</Form.Field>
			<Form.Field {form} name="confirmPassword">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label class="text-xs text-zinc-400">ยืนยันรหัสผ่าน</Form.Label>
						<Input
							{...props}
							type="password"
							placeholder="••••••"
							bind:value={$formData.confirmPassword}
							class="h-9 border-zinc-800 bg-zinc-950 text-xs text-zinc-200"
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

			<Button
				type="submit"
				class="mt-1 h-9 w-full bg-emerald-500 text-xs font-semibold text-zinc-950 hover:bg-emerald-600"
				disabled={$submitting}
			>
				สมัครสมาชิก
			</Button>
		</form>
	</div>

	<p class="text-center text-xs text-zinc-400">
		มีบัญชีอยู่แล้ว?
		<a href="/login" class="text-emerald-400 hover:underline">เข้าสู่ระบบ</a>
	</p>
</div>
