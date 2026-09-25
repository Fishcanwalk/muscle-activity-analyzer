import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Mirrors dashboard/+page.server.ts's auth pattern: resolve the real logged-in user
// via /users/me and pass it straight through as page data. WorkoutDashboard.svelte /
// WorkoutHeader.svelte consume `data.user` to show a real name/email in the Live
// Studio header. No saved calibration is loaded: every session is calibrated afresh
// (see calibration.svelte.ts).
export const load: PageServerLoad = async (event) => {
	const { data: apiUser, error: userError } = await event.locals.fastapiClient.GET('/users/me');
	if (userError || !apiUser) {
		throw error(401, 'Not authenticated');
	}

	return { user: apiUser };
};
