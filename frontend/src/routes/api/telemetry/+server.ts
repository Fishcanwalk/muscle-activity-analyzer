import { json, type RequestHandler } from '@sveltejs/kit';
import { serverTelemetry, type FullTelemetryPacket } from '$lib/server/telemetryStore';

export const GET: RequestHandler = async () => {
	return json({
		status: 'ok',
		timestamp: Date.now(),
		telemetry: serverTelemetry.state
	});
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json() as FullTelemetryPacket;
		serverTelemetry.ingestFullTelemetry(body);

		return json({
			success: true,
			receivedAt: Date.now(),
			packetCount: serverTelemetry.state.device.packetCount,
			rateHz: serverTelemetry.state.device.rateHz
		});
	} catch (err: any) {
		return json({ success: false, error: err?.message || 'Invalid JSON' }, { status: 400 });
	}
};
