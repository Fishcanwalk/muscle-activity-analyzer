import { error, json, type RequestHandler } from '@sveltejs/kit';
import { serverTelemetry } from '$lib/server/telemetryStore';

// Asks the board to beep, so the buzzer wiring can be checked from the calibration page.
export const POST: RequestHandler = async (event) => {
	const { data: apiUser } = await event.locals.fastapiClient.GET('/users/me');
	if (!apiUser) throw error(401, 'Not authenticated');
	serverTelemetry.requestBuzzerTest();
	return json({ success: true });
};
