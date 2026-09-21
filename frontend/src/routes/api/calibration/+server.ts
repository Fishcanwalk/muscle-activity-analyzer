import { error, json, type RequestHandler } from '@sveltejs/kit';
import { serverTelemetry } from '$lib/server/telemetryStore';
import type { components } from '$lib/api/paths/fastapi';

type CalibrationCreate = components['schemas']['CalibrationCreate'];

function isCalibrationCreate(body: unknown): body is CalibrationCreate {
	if (!body || typeof body !== 'object') return false;
	const b = body as Record<string, unknown>;
	return (
		typeof b.emgBaseline === 'number' &&
		typeof b.emgMvc === 'number' &&
		typeof b.fsrZero === 'number' &&
		typeof b.fsrMax === 'number'
	);
}

// Authenticated proxy to backend `/v1/calibration` (per-user, persisted in Mongo).
// The old unauthenticated write straight to the shared telemetryStore singleton has
// been removed entirely -- no fallback (per the plan's decision 3: keeping that path
// would let it silently stomp a real user's calibration). Every successful GET/POST
// here also mirrors the values into serverTelemetry's in-memory cache so the always-on
// live SSE view / raw-sample unit conversion stays in sync with the backend's copy --
// see the NOTE above ServerTelemetryState.setCalibration().
async function resolveUser(event: Parameters<RequestHandler>[0]) {
	const { data: apiUser, error: userError } = await event.locals.fastapiClient.GET('/users/me');
	if (userError || !apiUser) {
		throw error(401, 'Not authenticated');
	}
	return apiUser;
}

export const GET: RequestHandler = async (event) => {
	await resolveUser(event);

	const { data, error: calError } = await event.locals.fastapiClient.GET('/v1/calibration');
	if (calError || !data) {
		throw error(502, 'Failed to fetch calibration from backend');
	}

	serverTelemetry.setCalibration(data);
	return json({ status: 'ok', calibration: data });
};

export const POST: RequestHandler = async (event) => {
	await resolveUser(event);

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ success: false, error: 'Invalid JSON' }, { status: 400 });
	}

	if (!isCalibrationCreate(body)) {
		return json(
			{ success: false, error: 'Body must be { emgBaseline, emgMvc, fsrZero, fsrMax } (numbers)' },
			{ status: 400 }
		);
	}

	const { data, error: calError } = await event.locals.fastapiClient.POST('/v1/calibration', {
		body
	});
	if (calError || !data) {
		return json({ success: false, error: 'Failed to persist calibration' }, { status: 502 });
	}

	serverTelemetry.setCalibration(data);
	return json({ success: true, updated: data });
};
