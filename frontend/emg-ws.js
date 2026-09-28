// WebSocket endpoint for the EMG stream, the one sensor that doesn't go through
// POST /api/telemetry + SSE. Plain JS (not under src/) because it is attached to the raw
// Node http server, outside SvelteKit: by vite.config.ts in dev/preview and by server.js
// in production.
//
//   ws://<host>/ws/emg?role=device  the ESP32 sends text frames of raw ADC samples,
//                                   comma-separated ("2048,2051")
//   ws://<host>/ws/emg              browsers receive JSON: one "init" snapshot, then an
//                                   "emg" message per device frame and an "emgRep" per rep
//
// The EMG math lives in src/lib/server/telemetryStore.ts, reached through the bridge it
// puts on globalThis.__cyberpumpEmg. The device side looks it up on every frame, so a
// module reload in dev (HMR) doesn't leave the board feeding a stale telemetry store.
import { WebSocketServer } from 'ws';

/** @typedef {import('ws').WebSocket} WebSocket */
/** @typedef {import('./src/lib/server/telemetryStore').EmgStreamBridge} EmgStreamBridge */

const PATH = '/ws/emg';
// Same reason as the SSE heartbeat: nginx drops a proxied connection after 60 s of silence.
const HEARTBEAT_MS = 15_000;
// A browser tab that stops reading (backgrounded, slow link) is skipped rather than
// letting its send queue grow without bound.
const MAX_BUFFERED_BYTES = 1_000_000;

/** @returns {EmgStreamBridge | undefined} */
const bridge = () => globalThis.__cyberpumpEmg;

/**
 * @param {import('node:http').Server} httpServer
 * @param {() => Promise<unknown>} [ensureTelemetryLoaded] loads telemetryStore.ts when
 *   nothing has imported it yet (dev: before the first page request)
 */
export function attachEmgWebSocket(httpServer, ensureTelemetryLoaded = async () => {}) {
	const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
	/** Sockets that answered the last ping. */
	const alive = new WeakSet();

	httpServer.on('upgrade', (req, socket, head) => {
		const url = new URL(req.url ?? '/', 'http://localhost');
		// Other upgrades (Vite's HMR socket) belong to someone else: leave them alone.
		if (url.pathname !== PATH) return;
		/** @type {import('node:net').Socket} */ (socket).setNoDelay(true);
		wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, url));
	});

	/** @param {WebSocket} ws @param {URL} url */
	async function onConnection(ws, url) {
		alive.add(ws);
		ws.on('pong', () => alive.add(ws));

		if (!bridge()) await ensureTelemetryLoaded().catch(() => {});
		if (!bridge()) {
			ws.close(1013, 'telemetry not ready');
			return;
		}

		if (url.searchParams.get('role') === 'device') handleDevice(ws);
		else handleViewer(ws);
	}

	const heartbeat = setInterval(() => {
		for (const ws of wss.clients) {
			if (!alive.has(ws)) {
				ws.terminate();
				continue;
			}
			alive.delete(ws);
			ws.ping();
		}
	}, HEARTBEAT_MS);
	httpServer.on('close', () => clearInterval(heartbeat));

	return wss;
}

/** @param {WebSocket} ws */
function handleDevice(ws) {
	ws.on('message', (data) => {
		const raws = String(data).split(',').map(Number).filter(Number.isFinite);
		if (raws.length > 0) bridge()?.ingestEmg(raws);
	});
}

/** @param {WebSocket} ws */
function handleViewer(ws) {
	const store = bridge();
	if (!store) return;

	/** @param {string} type @param {unknown} data */
	const send = (type, data) => {
		if (ws.readyState !== ws.OPEN || ws.bufferedAmount > MAX_BUFFERED_BYTES) return;
		ws.send(JSON.stringify({ type, .../** @type {object} */ (data) }));
	};

	send('init', store.snapshot());
	const offEmg = store.subscribe('emgStream', (data) => send('emg', data));
	const offRep = store.subscribe('emgRep', (data) => send('emgRep', data));
	ws.on('close', () => {
		offEmg();
		offRep();
	});
}
