class CalibrationManager {
	emgZeroOffsetUv = $state(14);
	emgMvcPeakUv = $state(580);

	fsrZeroAdc = $state(12);
	fsrMaxGripAdc = $state(3850);

	mpuZeroPitchOffset = $state(0.0);
	mpuZeroRollOffset = $state(0.0);

	torsoAngleLimitDeg = $state(8.0);
	shoulderHikeLimitCm = $state(3.0);

	hardware = $state({
		unoPort: 'COM3 / dev/ttyUSB0',
		unoBaud: 57600,
		esp32Ip: '192.168.1.105',
		wsPort: 8000,
		packetRateHz: 50,
		mpuI2c: '0x68 (OK)',
		max30102I2c: '0x57 (OK)',
		mlx90614I2c: '0x5A (OK)',
		wifiRssi: '-58 dBm (Strong)'
	});

	private async postCalibration(body: Record<string, number>): Promise<boolean> {
		try {
			const res = await fetch('/api/calibration', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			return res.ok;
		} catch {
			// Server unreachable (e.g. offline dev preview); keep the local value so the UI still works.
			return false;
		}
	}

	async loadFromServer() {
		try {
			const res = await fetch('/api/calibration');
			if (!res.ok) return;
			const { calibration: cal } = await res.json();
			if (!cal) return;
			this.emgZeroOffsetUv = cal.emgBaseline;
			this.emgMvcPeakUv = cal.emgMvc;
			this.fsrZeroAdc = cal.fsrZero;
			this.fsrMaxGripAdc = cal.fsrMax;
		} catch {
			// Keep local defaults if the server can't be reached.
		}
	}

	private postCurrentCalibration() {
		return this.postCalibration({
			emgBaseline: this.emgZeroOffsetUv,
			emgMvc: this.emgMvcPeakUv,
			fsrZero: this.fsrZeroAdc,
			fsrMax: this.fsrMaxGripAdc
		});
	}

	calibrateEmgZero(val = 14) {
		this.emgZeroOffsetUv = val;
		return this.postCurrentCalibration();
	}

	calibrateEmgMvc(val = 580) {
		this.emgMvcPeakUv = val;
		return this.postCurrentCalibration();
	}

	calibrateFsrZero(val = 10) {
		this.fsrZeroAdc = val;
		return this.postCurrentCalibration();
	}

	calibrateFsrMax(val = 3900) {
		this.fsrMaxGripAdc = val;
		return this.postCurrentCalibration();
	}

	setTorsoLimit(deg: number) {
		this.torsoAngleLimitDeg = Number(deg);
	}

	setShoulderLimit(cm: number) {
		this.shoulderHikeLimitCm = Number(cm);
	}
}

export const calibration = new CalibrationManager();
