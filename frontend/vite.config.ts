import devtoolsJson from 'vite-plugin-devtools-json';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { sveltePhosphorOptimize } from 'phosphor-svelte/vite';
import { defineConfig, type Plugin } from 'vite';
import type { Server as HttpServer } from 'node:http';
import { attachEmgWebSocket } from './emg-ws.js';

// Node's http server leaves Nagle's algorithm on for accepted sockets. Combined with the
// ESP32's delayed-ACK timer (lwIP's TCP fast timer defaults to a 250ms tick), that stalls
// every telemetry POST response by up to ~250ms. Disabling Nagle on the server side removes
// that stall regardless of what the client does.
function tcpNoDelay(): Plugin {
	return {
		name: 'tcp-no-delay',
		configureServer(server) {
			server.httpServer?.on('connection', (socket) => socket.setNoDelay(true));
		},
		configurePreviewServer(server) {
			server.httpServer?.on('connection', (socket) => socket.setNoDelay(true));
		}
	};
}

// The EMG WebSocket (emg-ws.js) on the dev/preview server; production gets it from server.js.
function emgWebSocket(): Plugin {
	return {
		name: 'emg-websocket',
		configureServer(server) {
			if (!server.httpServer) return;
			attachEmgWebSocket(server.httpServer as HttpServer, () =>
				server.ssrLoadModule('/src/lib/server/telemetryStore.ts')
			);
		},
		configurePreviewServer(server) {
			attachEmgWebSocket(server.httpServer as HttpServer);
		}
	};
}

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		devtoolsJson(),
		sveltePhosphorOptimize(),
		tcpNoDelay(),
		emgWebSocket()
	],
	ssr: {
		noExternal: ['phosphor-svelte']
	}
});
