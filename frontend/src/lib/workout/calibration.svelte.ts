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

	calibrateEmgZero(val = 14) {
		this.emgZeroOffsetUv = val;
	}

	calibrateEmgMvc(val = 580) {
		this.emgMvcPeakUv = val;
	}

	calibrateFsrZero(val = 10) {
		this.fsrZeroAdc = val;
	}

	calibrateFsrMax(val = 3900) {
		this.fsrMaxGripAdc = val;
	}

	setTorsoLimit(deg: number) {
		this.torsoAngleLimitDeg = Number(deg);
	}

	setShoulderLimit(cm: number) {
		this.shoulderHikeLimitCm = Number(cm);
	}
}

export const calibration = new CalibrationManager();
