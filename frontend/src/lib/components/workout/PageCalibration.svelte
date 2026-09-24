<script lang="ts">
	import { onMount } from 'svelte';
	import { calibration } from '$lib/workout/calibration.svelte';
	import { telemetry } from '$lib/workout/telemetry.svelte';
	import { CheckCircle2, Sliders, Cpu, Activity } from 'lucide-svelte';

	let calMsg = $state('');
	let calMsgOk = $state(true);

	onMount(() => {
		calibration.loadFromServer();
	});

	function flashMsg(msg: string, ok: boolean) {
		calMsg = msg;
		calMsgOk = ok;
		setTimeout(() => {
			calMsg = '';
		}, 3000);
	}

	async function handleCalibrateEmgZero() {
		const ok = await calibration.calibrateEmgZero(telemetry.emg.rms || 14);
		flashMsg(ok ? '✅ บันทึกจุดพักกล้ามเนื้อสำเร็จ' : '⚠️ บันทึกจุดพักกล้ามเนื้อไม่สำเร็จ', ok);
	}

	async function handleCalibrateEmgMvc() {
		const ok = await calibration.calibrateEmgMvc(620);
		flashMsg(ok ? '✅ บันทึกจุดออกแรงสูงสุดสำเร็จ' : '⚠️ บันทึกจุดออกแรงสูงสุดไม่สำเร็จ', ok);
	}

	async function handleCalibrateFsrZero() {
		const ok = await calibration.calibrateFsrZero(10);
		flashMsg(ok ? '✅ บันทึกจุดไม่มีแรงกดสำเร็จ' : '⚠️ บันทึกจุดไม่มีแรงกดไม่สำเร็จ', ok);
	}

	async function handleCalibrateFsrMax() {
		const ok = await calibration.calibrateFsrMax(3950);
		flashMsg(ok ? '✅ บันทึกแรงบีบสูงสุดสำเร็จ' : '⚠️ บันทึกแรงบีบสูงสุดไม่สำเร็จ', ok);
	}
</script>

