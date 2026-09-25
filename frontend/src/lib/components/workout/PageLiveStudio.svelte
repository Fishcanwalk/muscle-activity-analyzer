<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { workout, type RepSource } from '$lib/workout/workout.svelte';
	import { telemetry } from '$lib/workout/telemetry.svelte';
	import { calibration } from '$lib/workout/calibration.svelte';
	import { cameraRepCounter } from '$lib/workout/cameraRepCounter.svelte';
	import EmgGraphMonitor from './EmgGraphMonitor.svelte';
	import BiofeedbackSensors from './BiofeedbackSensors.svelte';
	import CameraMotionPanel from './CameraMotionPanel.svelte';
	import RecordingControls from './RecordingControls.svelte';
	import { formatDec } from '$lib/utils/format';
	import { Camera, ArrowsLeftRight, WarningCircle, Play, Stop, X, CaretRight } from 'phosphor-svelte';
	import { toast } from 'svelte-sonner';

	interface Props {
		onFinishSet: () => void;
		onGoCalibrate: () => void;
	}

	let { onFinishSet, onGoCalibrate }: Props = $props();

	let canvasElement: HTMLCanvasElement | null = $state(null);
	let videoElement: HTMLVideoElement | null = $state(null);

	// Camera & MediaPipe State
	let isWebcamActive = $state(false);
	let mirrorVideo = $state(true);
	let trackedArm = $state<'right' | 'left'>('right');
	let modelStatus = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
	let modelErrorMsg = $state('');
	let fps = $state(0);
	let lastFrameTime = performance.now();
	let frameCount = 0;

	let poseInstance: any = null;
	let cameraInstance: any = null;

	const repSources: { id: RepSource; label: string; hint: string; needsEmg: boolean }[] = [
		{ id: 'camera', label: 'กล้อง', hint: 'นับจากมุมข้อศอก (MediaPipe)', needsEmg: false },
		{ id: 'emg', label: 'EMG', hint: 'นับจากคลื่นกล้ามเนื้อ ไม่ต้องใช้กล้อง', needsEmg: true },
		{
			id: 'hybrid',
			label: 'Hybrid',
			hint: 'กล้องนับ + EMG ยืนยันว่ากล้ามเนื้อออกแรงจริง',
			needsEmg: true
		}
	];
	let usesCamera = $derived(workout.repSource !== 'emg');
	let usesEmg = $derived(workout.repSource !== 'camera');
	let emgLive = $derived(telemetry.sensorStatus.emg === 'live');
	// In EMG mode an idle camera is optional: shrink it to one row under the (then
	// full-width) EMG graph instead of an empty half-screen preview. The canvas stays
	// mounted (just hidden) so turning the camera on still has something to draw into.
	let cameraCompact = $derived(!usesCamera && !isWebcamActive);

	let setTime = $derived(
		`${String(Math.floor(workout.setDurationSeconds / 60)).padStart(2, '0')}:${String(
			workout.setDurationSeconds % 60
		).padStart(2, '0')}`
	);

	// Plain-language rep phase for the stats bar (the raw FSM names mean nothing to a lifter).
	let phase = $derived.by((): { label: string; tone: string } => {
		if (!workout.isSetRunning) return { label: 'ยังไม่เริ่มเซต', tone: 'text-muted-foreground' };
		if (workout.repSource === 'emg') {
			return telemetry.emgRep.state === 'CONTRACT'
				? { label: 'กำลังเกร็ง', tone: 'text-emerald-600' }
				: { label: 'พัก / ลงน้ำหนัก', tone: 'text-foreground' };
		}
		switch (workout.fsmState) {
			case 'PEAK':
				return { label: 'จุดสูงสุด', tone: 'text-emerald-600' };
			case 'INFLECTION':
				return { label: 'กำลังยก', tone: 'text-amber-600' };
			case 'COMPLETION':
				return { label: 'นับแล้ว', tone: 'text-emerald-600' };
			default:
				return { label: 'แขนเหยียด', tone: 'text-foreground' };
		}
	});

	const exercises = ['Biceps Curl', 'Hammer Curl', 'Preacher Curl', 'Dumbbell Row'];
	const weightOptions = [7.5, 10.0, 12.5, 15.0, 17.5, 20.0];

	function handleStartStop() {
		if (workout.isSetRunning) {
			workout.stopSet();
			onFinishSet();
		} else {
			// Camera/hybrid count from the MediaPipe elbow angle, emg/hybrid need the sEMG
			// stream -- warn up front instead of silently recording 0 reps.
			if (usesCamera && !isWebcamActive) {
				toast.warning('ยังไม่ได้เปิดกล้อง ระบบจะยังไม่นับครั้ง (rep) จนกว่าจะเปิดกล้อง');
			}
			if (usesEmg && !emgLive) {
				toast.warning('ไม่พบสัญญาณจากเซนเซอร์ EMG ตรวจสอบการเชื่อมต่อบอร์ด');
			}
			workout.startSet();
		}
	}


	async function toggleWebcam() {
		if (isWebcamActive) {
			stopWebcam();
		} else {
			await startWebcam();
		}
	}

	async function ensureMediaPipeScripts(): Promise<void> {
		const load = (src: string) =>
			new Promise<void>((resolve, reject) => {
				if (document.querySelector(`script[src="${src}"]`)) {
					resolve();
					return;
				}
				const s = document.createElement('script');
				s.src = src;
				s.crossOrigin = 'anonymous';
				s.onload = () => resolve();
				s.onerror = () => reject(new Error(`Failed to load script ${src}`));
				document.head.appendChild(s);
			});

		await load('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
		await load('https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js');
		await load('https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js');
	}

	async function startWebcam() {
		try {
			modelStatus = 'loading';
			modelErrorMsg = '';

			await ensureMediaPipeScripts();
			cameraRepCounter.start(); // independent OpenCV.js motion counter -- doesn't block MediaPipe readiness

			let attempts = 0;
			while ((!(window as any).Pose || !(window as any).Camera) && attempts < 30) {
				await new Promise((r) => setTimeout(r, 150));
				attempts++;
			}

			if (!(window as any).Pose || !(window as any).Camera) {
				throw new Error('ไม่พบสคริปต์ MediaPipe ในเบราว์เซอร์ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต');
			}

			poseInstance = new (window as any).Pose({
				locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
			});

			poseInstance.setOptions({
				modelComplexity: 1,
				smoothLandmarks: true,
				enableSegmentation: false,
				minDetectionConfidence: 0.5,
				minTrackingConfidence: 0.5
			});

			poseInstance.onResults(onPoseResults);

			cameraInstance = new (window as any).Camera(videoElement, {
				onFrame: async () => {
					if (isWebcamActive && videoElement && poseInstance) {
						await poseInstance.send({ image: videoElement });
						cameraRepCounter.processFrame(videoElement); // shares this same frame/stream, no second getUserMedia
					}
				},
				width: 640,
				height: 480
			});

			await cameraInstance.start();
			isWebcamActive = true;
			telemetry.setWebcamActive(true);
			modelStatus = 'ready';
		} catch (err: any) {
			console.error('Camera/MediaPipe error:', err);
			modelStatus = 'error';
			modelErrorMsg = err.message || 'ไม่สามารถเปิดกล้องได้';
			isWebcamActive = false;
			telemetry.setWebcamActive(false);
		}
	}

	function stopWebcam() {
		cameraRepCounter.stop();
		if (cameraInstance) {
			try {
				cameraInstance.stop();
			} catch (e) {}
			cameraInstance = null;
		}
		if (poseInstance) {
			try {
				poseInstance.close();
			} catch (e) {}
			poseInstance = null;
		}
		isWebcamActive = false;
		telemetry.setWebcamActive(false);
		modelStatus = 'idle';
		drawStandbyCanvas();
	}

	function calculateElbowAngle(a: any, b: any, c: any) {
		const ab = { x: a.x - b.x, y: a.y - b.y };
		const cb = { x: c.x - b.x, y: c.y - b.y };
		const dot = ab.x * cb.x + ab.y * cb.y;
		const magAB = Math.sqrt(ab.x * ab.x + ab.y * ab.y);
		const magCB = Math.sqrt(cb.x * cb.x + cb.y * cb.y);
		if (magAB === 0 || magCB === 0) return 180;
		const cos = Math.max(-1, Math.min(1, dot / (magAB * magCB)));
		return (Math.acos(cos) * 180) / Math.PI;
	}

	function onPoseResults(results: any) {
		if (!canvasElement || !isWebcamActive) return;
		const ctx = canvasElement.getContext('2d');
		if (!ctx) return;
		const width = canvasElement.width;
		const height = canvasElement.height;

		frameCount++;
		const now = performance.now();
		if (now - lastFrameTime >= 1000) {
			fps = frameCount;
			frameCount = 0;
			lastFrameTime = now;
		}

		ctx.save();
		ctx.clearRect(0, 0, width, height);

		if (mirrorVideo) {
			ctx.translate(width, 0);
			ctx.scale(-1, 1);
		}

		ctx.drawImage(results.image, 0, 0, width, height);

		if (results.poseLandmarks) {
			const lm = results.poseLandmarks;
			const isRight = trackedArm === 'right';
			const sIdx = isRight ? 12 : 11;
			const eIdx = isRight ? 14 : 13;
			const wIdx = isRight ? 16 : 15;
			const hIdx = isRight ? 24 : 23;
			const oppSIdx = isRight ? 11 : 12;
			const oppHIdx = isRight ? 23 : 24;

			const shoulder = lm[sIdx];
			const elbow = lm[eIdx];
			const wrist = lm[wIdx];
			const hip = lm[hIdx];
			const oppShoulder = lm[oppSIdx];
			const oppHip = lm[oppHIdx];

			let elbowAngle = 165;
			if (shoulder && elbow && wrist && shoulder.visibility > 0.4 && elbow.visibility > 0.4) {
				elbowAngle = Math.round(calculateElbowAngle(shoulder, elbow, wrist));
			}

			const midS = { x: (shoulder.x + oppShoulder.x) / 2, y: (shoulder.y + oppShoulder.y) / 2 };
			const midH = { x: (hip.x + oppHip.x) / 2, y: (hip.y + oppHip.y) / 2 };
			const dx = midS.x - midH.x;
			const dy = midH.y - midS.y;
			const torsoAngle = Number((Math.abs(Math.atan2(dx, dy)) * (180 / Math.PI)).toFixed(1));

			const hikeDelta = Math.max(0, oppShoulder.y - shoulder.y);
			const shoulderHikeCm = Number((hikeDelta * 45).toFixed(1));

			const isTorsoCheating = torsoAngle > calibration.torsoAngleLimitDeg;
			const isShoulderCheating = shoulderHikeCm > calibration.shoulderHikeLimitCm;

			telemetry.updateFromMediaPipe({
				elbowAngle,
				torsoAngle,
				shoulderHikeCm,
				isTorsoCheating,
				isShoulderCheating,
				fps
			});

			// Draw Skeleton lines
			const connections = [
				[11, 12],
				[11, 23],
				[12, 24],
				[23, 24],
				[11, 13],
				[13, 15],
				[12, 14],
				[14, 16],
				[0, 11],
				[0, 12]
			];

			ctx.lineWidth = 4;
			connections.forEach(([p1, p2]) => {
				const pt1 = lm[p1];
				const pt2 = lm[p2];
				if (pt1 && pt2 && pt1.visibility > 0.4 && pt2.visibility > 0.4) {
					ctx.beginPath();
					ctx.moveTo(pt1.x * width, pt1.y * height);
					ctx.lineTo(pt2.x * width, pt2.y * height);

					const isActiveArm =
						(isRight && (p1 === 12 || p2 === 16)) || (!isRight && (p1 === 11 || p2 === 15));
					if (isActiveArm) {
						ctx.strokeStyle = '#00ff88';
						ctx.shadowColor = 'rgba(0, 255, 136, 0.8)';
						ctx.shadowBlur = 8;
					} else if ((p1 === 11 && p2 === 23) || (p1 === 12 && p2 === 24)) {
						ctx.strokeStyle = isTorsoCheating ? '#ef4444' : '#38bdf8';
						ctx.shadowColor = isTorsoCheating ? '#ef4444' : '#38bdf8';
						ctx.shadowBlur = 6;
					} else {
						ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
						ctx.shadowBlur = 0;
					}
					ctx.stroke();
				}
			});

			// Landmarks
			const keyPoints = [0, 11, 12, 13, 14, 15, 16, 23, 24];
			keyPoints.forEach((idx) => {
				const pt = lm[idx];
				if (pt && pt.visibility > 0.4) {
					ctx.beginPath();
					ctx.arc(pt.x * width, pt.y * height, 6, 0, Math.PI * 2);
					if (idx === eIdx || idx === wIdx) {
						ctx.fillStyle = '#00ff88';
					} else if (idx === sIdx && isShoulderCheating) {
						ctx.fillStyle = '#ef4444';
					} else {
						ctx.fillStyle = '#38bdf8';
					}
					ctx.fill();
					ctx.lineWidth = 2;
					ctx.strokeStyle = '#ffffff';
					ctx.stroke();
				}
			});

			// Label near elbow
			if (elbow && elbow.visibility > 0.4) {
				ctx.restore();
				ctx.save();
				const textX = mirrorVideo ? width - elbow.x * width : elbow.x * width;
				const textY = elbow.y * height;

				ctx.fillStyle = 'rgba(11, 15, 25, 0.85)';
				ctx.strokeStyle = elbowAngle < 70 ? '#00ff88' : '#06b6d4';
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.roundRect(textX + 15, textY - 20, 72, 32, 6);
				ctx.fill();
				ctx.stroke();

				ctx.fillStyle = '#ffffff';
				ctx.font = 'bold 14px monospace';
				ctx.fillText(`${elbowAngle}°`, textX + 25, textY + 2);
			}
		}

		ctx.restore();
	}

	function drawStandbyCanvas() {
		if (!canvasElement || isWebcamActive) return;
		const ctx = canvasElement.getContext('2d');
		if (!ctx) return;
		const width = canvasElement.width;
		const height = canvasElement.height;

		ctx.clearRect(0, 0, width, height);

		ctx.fillStyle = '#070a12';
		ctx.fillRect(0, 0, width, height);

		ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
		ctx.lineWidth = 1;
		for (let x = 0; x < width; x += 40) {
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, height);
			ctx.stroke();
		}
		for (let y = 0; y < height; y += 40) {
			ctx.beginPath();
			ctx.moveTo(0, y);
			ctx.lineTo(width, y);
			ctx.stroke();
		}
	}

	onMount(() => {
		drawStandbyCanvas();
	});

	onDestroy(() => {
		stopWebcam();
	});
