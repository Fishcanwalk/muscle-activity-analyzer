/**
 * Formats a number to at most 3 decimal places (omits redundant trailing zeros).
 * e.g., 0.123456 -> "0.123", 12.5 -> "12.5", 72 -> "72"
 */
export function formatDec(val: number | string | null | undefined, maxDecimals = 3): string {
	if (val === null || val === undefined || val === '') return '0';
	const num = typeof val === 'number' ? val : parseFloat(String(val));
	if (isNaN(num)) return '0';
	return Number(num.toFixed(maxDecimals)).toString();
}

/**
 * Rounds a number to at most 3 decimal places as a number.
 * e.g., 0.123456 -> 0.123
 */
export function round3(val: number | null | undefined): number {
	if (val === null || val === undefined || isNaN(val)) return 0;
	return Math.round(val * 1000) / 1000;
}

/** Standard gravity, used to convert sensor force readings (Newtons) into the
 * kilograms-force that gym users actually think in. */
const STANDARD_GRAVITY = 9.80665;

/**
 * Converts a force reading in Newtons to kilograms-force (kgf), the unit
 * people recognize from weight plates and grip dynamometers.
 * e.g., 98.0665 N -> 10 kg
 */
export function nToKg(newtons: number | null | undefined): number {
	if (newtons === null || newtons === undefined || isNaN(newtons)) return 0;
	return newtons / STANDARD_GRAVITY;
}