<div class="mx-auto flex max-w-6xl flex-col gap-6 p-6">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div>
			<h2 class="text-2xl font-black tracking-tight text-foreground">
				5. ปรับเทียบเซนเซอร์ & ตรวจสอบระบบ
			</h2>
			<p class="text-sm text-muted-foreground">
				ปรับเทียบค่าเริ่มต้น (Zero & MVC) ของเซ็นเซอร์แต่ละตัว เพื่อความแม่นยำสูงสุดตามสรีระผู้ใช้
			</p>
		</div>

		{#if calMsg}
			<div
				class={[
					'animate-in fade-in slide-in-from-top-1 rounded-lg border px-4 py-2 text-xs font-bold shadow-md',
					calMsgOk
						? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-400'
						: 'border-red-500/50 bg-red-500/15 text-red-400'
				]}
			>
				{calMsg}
			</div>
		{/if}
	</div>

	<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
		<!-- sEMG Calibration -->
		<div class="rounded-xl border border-border bg-card p-6 shadow-md">
			<span class="text-xs font-bold text-cyan-400 uppercase">เซนเซอร์วัดคลื่นกล้ามเนื้อ</span>
			<h3 class="mt-1 text-lg font-bold text-foreground">1. ปรับเทียบระดับพัก & ระดับออกแรงสูงสุด</h3>
			<p class="mt-2 text-xs text-muted-foreground leading-relaxed">
				บันทึกระดับสัญญาณตอนกล้ามเนื้อพัก และตอนออกแรงเกร็งสุดแรง เพื่อให้ระบบคำนวณ "% การออกแรง" ระหว่างเล่นได้แม่นยำตามร่างกายของคุณ
			</p>

			<div class="mt-4 grid grid-cols-2 gap-4">
				<div class="flex flex-col items-center rounded-lg border border-border bg-background/50 p-4 text-center">
					<span class="text-xs text-muted-foreground">จุดพัก (ผ่อนคลายแขน)</span>
					<div class="my-2 text-xl font-black text-foreground">✓</div>
					<span class="text-[10px] text-muted-foreground/70">ค่าอ้างอิง: {calibration.emgZeroOffsetUv}</span>
					<p class="mt-2 text-[10px] text-muted-foreground leading-relaxed">ผ่อนคลายแขนให้สุด ไม่ออกแรงเลย แล้วกดปุ่ม</p>
					<button
						onclick={handleCalibrateEmgZero}
						class="mt-2 w-full rounded border border-cyan-500/50 bg-card py-1.5 text-xs font-semibold text-cyan-400 hover:bg-cyan-500/10"
					>
						บันทึกจุดพัก
					</button>
				</div>

				<div class="flex flex-col items-center rounded-lg border border-border bg-background/50 p-4 text-center">
					<span class="text-xs text-muted-foreground">จุดออกแรงสูงสุด (เกร็งสุดแรง)</span>
					<div class="my-2 text-xl font-black text-emerald-400">✓</div>
					<span class="text-[10px] text-muted-foreground/70">ค่าอ้างอิง: {calibration.emgMvcPeakUv}</span>
					<p class="mt-2 text-[10px] text-muted-foreground leading-relaxed">เกร็งกล้ามเนื้อให้แรงที่สุดเท่าที่ทำได้ แล้วกดปุ่ม</p>
					<button
						onclick={handleCalibrateEmgMvc}
						class="mt-2 w-full rounded border border-cyan-500/50 bg-card py-1.5 text-xs font-semibold text-cyan-400 hover:bg-cyan-500/10"
					>
						บันทึกจุดออกแรงสูงสุด
					</button>
				</div>
			</div>
		</div>

		<!-- FSR Calibration -->
		<div class="rounded-xl border border-border bg-card p-6 shadow-md">
			<span class="text-xs font-bold text-cyan-400 uppercase">เซนเซอร์วัดแรงบีบมือ</span>
			<h3 class="mt-1 text-lg font-bold text-foreground">2. ปรับเทียบแรงบีบมือ</h3>
			<p class="mt-2 text-xs text-muted-foreground leading-relaxed">
				สอบเทียบแรงกดของมือจับเพื่อตรวจจับการจับหลุด (Grip Slippage) และวัดความสดของกล้ามเนื้อได้แม่นยำขึ้น
			</p>

			<div class="mt-4 grid grid-cols-2 gap-4">
				<div class="flex flex-col items-center rounded-lg border border-border bg-background/50 p-4 text-center">
					<span class="text-xs text-muted-foreground">ไม่มีแรงกด (ปล่อยมือ)</span>
					<div class="my-2 text-xl font-black text-foreground">✓</div>
					<span class="text-[10px] text-muted-foreground/70">ค่าอ้างอิง: {calibration.fsrZeroAdc}</span>
					<p class="mt-2 text-[10px] text-muted-foreground leading-relaxed">ปล่อยมือจากเซนเซอร์ ไม่แตะเลย แล้วกดปุ่ม</p>
					<button
						onclick={handleCalibrateFsrZero}
						class="mt-2 w-full rounded border border-cyan-500/50 bg-card py-1.5 text-xs font-semibold text-cyan-400 hover:bg-cyan-500/10"
					>
						บันทึกจุดไม่มีแรงกด
					</button>
				</div>

				<div class="flex flex-col items-center rounded-lg border border-border bg-background/50 p-4 text-center">
					<span class="text-xs text-muted-foreground">แรงบีบสูงสุด</span>
					<div class="my-2 text-xl font-black text-cyan-400">✓</div>
					<span class="text-[10px] text-muted-foreground/70">ค่าอ้างอิง: {calibration.fsrMaxGripAdc}</span>
					<p class="mt-2 text-[10px] text-muted-foreground leading-relaxed">บีบเซนเซอร์ให้แรงที่สุดเท่าที่ทำได้ แล้วกดปุ่ม</p>
					<button
						onclick={handleCalibrateFsrMax}
						class="mt-2 w-full rounded border border-cyan-500/50 bg-card py-1.5 text-xs font-semibold text-cyan-400 hover:bg-cyan-500/10"
					>
						บันทึกแรงบีบสูงสุด
					</button>
				</div>
			</div>
		</div>

		<!-- MediaPipe Sensitivity -->
		<div class="rounded-xl border border-border bg-card p-6 shadow-md">
			<span class="text-xs font-bold text-cyan-400 uppercase">ความไวของกล้องตรวจจับท่าทาง</span>
			<h3 class="mt-1 text-lg font-bold text-foreground">3. ความไวการตรวจจับท่าทางผิดปกติ</h3>
			<p class="mt-2 text-xs text-muted-foreground leading-relaxed">
				กำหนดเกณฑ์ความอ่อนไหวในการตัดคะแนนเมื่อตรวจพบการใช้แรงเหวี่ยงตัวหรือการยกไหล่ช่วย
			</p>

			<div class="mt-4 flex flex-col gap-4">
				<div class="flex flex-col gap-1.5">
					<div class="flex justify-between text-xs">
						<span class="text-foreground">Torso Swing Angle Limit (มุมเอนตัวสูงสุด):</span>
						<strong class="text-cyan-400">{calibration.torsoAngleLimitDeg}°</strong>
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
					<span class="text-[11px] text-muted-foreground">
						หากเอนตัวเกิน {calibration.torsoAngleLimitDeg}° ระบบจะตัดเป็น Cheated Rep ทันที
					</span>
				</div>

				<div class="flex flex-col gap-1.5">
					<div class="flex justify-between text-xs">
						<span class="text-foreground">Shoulder Hiking Tolerance (ระยะยกไหล่สูงสุด):</span>
						<strong class="text-cyan-400">{calibration.shoulderHikeLimitCm} cm</strong>
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
					<span class="text-[11px] text-muted-foreground">
						หากยกไหล่ขึ้นเกิน {calibration.shoulderHikeLimitCm} ซม. ระบบจะแจ้งเตือนให้กดไหล่ลง
					</span>
				</div>
			</div>
		</div>

		<!-- Diagnostics Table -->
		<div class="rounded-xl border border-border bg-card p-6 shadow-md">
			<span class="text-xs font-bold text-cyan-400 uppercase">สถานะระบบ</span>
			<h3 class="mt-1 text-lg font-bold text-foreground">4. ตรวจสอบสถานะฮาร์ดแวร์</h3>

			<div class="mt-4 overflow-hidden rounded-lg border border-border">
				<table class="w-full text-left text-xs">
					<tbody class="divide-y divide-border">
						<tr class="p-2">
							<td class="p-2.5 text-muted-foreground">Arduino Uno Serial (sEMG + FSR):</td>
							<td class="p-2.5 font-bold text-foreground"
								>{calibration.hardware.unoPort} @ {calibration.hardware.unoBaud} baud</td
							>
						</tr>
						<tr>
							<td class="p-2.5 text-muted-foreground">ESP32 Master Hub IP:</td>
							<td class="p-2.5 font-bold text-foreground">{calibration.hardware.esp32Ip}</td>
						</tr>
						<tr>
							<td class="p-2.5 text-muted-foreground">WebSocket Stream Rate:</td>
							<td class="p-2.5">
								<span class="rounded bg-emerald-500/20 px-2 py-0.5 font-bold text-emerald-400">
									{calibration.hardware.packetRateHz} Hz (OK)
								</span>
							</td>
						</tr>
						<tr>
							<td class="p-2.5 text-muted-foreground">MPU-6050 (I2C 0x68):</td>
							<td class="p-2.5 font-bold text-emerald-400">{calibration.hardware.mpuI2c}</td>
						</tr>
						<tr>
							<td class="p-2.5 text-muted-foreground">MAX30102 (I2C 0x57):</td>
							<td class="p-2.5 font-bold text-emerald-400">{calibration.hardware.max30102I2c}</td>
						</tr>
						<tr>
							<td class="p-2.5 text-muted-foreground">MLX90614 (I2C 0x5A):</td>
							<td class="p-2.5 font-bold text-emerald-400">{calibration.hardware.mlx90614I2c}</td>
						</tr>
						<tr>
							<td class="p-2.5 text-muted-foreground">ESP32 Wi-Fi Signal:</td>
							<td class="p-2.5 font-bold text-foreground">{calibration.hardware.wifiRssi}</td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>
	</div>
</div>

