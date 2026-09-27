import type { RequestHandler } from '@sveltejs/kit';
import { serverTelemetry } from '$lib/server/telemetryStore';

// Reverse proxies drop a response that has been silent for a while (nginx's
// proxy_read_timeout defaults to 60 s), and the stream is silent whenever no board is
// posting to this server. A comment line every 15 s keeps the connection alive; the
// browser's EventSource ignores it.
const HEARTBEAT_MS = 15_000;

export const GET: RequestHandler = async () => {
	let cleanup: (() => void) | null = null;

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			// Send initial state
			const initialPacket = `event: init\ndata: ${JSON.stringify(serverTelemetry.state)}\n\n`;
			controller.enqueue(encoder.encode(initialPacket));

			// Subscribe to live telemetry
			const cleanupTelemetry = serverTelemetry.subscribe('telemetry', (data) => {
				try {
					const msg = `event: telemetry\ndata: ${JSON.stringify(data)}\n\n`;
					controller.enqueue(encoder.encode(msg));
				} catch (err) {
					// Client disconnected
				}
			});

			// Discrete button-press events (ESP32 GPIO32/33) -- see telemetryStore.ts ingestFullTelemetry
			const cleanupButton = serverTelemetry.subscribe('button', (data) => {
				try {
					const msg = `event: button\ndata: ${JSON.stringify(data)}\n\n`;
					controller.enqueue(encoder.encode(msg));
				} catch {
					// Client disconnected
				}
			});

			// One event per rep counted by the server-side EMG detector (emgRepDetector.ts)
			const cleanupEmgRep = serverTelemetry.subscribe('emgRep', (data) => {
				try {
					const msg = `event: emgRep\ndata: ${JSON.stringify(data)}\n\n`;
					controller.enqueue(encoder.encode(msg));
				} catch {
					// Client disconnected
				}
			});

			const heartbeat = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(': ping\n\n'));
				} catch {
					cleanup?.(); // client gone
				}
			}, HEARTBEAT_MS);

			cleanup = () => {
				clearInterval(heartbeat);
				cleanupTelemetry();
				cleanupButton();
				cleanupEmgRep();
			};
		},
		cancel() {
			if (cleanup) cleanup();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			'Connection': 'keep-alive',
			// Tells nginx not to buffer this response, so events go out as they happen.
			'X-Accel-Buffering': 'no'
		}
	});
};
