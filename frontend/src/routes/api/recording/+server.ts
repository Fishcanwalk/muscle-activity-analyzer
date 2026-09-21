import { error, json, type RequestHandler } from '@sveltejs/kit';
import { serverTelemetry } from '$lib/server/telemetryStore';

type RecordingAction = 'start' | 'stop';

interface RecordingRequestBody {
	action: RecordingAction;
	sessionId: string;
}

function isRecordingRequestBody(body: unknown): body is RecordingRequestBody {
	if (!body || typeof body !== 'object') return false;
	const b = body as Record<string, unknown>;
	return (b.action === 'start' || b.action === 'stop') && typeof b.sessionId === 'string';
}

// Frozen contract (see plan): POST { action: 'start' | 'stop', sessionId }.
// Resolves the real user via event.locals.fastapiClient (401 if unauthenticated).
// start: 409 if a *different* user's recording is already active.
// stop: no-op if already clear or owned by someone else.
export const POST: RequestHandler = async (event) => {
	const { data: apiUser, error: userError } = await event.locals.fastapiClient.GET('/users/me');
	if (userError || !apiUser) {
		throw error(401, 'Not authenticated');
	}

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}

	if (!isRecordingRequestBody(body)) {
		throw error(400, "Body must be { action: 'start' | 'stop', sessionId: string }");
	}

	if (body.action === 'start') {
		const result = serverTelemetry.startRecording(apiUser.id, body.sessionId);
		if (!result.ok) {
			throw error(409, 'A recording for a different user is already active');
		}
		return json({ ok: true, action: 'start', sessionId: body.sessionId });
	}

	serverTelemetry.stopRecording(apiUser.id);
	return json({ ok: true, action: 'stop', sessionId: body.sessionId });
};
