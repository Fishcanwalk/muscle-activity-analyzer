import { json, type RequestHandler } from '@sveltejs/kit';
import { serverTelemetry } from '$lib/server/telemetryStore';

export const GET: RequestHandler = async () => {
	return json({
		status: 'ok',
		calibration: serverTelemetry.state.calibration
	});
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		serverTelemetry.setCalibration(body);
		return json({
			success: true,
			updated: serverTelemetry.state.calibration
		});
	} catch (err: any) {
		return json({ success: false, error: err?.message || 'Invalid JSON' }, { status: 400 });
	}
};
