<script lang="ts">
	import { onDestroy } from 'svelte';
	import { workout } from '$lib/workout/workout.svelte';
	import { telemetry } from '$lib/workout/telemetry.svelte';
	import { calibration } from '$lib/workout/calibration.svelte';
	import EmgGraphMonitor from './EmgGraphMonitor.svelte';
	import BiofeedbackSensors from './BiofeedbackSensors.svelte';
	import RecordingControls from './RecordingControls.svelte';
	import { formatDec } from '$lib/utils/format';
	import { Camera, ArrowsLeftRight, WarningCircle, X, CaretRight } from 'phosphor-svelte';

	interface Props {
		onGoCalibrate: () => void;
	}

	let { onGoCalibrate }: Props = $props();

	// The camera is a plain mirror for the lifter to watch their form: nothing reads its
	// frames, and reps/cheats come only from the sEMG (see telemetry.onEmgRep).
	let videoElement: HTMLVideoElement | null = $state(null);
	let cameraStatus = $state<'idle' | 'starting' | 'on' | 'error'>('idle');
	let cameraError = $state('');
	let mirrorVideo = $state(true);
	let stream: MediaStream | null = null;
	let isWebcamActive = $derived(cameraStatus === 'on');

	let emgLive = $derived(telemetry.sensorStatus.emg === 'live');
	// Sets are started/stopped only with the board's buttons (workout.handleRemoteButton),
	// which arrive over the same telemetry stream -- no data from the board, no buttons.
	let boardLive = $derived(Object.values(telemetry.sensorStatus).some((status) => status === 'live'));

	let setTime = $derived(
		`${String(Math.floor(workout.setDurationSeconds / 60)).padStart(2, '0')}:${String(
			workout.setDurationSeconds % 60
		).padStart(2, '0')}`
	);

	// Plain-language rep phase for the stats bar (the raw FSM names mean nothing to a lifter).
	let phase = $derived.by((): { label: string; tone: string } => {
		if (!workout.isSetRunning) return { label: 'ยังไม่เริ่มเซต', tone: 'text-muted-foreground' };
		return telemetry.emgRep.state === 'CONTRACT'
			? { label: 'กำลังเกร็ง', tone: 'text-emerald-600' }
			: { label: 'พัก / ลงน้ำหนัก', tone: 'text-foreground' };
	});

	const exercises = ['Biceps Curl', 'Hammer Curl', 'Preacher Curl'];
	const weightOptions = [7.5, 10.0, 12.5, 15.0, 17.5, 20.0];

	async function startWebcam() {
		if (!navigator.mediaDevices?.getUserMedia) {
			cameraStatus = 'error';
			cameraError = 'เบราว์เซอร์เปิดกล้องไม่ได้ ต้องเปิดเว็บผ่าน https หรือ localhost';
			return;
		}
		cameraStatus = 'starting';
		cameraError = '';
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: { width: { ideal: 1280 }, height: { ideal: 720 } },
				audio: false
			});
			if (videoElement) {
				videoElement.srcObject = stream;
				await videoElement.play();
			}
			cameraStatus = 'on';
			telemetry.setWebcamActive(true);
		} catch (err) {
			stopWebcam();
			cameraStatus = 'error';
			cameraError =
				err instanceof DOMException && err.name === 'NotAllowedError'
					? 'ไม่ได้รับอนุญาตให้ใช้กล้อง อนุญาตในเบราว์เซอร์แล้วลองใหม่'
					: 'เปิดกล้องไม่ได้ ตรวจสอบว่าไม่มีโปรแกรมอื่นใช้กล้องอยู่';
		}
	}

	function stopWebcam() {
		stream?.getTracks().forEach((track) => track.stop());
		stream = null;
		if (videoElement) videoElement.srcObject = null;
		cameraStatus = 'idle';
		telemetry.setWebcamActive(false);
	}

	onDestroy(stopWebcam);
</script>

<!-- lg and up: exactly one screen tall (WorkoutDashboard gives it the height left under the
     header), with the camera and EMG graph taking whatever the fixed rows leave. -->
