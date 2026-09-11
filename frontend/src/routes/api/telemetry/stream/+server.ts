import type { RequestHandler } from '@sveltejs/kit';
import { serverTelemetry } from '$lib/server/telemetryStore';

export const GET: RequestHandler = async () => {
	let cleanup: (() => void) | null = null;

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			// Send initial state
			const initialPacket = `event: init\ndata: ${JSON.stringify(serverTelemetry.state)}\n\n`;
			controller.enqueue(encoder.encode(initialPacket));

			// Subscribe to live telemetry
			cleanup = serverTelemetry.subscribe('telemetry', (data) => {
				try {
					const msg = `event: telemetry\ndata: ${JSON.stringify(data)}\n\n`;
					controller.enqueue(encoder.encode(msg));
				} catch (err) {
					// Client disconnected
				}
			});
		},
		cancel() {
			if (cleanup) cleanup();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive'
		}
	});
};
