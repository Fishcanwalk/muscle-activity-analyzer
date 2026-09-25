import { error, json, type RequestHandler } from '@sveltejs/kit';
import { serverTelemetry } from '$lib/server/telemetryStore';
import type { components } from '$lib/api/paths/fastapi';

type CalibrationCreate = components['schemas']['CalibrationCreate'];

const OPTIONAL_NUMBER_FIELDS = ['emgRepOnPct', 'emgRepOffPct', 'emgRepPeakPct'] as const;

// The rep thresholds are optional (the backend fills in defaults when omitted).
function parseCalibrationCreate(body: unknown): Partial<CalibrationCreate> | null {
	if (!body || typeof body !== 'object') return null;
	const b = body as Record<string, unknown>;
	const required = ['emgBaseline', 'emgMvc', 'fsrZero', 'fsrMax'] as const;
	if (!required.every((k) => typeof b[k] === 'number')) return null;
	if (!OPTIONAL_NUMBER_FIELDS.every((k) => b[k] === undefined || typeof b[k] === 'number')) {
		return null;
	}
	const parsed: Record<string, number> = {};
	for (const k of [...required, ...OPTIONAL_NUMBER_FIELDS]) {
		if (typeof b[k] === 'number') parsed[k] = b[k];
	}
	return parsed;
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

	const parsed = parseCalibrationCreate(body);
	if (!parsed) {
		return json(
			{
				success: false,
				error:
					'Body must be { emgBaseline, emgMvc, fsrZero, fsrMax } (numbers), optionally with emgRepOnPct/emgRepOffPct/emgRepPeakPct'
			},
			{ status: 400 }
		);
	}

	const { data, error: calError } = await event.locals.fastapiClient.POST('/v1/calibration', {
		// Required fields were checked above; the backend defaults any omitted thresholds.
		body: parsed as CalibrationCreate
	});
	if (calError || !data) {
		return json({ success: false, error: 'Failed to persist calibration' }, { status: 502 });
	}

	serverTelemetry.setCalibration(data);
	return json({ success: true, updated: data });
};