</script>

<video bind:this={videoElement} playsinline muted class="hidden"></video>

<div class="mx-auto flex max-w-7xl flex-col gap-5 p-4 md:p-6">
	<!-- Set setup + start/stop -->
	<div class="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-border bg-card p-5 shadow-sm">
		<div class="flex flex-wrap items-end gap-4">
			<label class="flex flex-col gap-1.5 text-sm text-muted-foreground">
				ท่าออกกำลังกาย
				<select
					bind:value={workout.exercise}
					disabled={workout.isSetRunning}
					class="rounded-lg border border-border bg-background px-3 py-2 text-base font-semibold text-foreground focus:border-cyan-500 focus:outline-none"
				>
					{#each exercises as ex (ex)}
						<option value={ex}>{ex}</option>
					{/each}
				</select>
			</label>

			<label class="flex flex-col gap-1.5 text-sm text-muted-foreground">
				น้ำหนัก
				<select
					bind:value={workout.weightKg}
					disabled={workout.isSetRunning}
					class="rounded-lg border border-border bg-background px-3 py-2 text-base font-semibold text-foreground focus:border-cyan-500 focus:outline-none"
				>
					{#each weightOptions as wt (wt)}
						<option value={wt}>{wt} kg</option>
					{/each}
				</select>
			</label>

			<div class="flex flex-col gap-1.5">
				<span id="rep-source-label" class="text-sm text-muted-foreground">นับ rep จาก</span>
				<div
					role="radiogroup"
					aria-labelledby="rep-source-label"
					class="flex rounded-lg border border-border bg-muted/60 p-1"
				>
					{#each repSources as src (src.id)}
						{@const locked = workout.isSetRunning || (src.needsEmg && !calibration.canCountWithEmg)}
						<button
							type="button"
							role="radio"
							aria-checked={workout.repSource === src.id}
							disabled={locked && workout.repSource !== src.id}
							title={src.needsEmg && !calibration.canCountWithEmg
								? 'ต้องวัดจุดออกแรงสูงสุด (MVC) ในหน้า Calibration ก่อน'
								: src.hint}
							onclick={() => workout.setRepSource(src.id)}
							class={[
								'rounded-md px-4 py-1.5 text-base font-semibold transition disabled:cursor-not-allowed disabled:opacity-40',
								workout.repSource === src.id
									? 'bg-background text-foreground shadow-sm'
									: 'text-muted-foreground hover:text-foreground'
							]}
						>
							{src.label}
						</button>
					{/each}
				</div>
			</div>
		</div>

		<button
			onclick={handleStartStop}
			class={[
				'flex items-center gap-2 rounded-xl px-7 py-3 text-lg font-bold transition-all',
				workout.isSetRunning
					? 'bg-destructive text-white shadow-lg shadow-destructive/30'
					: 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20 hover:bg-emerald-400'
			]}
		>
			{#if workout.isSetRunning}
				<Stop size={18} weight="fill" />
				<span>จบเซต</span>
			{:else}
				<Play size={18} weight="fill" />
				<span>เริ่มเซต</span>
			{/if}
		</button>
	</div>

	<!-- The numbers a lifter glances at mid-set -->
	<div class="grid grid-cols-2 gap-3 md:grid-cols-5">
		<div class="rounded-xl border border-border bg-card p-4 shadow-sm md:col-span-2">
			<div class="text-sm text-muted-foreground">เซต #{workout.currentSet} · จำนวนครั้ง</div>
			<div class="text-6xl font-bold tabular-nums text-foreground">{workout.totalReps}</div>
			<div class="mt-1 flex gap-4 text-sm">
				<span class="text-emerald-600">ท่าคลีน <strong class="tabular-nums">{workout.cleanReps}</strong></span>
				<span class="text-rose-600">โกงท่า <strong class="tabular-nums">{workout.cheatedReps}</strong></span>
			</div>
		</div>
		<div class="rounded-xl border border-border bg-card p-4 shadow-sm">
			<div class="text-sm text-muted-foreground">เวลาเซต</div>
			<div class="text-4xl font-bold tabular-nums text-foreground">{setTime}</div>
		</div>
		<div class="rounded-xl border border-border bg-card p-4 shadow-sm">
			<div class="text-sm text-muted-foreground">แรงกล้ามเนื้อตอนนี้</div>
			<div
				class={[
					'text-4xl font-bold tabular-nums',
					telemetry.emg.isHighTension ? 'text-emerald-600' : 'text-foreground'
				]}
			>
				{emgLive ? `${Math.round(telemetry.emg.mvcPercent)}%` : '–'}
			</div>
			<div class="text-xs text-muted-foreground">ของแรงสูงสุด (MVC)</div>
		</div>
		<div class="rounded-xl border border-border bg-card p-4 shadow-sm">
			<div class="text-sm text-muted-foreground">สถานะ</div>
			<div class={['text-2xl font-bold', phase.tone]}>{phase.label}</div>
			<div class="text-xs text-muted-foreground">ท่าคลีน {workout.formPurityPercent}%</div>
		</div>
	</div>

	{#if !calibration.isCalibrated && !workout.isSetRunning}
		<div
			class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-800"
		>
			<span class="flex items-center gap-2">
				<WarningCircle size={18} weight="fill" />
				ยังไม่ได้ปรับเทียบเซนเซอร์ % แรงกล้ามเนื้อจะคำนวณจากค่ามาตรฐาน ไม่ใช่ของคุณ
			</span>
			<button onclick={onGoCalibrate} class="rounded-md border border-amber-600/50 px-3 py-1 font-semibold hover:bg-amber-500/20">
				ไปปรับเทียบ
			</button>
		</div>
	{/if}

	{#if workout.isSetRunning && usesEmg && !emgLive}
		<div class="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-800">
			<WarningCircle size={18} weight="fill" />
			<span>ไม่ได้รับสัญญาณจากเซนเซอร์ EMG ระบบนับ rep ด้วย EMG ไม่ได้จนกว่าสัญญาณจะกลับมา</span>
		</div>
	{/if}

	{#if workout.isSetRunning && usesCamera && !isWebcamActive}
		<div class="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-800">
			<WarningCircle size={18} weight="fill" />
			<span>เซตกำลังทำงานแต่กล้องปิดอยู่ ระบบจะไม่นับครั้ง (rep) จนกว่าจะเปิดกล้อง</span>
		</div>
	{/if}

	<div class="grid grid-cols-1 gap-5 lg:grid-cols-2">
		<!-- Camera -->
		<div
			class={[
				'flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm',
				cameraCompact && 'order-2 lg:col-span-2'
			]}
		>
			<div class="flex flex-wrap items-start justify-between gap-2">
				<div>
					<h3 class="flex items-center gap-2 text-base font-semibold text-foreground">
						<Camera size={18} class="text-cyan-600" />
						กล้องตรวจท่าทาง
					</h3>
					<p class="mt-0.5 text-sm text-muted-foreground">
						{usesCamera ? 'นับ rep จากมุมข้อศอก และจับการเหวี่ยงตัว/ยกไหล่' : 'ไม่บังคับ ใช้จับท่าโกงและวัดมุมข้อศอก'}
					</p>
				</div>

				<div class="flex items-center gap-2">
					{#if isWebcamActive}
						<select
							bind:value={trackedArm}
							onchange={() => telemetry.setTrackedArm(trackedArm)}
							class="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
							aria-label="แขนที่ติดตาม"
						>
							<option value="right">แขนขวา</option>
							<option value="left">แขนซ้าย</option>
						</select>
						<button
							onclick={() => (mirrorVideo = !mirrorVideo)}
							class="rounded-md border border-border p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
							title="กลับด้านภาพ"
						>
							<ArrowsLeftRight size={14} />
						</button>
					{/if}
					<button
						onclick={toggleWebcam}
						disabled={modelStatus === 'loading'}
						class={[
							'rounded-md border px-3 py-1.5 text-sm font-semibold transition',
							isWebcamActive
								? 'border-border text-foreground hover:bg-muted'
								: 'border-cyan-500/50 bg-cyan-500/10 text-cyan-700 hover:bg-cyan-500/20'
						]}
					>
						{modelStatus === 'loading' ? 'กำลังโหลด...' : isWebcamActive ? 'ปิดกล้อง' : 'เปิดกล้อง'}
					</button>
				</div>
			</div>

			{#if modelStatus === 'error'}
				<div class="flex items-center justify-between rounded-md bg-destructive/15 p-2.5 text-sm text-destructive">
					<span class="flex items-center gap-1.5">
						<WarningCircle size={16} />
						{modelErrorMsg}
					</span>
					<button onclick={() => (modelStatus = 'idle')} aria-label="ปิด">
						<X size={16} />
					</button>
				</div>
			{/if}

			<!-- Canvas Frame -->
			<div
				class={[
					'relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-border bg-[#070a12]',
					cameraCompact && 'hidden'
				]}
			>
				<canvas bind:this={canvasElement} width="640" height="480" class="h-full w-full object-cover"></canvas>

				<!-- ROM Angle HUD -->
				<div
					class="absolute top-3 left-3 rounded-lg border border-border bg-card/85 p-2.5 backdrop-blur-sm"
				>
					<span class="block text-2xl font-black text-emerald-600">{telemetry.cv.elbowAngle}°</span>
					<span class="text-xs text-muted-foreground">มุมข้อศอก</span>
				</div>

				<!-- Floating Alerts -->
				{#if workout.activeCheatWarnings.length > 0}
					<div class="absolute top-3 right-3 flex flex-col gap-1.5">
						{#each workout.activeCheatWarnings as warning (warning)}
							<div
								class="animate-bounce rounded-md bg-destructive/90 px-2.5 py-1 text-xs font-black text-white shadow-lg shadow-destructive/30"
							>
								{warning}
							</div>
						{/each}
					</div>
				{/if}

				<!-- Status Badge -->
				<div
					class="absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-card/80 px-2.5 py-0.5 text-xs text-muted-foreground backdrop-blur-sm"
				>
					<span
						class="h-1.5 w-1.5 rounded-full {isWebcamActive
							? 'bg-emerald-500 shadow-[0_0_6px_#10b981]'
							: 'bg-muted-foreground/50'}"
					></span>
					<span>{isWebcamActive ? `กล้องทำงาน · ${fps} FPS` : 'กล้องปิดอยู่'}</span>
				</div>

				<!-- Center Start Camera CTA when camera is idle -->
				{#if !isWebcamActive}
					<div
						class="absolute inset-0 flex flex-col items-center justify-center bg-black/60 p-6 text-center backdrop-blur-xs"
					>
						<div
							class="flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-br from-emerald-400 to-cyan-500 shadow-lg shadow-emerald-500/30"
						>
							<Camera size={28} class="text-black" />
						</div>
						<h4 class="mt-3 text-lg font-bold text-white">
							{usesCamera ? 'เปิดกล้องเพื่อนับ rep และตรวจท่า' : 'เปิดกล้องเพื่อตรวจท่าโกง (ไม่บังคับ)'}
						</h4>
						<p class="mt-1 max-w-xs text-sm text-white/70">
							ตั้งกล้องให้เห็นลำตัวและแขนข้างที่ยก ระบบจะวัดมุมข้อศอกและจับการเหวี่ยงตัว/ยกไหล่
						</p>
						<button
							onclick={startWebcam}
							disabled={modelStatus === 'loading'}
							class="mt-4 flex items-center gap-2 rounded-xl bg-linear-to-r from-emerald-500 to-cyan-500 px-6 py-3 font-black text-black shadow-xl shadow-emerald-500/25 transition-all hover:scale-105 hover:shadow-emerald-500/40 disabled:opacity-50"
						>
							<Camera size={20} weight="fill" class="fill-black" />
							<span>{modelStatus === 'loading' ? 'กำลังโหลดโมเดล...' : 'เปิดกล้อง'}</span>
						</button>
					</div>
				{/if}

				<!-- Footer Metrics -->
				<div class="absolute right-3 bottom-3 left-3 flex justify-between gap-2 text-sm">
					<span
						class="rounded border bg-card/80 px-2 py-1 backdrop-blur-sm {telemetry.cv.torsoAngle >
						calibration.torsoAngleLimitDeg
							? 'border-destructive text-destructive'
							: 'border-border text-muted-foreground'}"
					>
						เอนตัว {formatDec(telemetry.cv.torsoAngle, 1)}° / {formatDec(calibration.torsoAngleLimitDeg)}°
					</span>
					<span
						class="rounded border bg-card/80 px-2 py-1 backdrop-blur-sm {telemetry.cv.shoulderHikeCm >
						calibration.shoulderHikeLimitCm
							? 'border-destructive text-destructive'
							: 'border-border text-muted-foreground'}"
					>
						ยกไหล่ {formatDec(telemetry.cv.shoulderHikeCm, 1)} / {formatDec(calibration.shoulderHikeLimitCm)} ซม.
					</span>
				</div>
			</div>
		</div>

		<div class={cameraCompact ? 'order-1 lg:col-span-2' : ''}>
			<EmgGraphMonitor />
		</div>
	</div>

	<BiofeedbackSensors />

	<!-- Diagnostics lifters don't need mid-set, kept one click away for testing/reporting -->
	<details class="group rounded-xl border border-border bg-card shadow-sm">
		<summary class="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-semibold text-foreground">
			<CaretRight size={14} class="transition-transform group-open:rotate-90" />
			ข้อมูลละเอียดสำหรับนักพัฒนา / การทดสอบ
			<span class="font-normal text-muted-foreground">ค่าดิบ MPU · ตัวนับ OpenCV · export ข้อมูล</span>
		</summary>
		<div class="flex flex-col gap-4 border-t border-border p-5">
			<div>
				<h4 class="mb-2 text-sm font-semibold text-foreground">ค่าดิบ MPU-6050</h4>
				<dl class="grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
					{#each [
						{ k: 'Pitch', v: `${formatDec(telemetry.mpu.pitch, 1)}°` },
						{ k: 'Roll', v: `${formatDec(telemetry.mpu.roll, 1)}°` },
						{ k: 'Ax', v: formatDec(telemetry.mpu.ax, 2) },
						{ k: 'Ay', v: formatDec(telemetry.mpu.ay, 2) },
						{ k: 'Az', v: formatDec(telemetry.mpu.az, 2) },
						{ k: 'V₁ (ครั้งแรก)', v: `${formatDec(telemetry.mpu.rep1Velocity, 2)} m/s` }
					] as item (item.k)}
						<div class="rounded-lg bg-muted/60 p-2">
							<dt class="text-xs text-muted-foreground">{item.k}</dt>
							<dd class="font-semibold tabular-nums text-foreground">{item.v}</dd>
						</div>
					{/each}
				</dl>
			</div>
			<CameraMotionPanel />
			<RecordingControls />
		</div>
	</details>
</div>
