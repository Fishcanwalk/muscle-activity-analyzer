<script lang="ts">
	import { cameraRepCounter } from '$lib/workout/cameraRepCounter.svelte';
	import { workout } from '$lib/workout/workout.svelte';
	import { Waveform, Info } from 'phosphor-svelte';

	function statusDotClass(status: typeof cameraRepCounter.status) {
		return status === 'tracking'
			? 'bg-emerald-500'
			: status === 'loading'
				? 'bg-amber-500'
				: status === 'error'
					? 'bg-destructive'
					: 'bg-muted-foreground/50';
	}

	function statusLabel(status: typeof cameraRepCounter.status) {
		if (status === 'tracking') return 'กำลังตรวจจับ';
		if (status === 'loading') return 'กำลังโหลด OpenCV.js...';
		if (status === 'error') return 'เกิดข้อผิดพลาด';
		return 'ยังไม่เริ่ม';
	}
</script>

<div class="rounded-xl border border-border bg-muted/50 p-3.5 shadow-sm">
	<div class="flex items-center justify-between border-b border-border pb-2">
		<div class="flex items-center gap-2">
			<span class="h-1.5 w-1.5 rounded-full {statusDotClass(cameraRepCounter.status)}"></span>
			<span class="font-mono text-xs font-bold tracking-wider text-cyan-600 uppercase">
				OpenCV.js Motion Diff
			</span>
			<span class="text-muted-foreground/70">·</span>
			<h4 class="text-xs font-semibold text-foreground">ตัวนับครั้งแบบ Cross-Check</h4>
		</div>
		<Waveform size={14} class="text-muted-foreground" />
	</div>

	<div class="flex items-center justify-between py-2">
		<div class="text-xs font-mono text-muted-foreground">{statusLabel(cameraRepCounter.status)}</div>
		{#if cameraRepCounter.status === 'error'}
			<span class="max-w-[60%] text-right text-xs text-destructive">{cameraRepCounter.errorMsg}</span>
		{/if}
	</div>

	<div class="grid grid-cols-2 gap-2.5">
		<div class="rounded-lg border border-border bg-muted/60 p-2.5">
			<div class="mb-0.5 font-mono text-xs text-muted-foreground">Motion Level</div>
			<div class="font-mono text-xl font-bold text-foreground">
				{cameraRepCounter.motionLevel}<span class="font-sans text-xs font-normal text-muted-foreground">%</span>
			</div>
			<div class="relative mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
				<div
					class="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-100"
					style="width: {cameraRepCounter.motionLevel}%;"
				></div>
			</div>
		</div>

		<div class="rounded-lg border border-border bg-muted/60 p-2.5">
			<div class="mb-0.5 font-mono text-xs text-muted-foreground">Motion-Based Reps</div>
			<div class="font-mono text-xl font-bold text-foreground">
				{cameraRepCounter.repCount}
				<span class="font-sans text-xs font-normal text-muted-foreground">/ {workout.totalReps} official</span>
			</div>
		</div>
	</div>

	<div class="mt-2 flex items-start gap-1.5 border-t border-border pt-2 text-xs text-muted-foreground">
		<Info size={12} class="mt-0.5 shrink-0" />
		<span>
			ประมาณการจาก frame-differencing แบบ OpenCV คลาสสิก (ไม่ใช้โมเดล pose/ML) เป็นค่าเปรียบเทียบเท่านั้น
			ไม่นับรวมเข้าสถิติ/คะแนนจริง ซึ่งยังคงมาจาก MediaPipe Pose เหมือนเดิม
		</span>
	</div>
</div>
