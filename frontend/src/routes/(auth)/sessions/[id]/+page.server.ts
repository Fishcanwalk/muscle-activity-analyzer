import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// `id` is a session's id as groupSetsIntoSessions() builds it: its session_id, or for an
// older set saved without one, that set's own id (it is a one-set session).
export const load: PageServerLoad = async (event) => {
	const client = event.locals.fastapiClient;
	const id = event.params.id;

	const [bySession, comparison] = await Promise.all([
		client.GET('/v1/sessions', { params: { query: { session_id: id, limit: 200 } } }),
		// Only for the previous session; 404s for a set without a session_id, which is fine.
		client.GET('/v1/sessions/{session_id}/comparison', { params: { path: { session_id: id } } })
	]);

	let sets = bySession.data ?? [];
	if (sets.length === 0) {
		const recent = await client.GET('/v1/sessions', { params: { query: { limit: 200 } } });
		sets = (recent.data ?? []).filter((s) => !s.session_id && s.id === id);
	}
	if (sets.length === 0) throw error(404, 'ไม่พบ session นี้ หรือเก่ากว่าช่วงประวัติที่แพ็กเกจของคุณดูได้');

	return { sets, previous: comparison.data?.previous ?? [] };
};
