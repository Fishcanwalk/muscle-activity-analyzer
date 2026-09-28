// Production entry point (replaces adapter-node's default `node build`): the same
// SvelteKit handler, on an http server that also carries the EMG WebSocket (emg-ws.js).
import { createServer } from 'node:http';
import { handler } from './build/handler.js';
import { attachEmgWebSocket } from './emg-ws.js';

const host = process.env.HOST ?? '0.0.0.0';
const port = Number(process.env.PORT ?? 3000);

const server = createServer(handler);
// See vite.config.ts's tcpNoDelay: Nagle + the ESP32's delayed ACK stall small replies.
server.on('connection', (socket) => socket.setNoDelay(true));
// Importing handler.js has already run hooks.server.ts, which loads telemetryStore.ts.
attachEmgWebSocket(server);

server.listen(port, host, () => {
	console.log(`Listening on http://${host}:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
	process.on(signal, () => server.close(() => process.exit(0)));
}
