import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { handleFastApiClient } from '$lib/hooks/fastapi.hook';
import { handleAuthGuard } from '$lib/hooks/auth-guard';
// Loaded at startup, not on the first telemetry request: it registers the bridge the
// EMG WebSocket (emg-ws.js) uses, and the board may connect before anyone opens a page.
import '$lib/server/telemetryStore';

export const handle: Handle = sequence(handleAuthGuard, handleFastApiClient);
