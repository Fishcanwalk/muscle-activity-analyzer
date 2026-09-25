<script lang="ts">
	import { onMount } from 'svelte';
	import { calibration, type CalibrationStep } from '$lib/workout/calibration.svelte';
	import { telemetry } from '$lib/workout/telemetry.svelte';
	import { ArrowRight, Info } from 'lucide-svelte';

	interface Props {
		onProceed: () => void;
	}

	let { onProceed }: Props = $props();

	let calMsg = $state('');
	let calMsgOk = $state(true);
	let msgTimer: ReturnType<typeof setTimeout> | null = null;

	onMount(() => {
		return () => {
			if (msgTimer) clearTimeout(msgTimer);
		};
	});

	function flashMsg(msg: string, ok: boolean) {
		calMsg = msg;
		calMsgOk = ok;
		if (msgTimer) clearTimeout(msgTimer);
		msgTimer = setTimeout(() => {
			calMsg = '';
		}, 4000);
	}

	const STEP_LABELS: Record<CalibrationStep, string> = {
		emgZero: 'จุดพักกล้ามเนื้อ',
		emgMvc: 'จุดออกแรงสูงสุด',
		fsrZero: 'จุดไม่มีแรงกด',
		fsrMax: 'แรงบีบสูงสุด'
	};
	let remaining = $derived(
		(Object.keys(STEP_LABELS) as CalibrationStep[]).filter((step) => !calibration.stepDone[step])
	);

	async function runCapture(step: CalibrationStep) {
		const result = await calibration.capture(step);
		if (result.ok) flashMsg(`บันทึก${STEP_LABELS[step]}สำเร็จ (${result.value})`, true);
		else flashMsg(`${STEP_LABELS[step]}: ${result.error}`, false);
	}

	function buttonLabel(step: CalibrationStep, idle: string) {
		return calibration.capturing === step ? `กำลังวัด... ${calibration.captureSecondsLeft} วิ` : idle;
	}

	async function saveThresholds() {
		const result = await calibration.saveRepThresholds();
		flashMsg(result.ok ? 'บันทึกเกณฑ์นับ rep สำเร็จ' : `${result.error}`, result.ok);
	}

	let thresholdError = $derived(calibration.validateRepThresholds());
	// Unsaved = the sliders differ from what the server-side detector is using now.
	let thresholdsDirty = $derived(
		calibration.emgRepOnPct !== telemetry.serverCalibration.emgRepOnPct ||
			calibration.emgRepOffPct !== telemetry.serverCalibration.emgRepOffPct ||
			calibration.emgRepPeakPct !== telemetry.serverCalibration.emgRepPeakPct
	);
	const METER_MAX_PCT = 100;
	const meterLeft = (pct: number) => `${Math.min(100, (pct / METER_MAX_PCT) * 100)}%`;

	const STATUS_LABELS = { live: 'ทำงาน', stale: 'ขาดการเชื่อมต่อ', never: 'ยังไม่พบข้อมูล' } as const;
	const STATUS_CLASSES = {
		live: 'text-emerald-600',
		stale: 'text-amber-600',
		never: 'text-muted-foreground'
	} as const;
</script>

