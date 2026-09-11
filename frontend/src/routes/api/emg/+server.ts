import { json, type RequestHandler } from '@sveltejs/kit';
import { serverTelemetry, type EmgPacket } from '$lib/server/telemetryStore';

export const GET: RequestHandler = async () => {
	return json({
		status: 'ok',
		device: serverTelemetry.state.device,
		emg: serverTelemetry.state.emg,
		calibration: serverTelemetry.state.calibration
	});
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json() as EmgPacket;
		serverTelemetry.ingestEmg(body);

		return json({
			success: true,
			receivedAt: Date.now(),
			device: serverTelemetry.state.device.board,
			rms: serverTelemetry.state.emg.rms
		});
	} catch (err: any) {
		return json({ success: false, error: err?.message || 'Invalid JSON' }, { status: 400 });
	}
};
