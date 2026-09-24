// Second, independent camera-based rep counter using OpenCV.js (classic frame
// differencing -- no ML/pose model), running alongside the existing MediaPipe
// Pose elbow-angle FSM in telemetry.svelte.ts. This is a read-only cross-check
// display: it does NOT call workout.recordRep(), so it can never double-count
// a rep against the official MediaPipe-driven count. See
// docs/opencv_motion_rep_counter.md for the full design write-up.

const OPENCV_JS_SRC = 'https://docs.opencv.org/4.9.0/opencv.js';

// Downscaled work canvas -- OpenCV.js Mat ops are cheap at this size and it
// keeps every frame's cv.Mat allocations small.
const WORK_W = 160;
const WORK_H = 120;

// Horizontal band roughly covering where the moving limb/dumbbell travels in
// a front-on webcam shot. Tune per-exercise if this is ever generalized
// beyond a rough cross-check.
const ROI = { xRatio: 0.15, yRatio: 0.3, wRatio: 0.7, hRatio: 0.45 };

const GAUSSIAN_KSIZE = 5;
const DIFF_THRESHOLD = 25; // 0-255 pixel-intensity-delta cutoff for "changed"
const MOTION_SMOOTHING = 0.3; // EMA factor applied to each new raw motion reading
const RUNNING_MAX_DECAY = 0.995; // per-frame decay of the adaptive normalization ceiling
const ACTIVE_THRESHOLD = 35; // normalized motionLevel (0-100) that counts as "moving"
const REST_THRESHOLD = 15; // normalized motionLevel below which we call it "settled"
const PEAK_DROPOFF = 10; // must drop this many points off the peak to count as "falling"

class CameraRepCounter {
	status = $state<'idle' | 'loading' | 'tracking' | 'error'>('idle');
	errorMsg = $state('');
	motionLevel = $state(0); // 0-100, smoothed + adaptively normalized
	repCount = $state(0);

	private cv: any = null;
	private workCanvas: HTMLCanvasElement | null = null;
	private workCtx: CanvasRenderingContext2D | null = null;
	private prevGray: any = null; // cv.Mat, manually freed (OpenCV.js is WASM -- no GC)

	private smoothedMotion = 0;
	private runningMax = 1;
	private fsmState: 'REST' | 'RISING' | 'FALLING' = 'REST';
	private peakMotion = 0;

	async start(): Promise<void> {
		if (typeof window === 'undefined') return;
		this.resetCounters();
		this.status = 'loading';
		this.errorMsg = '';
		try {
			await this.ensureOpenCvLoaded();
			this.cv = (window as any).cv;
			this.workCanvas = document.createElement('canvas');
			this.workCanvas.width = WORK_W;
			this.workCanvas.height = WORK_H;
			this.workCtx = this.workCanvas.getContext('2d', { willReadFrequently: true });
			this.status = 'tracking';
		} catch (err: any) {
			this.status = 'error';
			this.errorMsg = err?.message ?? 'ไม่สามารถโหลด OpenCV.js ได้';
		}
	}

	stop(): void {
		if (this.prevGray) {
			this.prevGray.delete();
			this.prevGray = null;
		}
		this.resetCounters();
		this.status = 'idle';
	}