<div class="mx-auto flex max-w-6xl flex-col gap-6 p-6">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div>
			<h2 class="text-2xl font-black tracking-tight text-foreground">
				ขั้นที่ 1 · ปรับเทียบเซนเซอร์
			</h2>
			<p class="text-sm text-muted-foreground">
				ปรับเทียบค่าเริ่มต้น (Zero & MVC) ของเซ็นเซอร์แต่ละตัวใหม่ทุก session เพราะตำแหน่งเซนเซอร์และสภาพกล้ามเนื้อเปลี่ยนทุกครั้ง
			</p>
		</div>

		<button
			onclick={onProceed}
			disabled={calibration.capturing !== null || !calibration.isCalibrated}
			title={calibration.isCalibrated ? undefined : `ยังต้องวัด: ${remaining.map((s) => STEP_LABELS[s]).join(', ')}`}
			class={[
				'flex items-center gap-2 rounded-lg px-5 py-2.5 font-bold transition-all disabled:opacity-50',
				calibration.isCalibrated
					? 'bg-linear-to-r from-emerald-500 to-emerald-600 text-black shadow-lg shadow-emerald-500/20 hover:translate-y-[-1px]'
					: 'border border-border bg-card text-muted-foreground hover:text-foreground'
			]}
		>
			<span>
				{calibration.isCalibrated ? 'ถัดไป: ตรวจความพร้อม' : `วัดให้ครบก่อน (เหลือ ${remaining.length} จุด)`}
			</span>
			<ArrowRight class="h-4 w-4" />
		</button>
	</div>

	{#if calMsg}
		<div
			class={[
				'animate-in fade-in slide-in-from-top-1 rounded-lg border px-4 py-2 text-sm font-bold shadow-md',
				calMsgOk
					? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-600'
					: 'border-red-500/50 bg-red-500/15 text-red-600'
			]}
		>
			{calMsg}
		</div>
	{/if}

	{#if !calibration.isCalibrated}
		<div
			class="flex items-start gap-3 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-800 dark:text-cyan-300"
		>
			<Info class="mt-0.5 h-4 w-4 shrink-0" />
			<span>
				ต้องปรับเทียบทุกครั้งก่อนเริ่ม session: ติดเซนเซอร์ให้เรียบร้อยแล้ววัดค่าให้ครบทั้ง 4 จุดตามลำดับ (จุดพัก →
				ออกแรงสูงสุด → ไม่มีแรงกด → แรงบีบสูงสุด) ระบบจะไม่ใช้ค่าจาก session ก่อน และจะเริ่มเซตได้เมื่อวัดครบแล้ว
			</span>
		</div>
	{/if}

	<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
		<!-- sEMG Calibration -->
		<div class="rounded-xl border border-border bg-card p-6 shadow-md">
			<h3 class="text-lg font-bold text-foreground">1. คลื่นกล้ามเนื้อ (EMG)</h3>
			<p class="mt-2 text-sm text-muted-foreground leading-relaxed">
				บันทึกระดับสัญญาณตอนกล้ามเนื้อพัก และตอนออกแรงเกร็งสุดแรง เพื่อให้ระบบคำนวณ "% การออกแรง" ระหว่างเล่นได้แม่นยำตามร่างกายของคุณ
			</p>

			<div class="mt-4 grid grid-cols-2 gap-4">
				<div class="flex flex-col items-center rounded-lg border border-border bg-background/50 p-4 text-center">
					<span class="text-sm font-semibold text-foreground">จุดพัก (ผ่อนคลายแขน)</span>
					<div
						class={[
							'my-2 text-sm font-semibold',
							calibration.stepDone.emgZero ? 'text-emerald-600' : 'text-muted-foreground'
						]}
					>
						{calibration.stepDone.emgZero ? '✓ วัดแล้ว' : 'ยังไม่ได้วัด'}
					</div>
					<span class="text-sm text-muted-foreground">ค่าที่ใช้: {calibration.emgZeroOffsetUv} µV · สด: {Math.round(telemetry.emg.rms)} µV</span>
					<p class="mt-2 text-sm text-muted-foreground leading-relaxed">ผ่อนคลายแขนให้สุด กดปุ่มแล้วอยู่นิ่ง 3 วินาที</p>
					<button
						onclick={() => runCapture('emgZero')}
						disabled={calibration.capturing !== null}
						class="mt-3 w-full rounded-lg border border-cyan-500/50 bg-card py-2 text-sm font-semibold text-cyan-700 hover:bg-cyan-500/10 disabled:opacity-50"
					>
						{buttonLabel('emgZero', 'บันทึกจุดพัก')}
					</button>
				</div>

				<div class="flex flex-col items-center rounded-lg border border-border bg-background/50 p-4 text-center">
					<span class="text-sm font-semibold text-foreground">จุดออกแรงสูงสุด (เกร็งสุดแรง)</span>
					<div
						class={[
							'my-2 text-sm font-semibold',
							calibration.stepDone.emgMvc ? 'text-emerald-600' : 'text-muted-foreground'
						]}
					>
						{calibration.stepDone.emgMvc ? '✓ วัดแล้ว' : 'ยังไม่ได้วัด'}
					</div>
					<span class="text-sm text-muted-foreground">ค่าที่ใช้: {calibration.emgMvcPeakUv} µV · สด: {Math.round(telemetry.emg.rms)} µV</span>
					<p class="mt-2 text-sm text-muted-foreground leading-relaxed">กดปุ่มแล้วเกร็งกล้ามเนื้อให้แรงที่สุดค้างไว้ 5 วินาที</p>
					<button
						onclick={() => runCapture('emgMvc')}
						disabled={calibration.capturing !== null}
						class="mt-3 w-full rounded-lg border border-cyan-500/50 bg-card py-2 text-sm font-semibold text-cyan-700 hover:bg-cyan-500/10 disabled:opacity-50"
					>
						{buttonLabel('emgMvc', 'บันทึกจุดออกแรงสูงสุด')}
					</button>
				</div>
			</div>
		</div>

		<!-- FSR Calibration -->
		<div class="rounded-xl border border-border bg-card p-6 shadow-md">
			<h3 class="text-lg font-bold text-foreground">2. แรงบีบมือ (FSR)</h3>
			<p class="mt-2 text-sm text-muted-foreground leading-relaxed">
				สอบเทียบแรงกดของมือจับเพื่อตรวจจับการจับหลุด (Grip Slippage) และวัดความสดของกล้ามเนื้อได้แม่นยำขึ้น
			</p>

			<div class="mt-4 grid grid-cols-2 gap-4">
				<div class="flex flex-col items-center rounded-lg border border-border bg-background/50 p-4 text-center">
					<span class="text-sm font-semibold text-foreground">ไม่มีแรงกด (ปล่อยมือ)</span>
					<div
						class={[
							'my-2 text-sm font-semibold',
							calibration.stepDone.fsrZero ? 'text-emerald-600' : 'text-muted-foreground'
						]}
					>
						{calibration.stepDone.fsrZero ? '✓ วัดแล้ว' : 'ยังไม่ได้วัด'}
					</div>
					<span class="text-sm text-muted-foreground">ค่าที่ใช้: {calibration.fsrZeroAdc} ADC · สด: {Math.round(telemetry.fsr.rawAdc)}</span>
					<p class="mt-2 text-sm text-muted-foreground leading-relaxed">ปล่อยมือจากเซนเซอร์ กดปุ่มแล้วไม่แตะเลย 3 วินาที</p>
					<button
						onclick={() => runCapture('fsrZero')}
						disabled={calibration.capturing !== null}
						class="mt-3 w-full rounded-lg border border-cyan-500/50 bg-card py-2 text-sm font-semibold text-cyan-700 hover:bg-cyan-500/10 disabled:opacity-50"
					>
						{buttonLabel('fsrZero', 'บันทึกจุดไม่มีแรงกด')}
					</button>
				</div>

				<div class="flex flex-col items-center rounded-lg border border-border bg-background/50 p-4 text-center">
					<span class="text-sm font-semibold text-foreground">แรงบีบสูงสุด</span>
					<div
						class={[
							'my-2 text-sm font-semibold',
							calibration.stepDone.fsrMax ? 'text-emerald-600' : 'text-muted-foreground'
						]}
					>
						{calibration.stepDone.fsrMax ? '✓ วัดแล้ว' : 'ยังไม่ได้วัด'}
					</div>
					<span class="text-sm text-muted-foreground">ค่าที่ใช้: {calibration.fsrMaxGripAdc} ADC · สด: {Math.round(telemetry.fsr.rawAdc)}</span>
					<p class="mt-2 text-sm text-muted-foreground leading-relaxed">กดปุ่มแล้วบีบเซนเซอร์ให้แรงที่สุดค้างไว้ 5 วินาที</p>
					<button
						onclick={() => runCapture('fsrMax')}
						disabled={calibration.capturing !== null}
						class="mt-3 w-full rounded-lg border border-cyan-500/50 bg-card py-2 text-sm font-semibold text-cyan-700 hover:bg-cyan-500/10 disabled:opacity-50"
					>
						{buttonLabel('fsrMax', 'บันทึกแรงบีบสูงสุด')}
					</button>
				</div>
			</div>
		</div>

		<!-- MediaPipe Sensitivity -->
		<div class="rounded-xl border border-border bg-card p-6 shadow-md">
			<h3 class="text-lg font-bold text-foreground">3. เกณฑ์ท่าโกงจากกล้อง</h3>
			<p class="mt-2 text-sm text-muted-foreground leading-relaxed">
				กำหนดเกณฑ์ความอ่อนไหวในการตัดคะแนนเมื่อตรวจพบการใช้แรงเหวี่ยงตัวหรือการยกไหล่ช่วย
			</p>

			<div class="mt-4 flex flex-col gap-4">
				<div class="flex flex-col gap-1.5">
					<div class="flex justify-between text-sm">
						<span class="text-foreground">มุมเอนตัวสูงสุด</span>
						<strong class="text-cyan-600">{calibration.torsoAngleLimitDeg}°</strong>
					</div>
					<input
						type="range"
						min="4"
						max="15"
						step="0.5"
						value={calibration.torsoAngleLimitDeg}
						oninput={(e: any) => calibration.setTorsoLimit(e.target.value)}
						class="w-full accent-emerald-500 cursor-pointer"
					/>
					<span class="text-sm text-muted-foreground">
						หากเอนตัวเกิน {calibration.torsoAngleLimitDeg}° ระบบจะตัดเป็น Cheated Rep ทันที
					</span>
				</div>

				<div class="flex flex-col gap-1.5">
					<div class="flex justify-between text-sm">
						<span class="text-foreground">ระยะยกไหล่สูงสุด</span>
						<strong class="text-cyan-600">{calibration.shoulderHikeLimitCm} cm</strong>
					</div>
					<input
						type="range"
						min="1"
						max="6"
						step="0.5"
						value={calibration.shoulderHikeLimitCm}
						oninput={(e: any) => calibration.setShoulderLimit(e.target.value)}
						class="w-full accent-emerald-500 cursor-pointer"
					/>
					<span class="text-sm text-muted-foreground">
						หากยกไหล่ขึ้นเกิน {calibration.shoulderHikeLimitCm} ซม. ระบบจะแจ้งเตือนให้กดไหล่ลง
					</span>
				</div>
			</div>
		</div>

		<!-- Diagnostics Table -->
		<div class="rounded-xl border border-border bg-card p-6 shadow-md">
			<h3 class="text-lg font-bold text-foreground">4. สถานะอุปกรณ์</h3>

			<div class="mt-4 overflow-hidden rounded-lg border border-border">
				<table class="w-full text-left text-sm">
					<tbody class="divide-y divide-border">
						<tr>
							<td class="p-2.5 text-muted-foreground">บอร์ดที่ส่งข้อมูล:</td>
							<td class="p-2.5 font-bold text-foreground">{telemetry.device.board || '-'}</td>
						</tr>
						<tr>
							<td class="p-2.5 text-muted-foreground">สถานะสตรีม (SSE):</td>
							<td class="p-2.5">
								<span
									class={[
										'rounded px-2 py-0.5 font-bold',
										telemetry.isWsConnected
											? 'bg-emerald-500/20 text-emerald-600'
											: 'bg-amber-500/20 text-amber-600'
									]}
								>
									{telemetry.isWsConnected ? `${telemetry.streamHz} packets/s` : 'ไม่ได้เชื่อมต่อ'}
								</span>
							</td>
						</tr>
						<tr>
							<td class="p-2.5 text-muted-foreground">จำนวนแพ็กเก็ตที่ได้รับ:</td>
							<td class="p-2.5 font-bold text-foreground">{telemetry.device.packetCount}</td>
						</tr>
						<tr>
							<td class="p-2.5 text-muted-foreground">sEMG (ผ่าน Arduino):</td>
							<td class={['p-2.5 font-bold', STATUS_CLASSES[telemetry.sensorStatus.emg]]}>
								{STATUS_LABELS[telemetry.sensorStatus.emg]}
							</td>
						</tr>
						<tr>
							<td class="p-2.5 text-muted-foreground">FSR แรงบีบมือ (ผ่าน Arduino):</td>
							<td class={['p-2.5 font-bold', STATUS_CLASSES[telemetry.sensorStatus.fsr]]}>
								{STATUS_LABELS[telemetry.sensorStatus.fsr]}
							</td>
						</tr>
						<tr>
							<td class="p-2.5 text-muted-foreground">MPU-6050 (I2C 0x68):</td>
							<td class={['p-2.5 font-bold', STATUS_CLASSES[telemetry.sensorStatus.mpu]]}>
								{STATUS_LABELS[telemetry.sensorStatus.mpu]}
							</td>
						</tr>
						<tr>
							<td class="p-2.5 text-muted-foreground">MAX30102 / MLX90614 (ชีพจร, อุณหภูมิ):</td>
							<td class={['p-2.5 font-bold', STATUS_CLASSES[telemetry.sensorStatus.vitals]]}>
								{STATUS_LABELS[telemetry.sensorStatus.vitals]}
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>

		<!-- EMG rep-counting thresholds -->
		<div class="rounded-xl border border-border bg-card p-6 shadow-md md:col-span-2">
			<h3 class="text-lg font-bold text-foreground">5. เกณฑ์นับ rep จากคลื่นกล้ามเนื้อ</h3>
			<p class="mt-2 text-sm leading-relaxed text-muted-foreground">
				ใช้เมื่อเลือก "นับ rep จาก: EMG" หรือ "Hybrid" ในหน้า Live Studio ค่าทั้งหมดเป็น % ของแรงสูงสุด (MVC) ที่วัดไว้ด้านบน
				ระบบนับ 1 rep เมื่อสัญญาณขึ้นเกิน "เริ่มเกร็ง" แล้วลดลงต่ำกว่า "จบ rep" (ใช้เวลา 0.4–4 วินาที) rep ที่แรงสูงสุดไม่ถึง
				"ออกแรงจริง" จะถูกนับเป็นท่าโกง (ใช้แรงเหวี่ยง)
			</p>

			{#if !calibration.canCountWithEmg}
				<div
					class="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-700 dark:text-amber-400"
				>
					วัด "จุดออกแรงสูงสุด" ในข้อ 1 ก่อน เกณฑ์เหล่านี้อ้างอิงจากค่านั้น
				</div>
			{/if}

			<div class="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
				<div class="flex flex-col gap-4">
					{#each [
						{ key: 'emgRepOnPct', label: 'เริ่มเกร็ง (เริ่มนับ rep)', min: 15, max: 80, color: 'text-emerald-600', accent: 'accent-emerald-600' },
						{ key: 'emgRepOffPct', label: 'จบ rep (กล้ามเนื้อคลายตัว)', min: 5, max: 60, color: 'text-amber-600', accent: 'accent-amber-600' },
						{ key: 'emgRepPeakPct', label: 'ออกแรงจริง (ท่าไม่โกง)', min: 20, max: 95, color: 'text-violet-600', accent: 'accent-violet-600' }
					] as const as t (t.key)}
						<div class="flex flex-col gap-1.5">
							<div class="flex justify-between text-sm">
								<label for={t.key} class="text-foreground">{t.label}</label>
								<strong class={t.color}>{calibration[t.key]}% MVC</strong>
							</div>
							<input
								id={t.key}
								type="range"
								min={t.min}
								max={t.max}
								step="1"
								bind:value={calibration[t.key]}
								class={['w-full cursor-pointer', t.accent]}
							/>
						</div>
					{/each}

					{#if thresholdError}
						<span class="text-sm font-semibold text-red-600">{thresholdError}</span>
					{/if}
					<button
						onclick={saveThresholds}
						disabled={thresholdError !== null || !thresholdsDirty}
						class="w-fit rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-black hover:bg-emerald-400 disabled:opacity-50"
					>
						{thresholdsDirty ? 'บันทึกเกณฑ์' : 'บันทึกแล้ว'}
					</button>
				</div>

				<!-- Live preview: the current envelope against the three thresholds -->
				<div class="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4">
					<div class="flex items-center justify-between text-sm">
						<span class="font-semibold text-foreground">ทดลองนับ (สัญญาณสด)</span>
						<span
							class={[
								'rounded px-2 py-0.5 font-bold',
								telemetry.emgRep.state === 'CONTRACT'
									? 'bg-emerald-500/15 text-emerald-700'
									: 'bg-muted text-muted-foreground'
							]}
						>
							{telemetry.emgRep.state === 'CONTRACT' ? 'กำลังเกร็ง' : 'พัก'}
						</span>
					</div>

					<div class="relative h-6 w-full overflow-hidden rounded-full bg-background">
						<div
							class="h-full bg-emerald-500/70 transition-all duration-150"
							style="width: {meterLeft(telemetry.emg.mvcPercent)}"
						></div>
						{#each [
							{ pct: telemetry.serverCalibration.emgRepOffPct, cls: 'bg-amber-600' },
							{ pct: telemetry.serverCalibration.emgRepOnPct, cls: 'bg-emerald-700' },
							{ pct: telemetry.serverCalibration.emgRepPeakPct, cls: 'bg-violet-600' }
						] as marker (marker.cls)}
							<span
								class={['absolute top-0 h-full w-0.5', marker.cls]}
								style="left: {meterLeft(marker.pct)}"
							></span>
						{/each}
					</div>
					<div class="flex justify-between text-sm text-muted-foreground">
						<span>ตอนนี้: <strong class="text-foreground">{Math.round(telemetry.emg.mvcPercent)}% MVC</strong></span>
						<span>เส้นแสดงเกณฑ์ที่บันทึกแล้ว</span>
					</div>

					<div class="flex items-end justify-between border-t border-border pt-3">
						<div>
							<span class="text-xs text-muted-foreground">นับได้ (ทดลอง)</span>
							<div class="text-3xl font-black text-foreground">{telemetry.emgRepTestCount} <span class="text-sm font-normal text-muted-foreground">rep</span></div>
						</div>
						<button
							onclick={() => telemetry.resetEmgRepTestCount()}
							class="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-muted"
						>
							รีเซ็ต
						</button>
					</div>
					<p class="text-sm leading-relaxed text-muted-foreground">
						ลองทำท่า 5–10 ครั้งแล้วดูว่าตัวเลขตรงกับที่ทำจริงไหม ถ้านับขาด ให้ลด "เริ่มเกร็ง" ถ้านับเกินหรือนับซ้ำ ให้ลด "จบ rep"
						หรือเพิ่มช่องห่างระหว่างสองเกณฑ์
					</p>
				</div>
			</div>
		</div>
	</div>
</div>

