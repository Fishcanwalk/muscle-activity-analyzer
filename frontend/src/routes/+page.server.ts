import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// The root route used to render WorkoutDashboard directly against the old mock
// `userManager`/`PRESET_USERS` identity (no auth, no real user). Now that
// WorkoutDashboard requires a real logged-in user, the canonical entry point is
// the auth-gated `(auth)/home` route (see routes/(auth)/home/+page.server.ts),
// which resolves the real user via GET /users/me. `handleAuthGuard` in
// hooks.server.ts will redirect on to /login first if not authenticated.
export const load: PageServerLoad = async () => {
	throw redirect(307, '/home');
};
