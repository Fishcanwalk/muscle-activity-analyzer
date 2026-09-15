<script lang="ts">
	import { recording } from '$lib/workout/recording.svelte';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Record, Stop, DownloadSimple } from 'phosphor-svelte';

	function formatDuration(ms: number): string {
		const totalSeconds = Math.floor(ms / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
	}

	function toggleRecording() {
		if (recording.isRecording) {
			recording.stop();
		} else {
			recording.start();
		}
	}
</script>

<Card>
	<CardContent class="flex flex-wrap items-center justify-between gap-4">
		<div class="flex items-center gap-3">
			<span
				class="flex h-9 w-9 items-center justify-center rounded-full border {recording.isRecording
					? 'border-destructive/60 bg-destructive/10 text-destructive'
					: 'border-border bg-muted/40 text-muted-foreground'}"
			>
				<Record size={16} weight={recording.isRecording ? 'fill' : 'regular'} class={recording.isRecording ? 'animate-pulse' : ''} />
			</span>
			<div>
				<div class="text-sm font-bold text-foreground">
					{recording.isRecording ? 'กำลังบันทึกเซสชัน...' : 'บันทึกเซสชัน (Session Recording)'}
				</div>
				<div class="text-xs text-muted-foreground">
					{#if recording.isRecording}
						{formatDuration(recording.durationMs)} · {recording.sampleCount} samples
					{:else if recording.hasSamples}
						บันทึกล่าสุด: {recording.sampleCount} samples ({formatDuration(recording.durationMs)})
					{:else}
						ยังไม่มีข้อมูลที่บันทึก
					{/if}
					{#if recording.capReached}
						<span class="text-amber-500"> · ถึงขีดจำกัดบัฟเฟอร์ หยุดบันทึกอัตโนมัติ</span>
					{/if}
				</div>
			</div>
		</div>

		<div class="flex items-center gap-2">
			<Button
				variant={recording.isRecording ? 'destructive' : 'default'}
				size="sm"
				onclick={toggleRecording}
			>
				{#if recording.isRecording}
					<Stop size={14} weight="fill" />
					<span>หยุดบันทึก</span>
				{:else}
					<Record size={14} weight="fill" />
					<span>เริ่มบันทึก</span>
				{/if}
			</Button>

			<Button
				variant="outline"
				size="sm"
				disabled={!recording.hasSamples}
				onclick={() => recording.exportCsv()}
			>
				<DownloadSimple size={14} />
				<span>CSV</span>
			</Button>

			<Button
				variant="outline"
				size="sm"
				disabled={!recording.hasSamples}
				onclick={() => recording.exportJson()}
			>
				<DownloadSimple size={14} />
				<span>JSON</span>
			</Button>
		</div>
	</CardContent>
</Card>