	// Called once per camera frame from PageLiveStudio's existing MediaPipe
	// `onFrame` callback, sharing the same <video> element/stream (no second
	// getUserMedia call).
	processFrame(videoEl: HTMLVideoElement): void {
		if (this.status !== 'tracking' || !this.cv || !this.workCtx || !this.workCanvas) return;
		if (videoEl.readyState < 2) return; // not enough data yet

		const cv = this.cv;
		this.workCtx.drawImage(videoEl, 0, 0, WORK_W, WORK_H);

		let src: any, gray: any, blurred: any, diff: any, thresh: any, roiMat: any;
		try {
			src = cv.imread(this.workCanvas);
			gray = new cv.Mat();
			cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
			blurred = new cv.Mat();
			cv.GaussianBlur(gray, blurred, new cv.Size(GAUSSIAN_KSIZE, GAUSSIAN_KSIZE), 0);

			if (!this.prevGray) {
				this.prevGray = blurred.clone();
				return;
			}

			diff = new cv.Mat();
			cv.absdiff(blurred, this.prevGray, diff);
			thresh = new cv.Mat();
			cv.threshold(diff, thresh, DIFF_THRESHOLD, 255, cv.THRESH_BINARY);

			const roiRect = new cv.Rect(
				Math.round(WORK_W * ROI.xRatio),
				Math.round(WORK_H * ROI.yRatio),
				Math.round(WORK_W * ROI.wRatio),
				Math.round(WORK_H * ROI.hRatio)
			);
			roiMat = thresh.roi(roiRect);
			const changedPixels = cv.countNonZero(roiMat);
			const motionRatio = (changedPixels / (roiRect.width * roiRect.height)) * 100;

			this.smoothedMotion += MOTION_SMOOTHING * (motionRatio - this.smoothedMotion);

			// Adaptive normalization: a slowly-decaying running max means
			// "100" always means "about as much motion as recently seen",
			// independent of camera distance/lighting/exercise amplitude.
			this.runningMax = Math.max(this.smoothedMotion, this.runningMax * RUNNING_MAX_DECAY);
			this.motionLevel = Math.round(Math.min(100, (this.smoothedMotion / this.runningMax) * 100));

			this.advanceFsm(this.motionLevel);

			this.prevGray.delete();
			this.prevGray = blurred.clone();
		} finally {
			// OpenCV.js allocates in the WASM heap, not the JS GC heap -- every
			// Mat created above must be explicitly freed every frame or it leaks.
			src?.delete();
			gray?.delete();
			blurred?.delete();
			diff?.delete();
			thresh?.delete();
			roiMat?.delete();
		}
	}

	// Mirrors the *style* of the elbow-angle FSM in telemetry.svelte.ts
	// (REST/RISING/FALLING -> increment on settle), just fed by pixel motion
	// instead of joint angle.
	private advanceFsm(level: number) {
		switch (this.fsmState) {
			case 'REST':
				if (level >= ACTIVE_THRESHOLD) {
					this.fsmState = 'RISING';
					this.peakMotion = level;
				}
				break;
			case 'RISING':
				if (level > this.peakMotion) this.peakMotion = level;
				if (level < this.peakMotion - PEAK_DROPOFF) this.fsmState = 'FALLING';
				break;
			case 'FALLING':
				if (level <= REST_THRESHOLD) {
					this.repCount++;
					this.fsmState = 'REST';
					this.peakMotion = 0;
				} else if (level > this.peakMotion) {
					this.peakMotion = level; // picked back up without settling -- still rising
					this.fsmState = 'RISING';
				}
				break;
		}
	}

	private resetCounters() {
		this.repCount = 0;
		this.motionLevel = 0;
		this.smoothedMotion = 0;
		this.runningMax = 1;
		this.fsmState = 'REST';
		this.peakMotion = 0;
	}

	private ensureOpenCvLoaded(): Promise<void> {
		return new Promise((resolve, reject) => {
			const w = window as any;
			if (w.cv && w.cv.Mat) {
				resolve();
				return;
			}
			const waitForRuntime = () => {
				if (w.cv && w.cv.Mat) {
					resolve();
					return;
				}
				// OpenCV.js compiles its WASM module asynchronously -- `cv` exists
				// as soon as the script executes, but `cv.Mat` etc. aren't usable
				// until onRuntimeInitialized fires, unlike a plain script `onload`.
				w.cv['onRuntimeInitialized'] = () => resolve();
			};
			const existing = document.querySelector('script[data-opencv-js]');
			if (existing) {
				waitForRuntime();
				return;
			}
			const s = document.createElement('script');
			s.src = OPENCV_JS_SRC;
			s.async = true;
			s.dataset.opencvJs = 'true';
			s.onload = waitForRuntime;
			s.onerror = () => reject(new Error('โหลดสคริปต์ OpenCV.js ไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต'));
			document.head.appendChild(s);
		});
	}
}

export const cameraRepCounter = new CameraRepCounter();