<div class="mx-auto flex w-full max-w-400 flex-col gap-3 p-3 lg:h-full lg:min-h-0">
	<!-- Set setup + the board's buttons -->
	<div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2.5 shadow-sm">
		<div class="flex flex-wrap items-center gap-3">
			<label class="flex items-center gap-2 text-sm text-muted-foreground">
				ท่า
				<select
					bind:value={workout.exercise}
					disabled={workout.isSetRunning}
					class="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm font-semibold text-foreground focus:border-cyan-500 focus:outline-none"
				>
					{#each exercises as ex (ex)}
						<option value={ex}>{ex}</option>
					{/each}
				</select>
			</label>
			<label class="flex items-center gap-2 text-sm text-muted-foreground">
				น้ำหนัก
				<select
					bind:value={workout.weightKg}
					disabled={workout.isSetRunning}
					class="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm font-semibold text-foreground focus:border-cyan-500 focus:outline-none"
				>
					{#each weightOptions as wt (wt)}
						<option value={wt}>{wt} kg</option>
					{/each}
				</select>
			</label>
			<span class="text-xs text-muted-foreground">นับ rep จากคลื่นกล้ามเนื้อ (EMG)</span>
		</div>

		<div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
			<span class="flex items-center gap-1.5 font-semibold text-foreground">
				<kbd class="rounded-md bg-emerald-500 px-2 py-0.5 text-black">A</kbd>
				{workout.isSetRunning ? 'จบเซต' : workout.sessionId ? 'เริ่มเซตถัดไป' : 'เริ่มเซตแรกที่ขั้นที่ 2'}
			</span>
			<span class="flex items-center gap-1.5 text-muted-foreground">
				<kbd class="rounded-md bg-rose-500 px-2 py-0.5 font-bold text-white">B</kbd>
				จบการออกกำลังกาย
			</span>
		</div>
	</div>

	{#if !calibration.isCalibrated && !workout.isSetRunning}
		<div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-800">
			<span class="flex items-center gap-2">
				<WarningCircle size={16} weight="fill" />
				ต้องปรับเทียบเซนเซอร์ของ session นี้ให้ครบก่อน จึงจะเริ่มเซตได้
			</span>
			<button onclick={onGoCalibrate} class="rounded-md border border-amber-600/50 px-2.5 py-0.5 font-semibold hover:bg-amber-500/20">
				ไปปรับเทียบ
			</button>
		</div>
	{/if}

	{#if !boardLive}
		<div class="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-800">
			<WarningCircle size={16} weight="fill" />
			<span>ยังไม่ได้รับข้อมูลจากบอร์ด ESP32 ปุ่มบนบอร์ดจะใช้เริ่ม/จบเซตไม่ได้จนกว่าบอร์ดจะเชื่อมต่อ</span>
		</div>
	{:else if workout.isSetRunning && !emgLive}
		<div class="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-800">
			<WarningCircle size={16} weight="fill" />
			<span>ไม่ได้รับสัญญาณจากเซนเซอร์ EMG ระบบจะไม่นับ rep จนกว่าสัญญาณจะกลับมา</span>
		</div>
	{/if}

	<!-- Every number a lifter glances at mid-set, in one row -->
	<div class="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
		<div class="rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
			<div class="text-xs text-muted-foreground">เซต #{workout.currentSet} · ครั้ง</div>
			<div class="text-4xl leading-tight font-bold tabular-nums text-foreground">{workout.totalReps}</div>
			<div class="flex gap-3 text-xs">
				<span class="text-emerald-600">คลีน <strong class="tabular-nums">{workout.cleanReps}</strong></span>
				<span class="text-rose-600">โกง <strong class="tabular-nums">{workout.cheatedReps}</strong></span>
			</div>
		</div>
		<div class="rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
			<div class="text-xs text-muted-foreground">เวลาเซต</div>
			<div class="text-3xl leading-tight font-bold tabular-nums text-foreground">{setTime}</div>
		</div>
		<div class="rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
			<div class="text-xs text-muted-foreground">แรงกล้ามเนื้อ</div>
			<div class={['text-3xl leading-tight font-bold tabular-nums', telemetry.emg.isHighTension ? 'text-emerald-600' : 'text-foreground']}>
				{emgLive ? `${Math.round(telemetry.emg.mvcPercent)}%` : '–'}
			</div>
			<div class="text-xs text-muted-foreground">ของแรงสูงสุด (MVC)</div>
		</div>
		<div class="rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
			<div class="text-xs text-muted-foreground">สถานะ</div>
			<div class={['text-xl leading-tight font-bold', phase.tone]}>{phase.label}</div>
			<div class="text-xs text-muted-foreground">ท่าคลีน {workout.formPurityPercent}%</div>
		</div>
		<BiofeedbackSensors />
	</div>

	<div class="grid grid-cols-1 gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-2">
		<!-- Camera: preview only -->
		<div class="flex min-h-0 flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
			<div class="flex items-center justify-between gap-2">
				<h3 class="flex items-center gap-2 text-sm font-semibold text-foreground">
					<Camera size={16} class="text-cyan-600" />
					กล้องดูฟอร์ม
					<span class="font-normal text-muted-foreground">(ไม่ได้ใช้คำนวณ)</span>
				</h3>
				<div class="flex items-center gap-2">
					{#if isWebcamActive}
						<button
							onclick={() => (mirrorVideo = !mirrorVideo)}
							class="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
							title="กลับด้านภาพ"
						>
							<ArrowsLeftRight size={14} />
						</button>
					{/if}
					<button
						onclick={() => (isWebcamActive ? stopWebcam() : startWebcam())}
						disabled={cameraStatus === 'starting'}
						class={[
							'rounded-md border px-2.5 py-1 text-sm font-semibold transition disabled:opacity-50',
							isWebcamActive
								? 'border-border text-foreground hover:bg-muted'
								: 'border-cyan-500/50 bg-cyan-500/10 text-cyan-700 hover:bg-cyan-500/20'
						]}
					>
						{cameraStatus === 'starting' ? 'กำลังเปิด...' : isWebcamActive ? 'ปิดกล้อง' : 'เปิดกล้อง'}
					</button>
				</div>
			</div>

			{#if cameraStatus === 'error'}
				<div class="flex items-center justify-between rounded-md bg-destructive/15 px-2.5 py-1.5 text-sm text-destructive">
					<span class="flex items-center gap-1.5"><WarningCircle size={16} /> {cameraError}</span>
					<button onclick={() => (cameraStatus = 'idle')} aria-label="ปิด"><X size={16} /></button>
				</div>
			{/if}

			<div class="relative aspect-video w-full overflow-hidden rounded-lg bg-[#070a12] lg:aspect-auto lg:min-h-0 lg:flex-1">
				<video
					bind:this={videoElement}
					playsinline
					muted
					class={['absolute inset-0 h-full w-full object-contain', mirrorVideo && '-scale-x-100', !isWebcamActive && 'invisible']}
				></video>
				{#if !isWebcamActive}
					<div class="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
						<Camera size={32} class="text-white/60" />
						<p class="max-w-xs text-sm text-white/70">เปิดกล้องเพื่อดูฟอร์มตัวเองระหว่างเล่น (ไม่บังคับ)</p>
					</div>
				{/if}
			</div>
		</div>

		<div class="flex min-h-0 flex-col">
			<EmgGraphMonitor />
		</div>
	</div>

	<!-- Diagnostics lifters don't need mid-set, kept one click away for testing/reporting -->
	<details class="group shrink-0 rounded-xl border border-border bg-card shadow-sm">
		<summary class="flex cursor-pointer list-none items-center gap-2 px-4 py-2 text-sm font-semibold text-foreground">
			<CaretRight size={14} class="transition-transform group-open:rotate-90" />
			ข้อมูลสำหรับนักพัฒนา / การทดสอบ
			<span class="font-normal text-muted-foreground">ความเร็ว MPU · export ข้อมูล</span>
		</summary>
		<div class="flex flex-col gap-4 border-t border-border p-4">
			<div>
				<h4 class="mb-2 text-sm font-semibold text-foreground">ความเร็วการยก (MPU-6050)</h4>
				<dl class="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
					{#each [
						{ k: 'ตอนนี้', v: `${formatDec(telemetry.mpu.concentricVelocity, 2)} m/s` },
						{ k: 'สูงสุด rep ล่าสุด', v: `${formatDec(telemetry.mpu.lastRepVelocity, 2)} m/s` },
						{ k: 'V₁ (rep แรกของเซต)', v: `${formatDec(telemetry.mpu.rep1Velocity, 2)} m/s` },
						{ k: 'ช้าลงจาก rep แรก', v: `${telemetry.mpu.velocityLossPercent}%` }
					] as item (item.k)}
						<div class="rounded-lg bg-muted/60 p-2">
							<dt class="text-xs text-muted-foreground">{item.k}</dt>
							<dd class="font-semibold tabular-nums text-foreground">{item.v}</dd>
						</div>
					{/each}
				</dl>
			</div>
			<RecordingControls />
		</div>
	</details>
</div>
