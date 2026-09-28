import devtoolsJson from 'vite-plugin-devtools-json';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { sveltePhosphorOptimize } from 'phosphor-svelte/vite';
import { defineConfig, type Plugin } from 'vite';

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

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), devtoolsJson(), sveltePhosphorOptimize(), tcpNoDelay()],
	ssr: {
		noExternal: ['phosphor-svelte']
	}
});
