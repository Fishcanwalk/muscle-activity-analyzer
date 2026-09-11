<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { workout } from '$lib/workout/workout.svelte';
	import { telemetry } from '$lib/workout/telemetry.svelte';
	import { calibration } from '$lib/workout/calibration.svelte';
	import EmgGraphMonitor from './EmgGraphMonitor.svelte';
	import BiofeedbackSensors from './BiofeedbackSensors.svelte';
	import { formatDec } from '$lib/utils/format';
	import { Camera, ArrowClockwise, WarningCircle, Play, Stop, X } from 'phosphor-svelte';

	interface Props {
		onFinishSet: () => void;
	}

	let { onFinishSet }: Props = $props();

	let canvasElement: HTMLCanvasElement | null = $state(null);
	let videoElement: HTMLVideoElement | null = $state(null);
	let animationFrameId: number;

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

	const exercises = ['Biceps Curl', 'Hammer Curl', 'Preacher Curl', 'Dumbbell Row'];
	const weightOptions = [7.5, 10.0, 12.5, 15.0, 17.5, 20.0];

	function handleStartStop() {
		if (workout.isSetRunning) {
			workout.stopSet();
			onFinishSet();
		} else {
			workout.startSet();
		}
	}

	function triggerTorsoCheat() {
		telemetry.triggerTorsoCheat();
	}

	function triggerShoulderCheat() {
		telemetry.triggerShoulderCheat();
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

	function drawSyntheticSkeleton() {
		if (!canvasElement || isWebcamActive) return;
		const ctx = canvasElement.getContext('2d');
		if (!ctx) return;
		const width = canvasElement.width;
		const height = canvasElement.height;

		ctx.clearRect(0, 0, width, height);

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

		const { cv } = telemetry;
		const hipX = width * 0.45;
		const hipY = height * 0.75;
		const torsoLeanRad = (cv.torsoAngle * Math.PI) / 180;
		const torsoLength = height * 0.35;
		const shoulderX = hipX - Math.sin(torsoLeanRad) * torsoLength;
		const shoulderY = hipY - Math.cos(torsoLeanRad) * torsoLength - cv.shoulderHikeCm * 4;
		const headX = shoulderX - Math.sin(torsoLeanRad) * 45;
		const headY = shoulderY - 35;

		const upperArmLength = height * 0.22;
		const forearmLength = height * 0.2;
		const elbowX = shoulderX + 25;
		const elbowY = shoulderY + upperArmLength;

		const elbowRad = (cv.elbowAngle * Math.PI) / 180;
		const wristX = elbowX + Math.sin(Math.PI - elbowRad) * forearmLength;
		const wristY = elbowY - Math.cos(Math.PI - elbowRad) * forearmLength;

		// Torso
		ctx.lineWidth = 6;
		ctx.strokeStyle = cv.isTorsoCheating ? '#ef4444' : '#38bdf8';
		ctx.beginPath();
		ctx.moveTo(hipX, hipY);
		ctx.lineTo(shoulderX, shoulderY);
		ctx.stroke();

		// Head
		ctx.fillStyle = '#0b0f19';
		ctx.strokeStyle = '#38bdf8';
		ctx.lineWidth = 3;
		ctx.beginPath();
		ctx.arc(headX, headY, 20, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();

		// Arm
		ctx.lineWidth = 6;
		ctx.strokeStyle = cv.isShoulderCheating ? '#ef4444' : '#10b981';
		ctx.beginPath();
		ctx.moveTo(shoulderX, shoulderY);
		ctx.lineTo(elbowX, elbowY);
		ctx.stroke();

		ctx.strokeStyle = '#10b981';
		ctx.beginPath();
		ctx.moveTo(elbowX, elbowY);
		ctx.lineTo(wristX, wristY);
		ctx.stroke();

		// Joints
		[
			{ x: shoulderX, y: shoulderY, color: cv.isShoulderCheating ? '#ef4444' : '#38bdf8' },
			{ x: elbowX, y: elbowY, color: '#00ff88' },
			{ x: wristX, y: wristY, color: '#00ff88' },
			{ x: hipX, y: hipY, color: '#38bdf8' }
		].forEach((j) => {
			ctx.fillStyle = j.color;
			ctx.beginPath();
			ctx.arc(j.x, j.y, 6, 0, Math.PI * 2);
			ctx.fill();
			ctx.lineWidth = 2;
			ctx.strokeStyle = '#ffffff';
			ctx.stroke();
		});

		// Dumbbell
		const dbAngle = Math.PI - elbowRad;
		ctx.save();
		ctx.translate(wristX, wristY);
		ctx.rotate(dbAngle);
		ctx.fillStyle = '#9ca3af';
		ctx.fillRect(-4, -18, 8, 36);
		ctx.fillStyle = '#f59e0b';
		ctx.fillRect(-10, -22, 20, 8);
		ctx.fillRect(-10, 14, 20, 8);
		ctx.restore();
	}

	function loop() {
		if (!isWebcamActive) {
			drawSyntheticSkeleton();
		}
		animationFrameId = requestAnimationFrame(loop);
	}

	onMount(() => {
		animationFrameId = requestAnimationFrame(loop);
		telemetry.startSimulation();
	});

	onDestroy(() => {
		if (animationFrameId) cancelAnimationFrame(animationFrameId);
		stopWebcam();
	});
</script>

<video bind:this={videoElement} playsinline muted class="hidden"></video>

<div class="mx-auto flex max-w-7xl flex-col gap-5 p-4 md:p-6">
	<!-- Control Bar -->
	<div class="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-md">
		<div class="flex items-center gap-4">
			<div class="flex flex-col gap-1">
				<label for="ex-select" class="text-xs text-muted-foreground">ท่าออกกำลังกาย</label>
				<select
					id="ex-select"
					bind:value={workout.exercise}
					class="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-semibold text-foreground focus:border-cyan-500 focus:outline-none"
				>
					{#each exercises as ex}
						<option value={ex}>{ex}</option>
					{/each}
				</select>
			</div>

			<div class="flex flex-col gap-1">
				<label for="wt-select" class="text-xs text-muted-foreground">น้ำหนักดัมเบล</label>
				<select
					id="wt-select"
					bind:value={workout.weightKg}
					class="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-semibold text-foreground focus:border-cyan-500 focus:outline-none"
				>
					{#each weightOptions as wt}
						<option value={wt}>{wt} kg</option>
					{/each}
				</select>
			</div>
		</div>

		<div class="flex items-center gap-6">
			<div>
				<span class="text-xs text-muted-foreground">เซตปัจจุบัน</span>
				<div class="text-xl font-black text-foreground">
					#{workout.currentSet} <span class="text-xs font-normal text-muted-foreground">/ {workout.totalSets}</span>
				</div>
			</div>

			<div>
				<span class="text-xs text-muted-foreground">เวลาเซต (TUT)</span>
				<div class="text-xl font-black text-cyan-400">
					{String(Math.floor(workout.setDurationSeconds / 60)).padStart(2, '0')}:{String(
						workout.setDurationSeconds % 60
					).padStart(2, '0')}
				</div>
			</div>
		</div>

		<div class="flex items-center gap-3">
			<button
				onclick={handleStartStop}
				class="flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-black transition-all {workout.isSetRunning
					? 'bg-destructive text-white shadow-lg shadow-destructive/30'
					: 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20 hover:bg-emerald-400'}"
			>
				{#if workout.isSetRunning}
					<Stop size={15} weight="fill" class="fill-white" />
					<span>จบเซต & ดูสรุปผล</span>
				{:else}
					<Play size={15} weight="fill" class="fill-black" />
					<span>เริ่มเซต (START SET)</span>
				{/if}
			</button>

			{#if !isWebcamActive && workout.isSetRunning}
				<div class="flex gap-2">
					<button
						onclick={triggerTorsoCheat}
						class="flex items-center gap-1 rounded-md border border-amber-500/50 bg-amber-500/10 px-2.5 py-1.5 text-xs font-bold text-amber-400 hover:bg-amber-500/20"
					>
						<WarningCircle size={13} class="text-amber-400" />
						<span>เหวี่ยงตัว</span>
					</button>
					<button
						onclick={triggerShoulderCheat}
						class="flex items-center gap-1 rounded-md border border-amber-500/50 bg-amber-500/10 px-2.5 py-1.5 text-xs font-bold text-amber-400 hover:bg-amber-500/20"
					>
						<WarningCircle size={13} class="text-amber-400" />
						<span>ยกไหล่</span>
					</button>
				</div>
			{/if}
		</div>
	</div>

	<!-- Main Grid: CV Pose + 50Hz Stream -->
	<div class="grid grid-cols-1 gap-5 lg:grid-cols-2">
		<!-- Left: Camera HUD -->
		<div class="flex flex-col rounded-xl border border-border bg-card p-4 shadow-md">
			<div class="flex flex-wrap items-center justify-between gap-2 pb-3">
				<div>
					<span class="text-[10px] font-bold tracking-wider text-cyan-400 uppercase">
						MediaPipe Pose (33 Landmarks)
					</span>
					<h3 class="text-base font-bold text-foreground">Real-Time Joint Angle & Anti-Cheat HUD</h3>
				</div>

				<div class="flex items-center gap-2">
					<button
						onclick={toggleWebcam}
						disabled={modelStatus === 'loading'}
						class="flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-bold transition-all {isWebcamActive
							? 'border-emerald-500 bg-emerald-500/20 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
							: 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20'}"
					>
						<Camera size={14} />
						{#if modelStatus === 'loading'}
							<span>โหลด Model...</span>
						{:else if isWebcamActive}
							<span>กล้องจริง (ON)</span>
						{:else}
							<span>เปิดกล้องจริง</span>
						{/if}
					</button>

					{#if isWebcamActive}
						<select
							bind:value={trackedArm}
							onchange={() => telemetry.setTrackedArm(trackedArm)}
							class="rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
						>
							<option value="right">แขนขวา</option>
							<option value="left">แขนซ้าย</option>
						</select>

						<button
							onclick={() => (mirrorVideo = !mirrorVideo)}
							class="rounded border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
						>
							<ArrowClockwise size={13} />
						</button>
					{/if}
				</div>
			</div>

			{#if modelStatus === 'error'}
				<div class="mb-3 flex items-center justify-between rounded-md bg-destructive/15 p-2 text-xs text-destructive">
					<span class="flex items-center gap-1.5">
						<WarningCircle size={14} />
						{modelErrorMsg}
					</span>
					<button onclick={() => (modelStatus = 'idle')}>
						<X size={14} />
					</button>
				</div>
			{/if}

			<!-- Canvas Frame -->
			<div class="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-border bg-[#070a12]">
				<canvas bind:this={canvasElement} width="640" height="480" class="h-full w-full object-cover"></canvas>

				<!-- ROM Angle HUD -->
				<div
					class="absolute top-3 left-3 rounded-lg border border-border bg-card/85 p-2.5 backdrop-blur-sm"
				>
					<span class="block text-2xl font-black text-emerald-400">{telemetry.cv.elbowAngle}°</span>
					<span class="text-[9px] font-bold tracking-wider text-muted-foreground uppercase">ELBOW ROM</span>
				</div>

				<!-- Floating Alerts -->
				{#if workout.activeCheatWarnings.length > 0}
					<div class="absolute top-3 right-3 flex flex-col gap-1.5">
						{#each workout.activeCheatWarnings as warning}
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
					class="absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-card/80 px-2.5 py-0.5 text-[11px] text-muted-foreground backdrop-blur-sm"
				>
					<span
						class="h-1.5 w-1.5 rounded-full {isWebcamActive
							? 'bg-emerald-500 shadow-[0_0_6px_#10b981]'
							: 'bg-cyan-500 shadow-[0_0_6px_#06b6d4]'}"
					></span>
					<span>{isWebcamActive ? `Live Camera (${fps} FPS)` : 'Synthetic Simulation'}</span>
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
						<h4 class="mt-3 text-base font-black text-white">ทดสอบ Real-Time Joint Angle & Anti-Cheat</h4>
						<p class="mt-1 max-w-xs text-xs text-muted-foreground">
							เชื่อมต่อกล้องจริงเพื่อคำนวณมุมข้อศอกสด และดักจับการเหวี่ยงตัว/ยกไหล่ด้วย MediaPipe Pose (30 FPS)
						</p>
						<button
							onclick={startWebcam}
							disabled={modelStatus === 'loading'}
							class="mt-4 flex items-center gap-2 rounded-xl bg-linear-to-r from-emerald-500 to-cyan-500 px-6 py-3 font-black text-black shadow-xl shadow-emerald-500/25 transition-all hover:scale-105 hover:shadow-emerald-500/40 disabled:opacity-50"
						>
							<Camera size={20} weight="fill" class="fill-black" />
							<span>{modelStatus === 'loading' ? 'กำลังดาวน์โหลด Model...' : 'เปิดกล้องจริงทันที (Start Real Camera)'}</span>
						</button>
					</div>
				{/if}

				<!-- Footer Metrics -->
				<div class="absolute right-3 bottom-3 left-3 flex justify-between gap-2 text-xs font-mono">
					<span
						class="rounded border bg-card/80 px-2 py-1 backdrop-blur-sm {telemetry.cv.torsoAngle >
						calibration.torsoAngleLimitDeg
							? 'border-destructive text-destructive'
							: 'border-border text-muted-foreground'}"
					>
						Torso: {formatDec(telemetry.cv.torsoAngle)}° (Max {formatDec(calibration.torsoAngleLimitDeg)}°)
					</span>
					<span
						class="rounded border bg-card/80 px-2 py-1 backdrop-blur-sm {telemetry.cv.shoulderHikeCm >
						calibration.shoulderHikeLimitCm
							? 'border-destructive text-destructive'
							: 'border-border text-muted-foreground'}"
					>
						Hike: {formatDec(telemetry.cv.shoulderHikeCm)} cm (Max {formatDec(calibration.shoulderHikeLimitCm)}cm)
					</span>
				</div>
			</div>
		</div>

		<!-- Right: Biofeedback Columns -->
		<div class="flex flex-col">
			<!-- sEMG High-Clarity Monitor & Real-Time Oscilloscope -->
			<EmgGraphMonitor />

			<!-- VBT Velocity & FSR Vitals Sensors -->
		</div>
	</div>
	<BiofeedbackSensors />

	<!-- Rep Counter Banner -->
	<div class="grid grid-cols-2 gap-4 rounded-xl border border-cyan-500/30 bg-card p-4 text-center md:grid-cols-5">
		<div>
			<span class="text-xs font-bold text-muted-foreground uppercase">TOTAL REPS</span>
			<div class="text-4xl font-black text-foreground">{workout.totalReps}</div>
			<span class="text-[10px] text-muted-foreground">ครั้งทั้งหมด</span>
		</div>

		<div>
			<span class="text-xs font-bold text-emerald-400 uppercase">CLEAN REPS</span>
			<div class="text-4xl font-black text-emerald-400">{workout.cleanReps}</div>
			<span class="text-[10px] text-muted-foreground">แรงตึงเข้า 100%</span>
		</div>

		<div>
			<span class="text-xs font-bold text-destructive uppercase">CHEATED REPS</span>
			<div class="text-4xl font-black text-destructive">{workout.cheatedReps}</div>
			<span class="text-[10px] text-muted-foreground">พบการโกงท่า</span>
		</div>

		<div>
			<span class="text-xs font-bold text-cyan-400 uppercase">FORM PURITY</span>
			<div class="text-4xl font-black text-cyan-400">{formatDec(workout.formPurityPercent)}%</div>
			<span class="text-[10px] text-muted-foreground">ความสมบูรณ์ฟอร์ม</span>
		</div>

		<div class="flex flex-col items-center justify-center">
			<span class="text-xs font-bold text-muted-foreground uppercase">FSM STATE</span>
			<span
				class="mt-1 rounded-full border px-4 py-1 text-sm font-black tracking-wider uppercase {workout.fsmState ===
				'PEAK'
					? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
					: workout.fsmState === 'INFLECTION'
						? 'border-amber-500/60 bg-amber-500/20 text-amber-400'
						: workout.fsmState === 'START'
							? 'border-cyan-500/60 bg-cyan-500/20 text-cyan-400'
							: 'border-border bg-muted/40 text-muted-foreground'}"
			>
				{workout.fsmState}
			</span>
			<span class="mt-0.5 text-[10px] text-muted-foreground">Rep State Machine</span>
		</div>
	</div>
</div>

