import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { serverTelemetry } from '$lib/server/telemetryStore';
import { isDefaultCalibration } from '$lib/workout/metrics';

// Mirrors dashboard/+page.server.ts's auth pattern: resolve the real logged-in user
// via /users/me and pass it straight through as page data. WorkoutDashboard.svelte /
// WorkoutHeader.svelte consume `data.user` to show a real name/email in the Live
// Studio header.
export const load: PageServerLoad = async (event) => {
	const { data: apiUser, error: userError } = await event.locals.fastapiClient.GET('/users/me');
	if (userError || !apiUser) {
		throw error(401, 'Not authenticated');
	}

	// Also refresh the server-side calibration cache that converts incoming ESP32
	// samples (see telemetryStore.ts setCalibration). Without this, after a server
	// restart it stays on hardcoded defaults until someone opens the calibration tab.
	const { data: calibration } = await event.locals.fastapiClient.GET('/v1/calibration');
	if (calibration) serverTelemetry.setCalibration(calibration);

	return {
		user: apiUser,
		calibration: calibration
			? {
					emgBaseline: calibration.emgBaseline,
					emgMvc: calibration.emgMvc,
					fsrZero: calibration.fsrZero,
					fsrMax: calibration.fsrMax,
					emgRepOnPct: calibration.emgRepOnPct,
					emgRepOffPct: calibration.emgRepOffPct,
					emgRepPeakPct: calibration.emgRepPeakPct
				}
			: null,
		isCalibrated: calibration ? !isDefaultCalibration(calibration) : true
	};
};
