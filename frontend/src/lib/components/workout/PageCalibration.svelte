<script lang="ts">
	import { calibration } from '$lib/workout/calibration.svelte';
	import { telemetry } from '$lib/workout/telemetry.svelte';
	import { CheckCircle2, Sliders, Cpu, Activity } from 'lucide-svelte';

	let calMsg = $state('');

	function flashMsg(msg: string) {
		calMsg = msg;
		setTimeout(() => {
			calMsg = '';
		}, 3000);
	}

	function handleCalibrateEmgZero() {
		calibration.calibrateEmgZero(telemetry.emg.rms || 14);
		flashMsg('✅ บันทึก sEMG Rest Baseline สำเร็จ');
	}

	function handleCalibrateEmgMvc() {
		calibration.calibrateEmgMvc(620);
		flashMsg('✅ บันทึก sEMG MVC Peak สำเร็จ (620 µV)');
	}

	function handleCalibrateFsrZero() {
		calibration.calibrateFsrZero(10);
		flashMsg('✅ ตั้งค่า FSR Zero Load สำเร็จ');
	}

	function handleCalibrateFsrMax() {
		calibration.calibrateFsrMax(3950);
		flashMsg('✅ บันทึก FSR Max Grip Strength สำเร็จ');
	}
</script>

<div class="mx-auto flex max-w-6xl flex-col gap-6 p-6">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div>
			<h2 class="text-2xl font-black tracking-tight text-foreground">
				5. Sensor Calibration & System Diagnostics
			</h2>
			<p class="text-sm text-muted-foreground">
				ปรับเทียบค่าเริ่มต้น (Zero & MVC) ของเซ็นเซอร์แต่ละตัว เพื่อความแม่นยำสูงสุดตามสรีระผู้ใช้
			</p>
		</div>

		{#if calMsg}
			<div
				class="animate-in fade-in slide-in-from-top-1 rounded-lg border border-emerald-500/50 bg-emerald-500/15 px-4 py-2 text-xs font-bold text-emerald-400 shadow-md"
			>
				{calMsg}
			</div>
		{/if}
	</div>

	<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
		<!-- sEMG Calibration -->
		<div class="rounded-xl border border-border bg-card p-6 shadow-md">
			<span class="text-xs font-bold text-cyan-400 uppercase">sEMG Sensor (Arduino Uno A0)</span>
			<h3 class="mt-1 text-lg font-bold text-foreground">1. sEMG Baseline & MVC Calibration</h3>
			<p class="mt-2 text-xs text-muted-foreground leading-relaxed">
				ตั้งค่าจุดพักกล้ามเนื้อ (Rest Baseline) และแรงเกร็งสูงสุด (Maximum Voluntary Contraction: MVC) เพื่อคำนวณ % การสั่งการกล้ามเนื้อ (Recruitment Rate)
			</p>

			<div class="mt-4 grid grid-cols-2 gap-4">
				<div class="flex flex-col items-center rounded-lg border border-border bg-background/50 p-4 text-center">
					<span class="text-xs text-muted-foreground">Rest Baseline (พักแขน)</span>
					<div class="my-2 text-xl font-black text-foreground">
						{calibration.emgZeroOffsetUv} <span class="text-xs font-normal">µV</span>
					</div>
					<button
						onclick={handleCalibrateEmgZero}
						class="w-full rounded border border-cyan-500/50 bg-card py-1.5 text-xs font-semibold text-cyan-400 hover:bg-cyan-500/10"
					>
						Calibrate Zero
					</button>
				</div>

				<div class="flex flex-col items-center rounded-lg border border-border bg-background/50 p-4 text-center">
					<span class="text-xs text-muted-foreground">Peak MVC (เกร็งสุดแรง)</span>
					<div class="my-2 text-xl font-black text-emerald-400">
						{calibration.emgMvcPeakUv} <span class="text-xs font-normal">µV</span>
					</div>
					<button
						onclick={handleCalibrateEmgMvc}
						class="w-full rounded border border-cyan-500/50 bg-card py-1.5 text-xs font-semibold text-cyan-400 hover:bg-cyan-500/10"
					>
						Calibrate MVC
					</button>
				</div>
			</div>
		</div>

		<!-- FSR Calibration -->
		<div class="rounded-xl border border-border bg-card p-6 shadow-md">
			<span class="text-xs font-bold text-cyan-400 uppercase">FSR Resistor (Arduino Uno A2)</span>
			<h3 class="mt-1 text-lg font-bold text-foreground">2. FSR Grip Thresholds</h3>
			<p class="mt-2 text-xs text-muted-foreground leading-relaxed">
				สอบเทียบแรงกดของมือจับเพื่อตรวจจับ Grip Slippage และคำนวณ CNS Freshness ได้อย่างแม่นยำ
			</p>

			<div class="mt-4 grid grid-cols-2 gap-4">
				<div class="flex flex-col items-center rounded-lg border border-border bg-background/50 p-4 text-center">
					<span class="text-xs text-muted-foreground">Zero Load (ปล่อยมือ)</span>
					<div class="my-2 text-xl font-black text-foreground">
						{calibration.fsrZeroAdc} <span class="text-xs font-normal">ADC</span>
					</div>
					<button
						onclick={handleCalibrateFsrZero}
						class="w-full rounded border border-cyan-500/50 bg-card py-1.5 text-xs font-semibold text-cyan-400 hover:bg-cyan-500/10"
					>
						Set Zero ADC
					</button>
				</div>

				<div class="flex flex-col items-center rounded-lg border border-border bg-background/50 p-4 text-center">
					<span class="text-xs text-muted-foreground">Max Grip ADC</span>
					<div class="my-2 text-xl font-black text-cyan-400">
						{calibration.fsrMaxGripAdc} <span class="text-xs font-normal">ADC</span>
					</div>
					<button
						onclick={handleCalibrateFsrMax}
						class="w-full rounded border border-cyan-500/50 bg-card py-1.5 text-xs font-semibold text-cyan-400 hover:bg-cyan-500/10"
					>
						Set Max ADC
					</button>
				</div>
			</div>
		</div>

		<!-- MediaPipe Sensitivity -->
		<div class="rounded-xl border border-border bg-card p-6 shadow-md">
			<span class="text-xs font-bold text-cyan-400 uppercase">Computer Vision Parameters</span>
			<h3 class="mt-1 text-lg font-bold text-foreground">3. MediaPipe Anti-Cheat Sensitivity</h3>
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
			<span class="text-xs font-bold text-cyan-400 uppercase">System Architecture Status</span>
			<h3 class="mt-1 text-lg font-bold text-foreground">4. Dual-MCU & Sensor Diagnostics</h3>

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

