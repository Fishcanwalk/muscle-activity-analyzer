import type { PageServerLoad, Actions } from './$types';
import { PRESET_USERS, type UserProfile } from '$lib/workout/user.svelte';

export const load: PageServerLoad = async ({ cookies }) => {
	const userEmail = cookies.get('user_email') || 'nont@cyberpump.io';
	const user: UserProfile = PRESET_USERS[userEmail] || PRESET_USERS['nont@cyberpump.io'];

	return {
		user,
		presetUsers: Object.values(PRESET_USERS)
	};
};

export const actions: Actions = {
	switchUser: async ({ request, cookies }) => {
		const data = await request.formData();
		const email = data.get('email')?.toString() || 'nont@cyberpump.io';
		cookies.set('user_email', email, {
			path: '/',
			httpOnly: false,
			maxAge: 60 * 60 * 24 * 7
		});
		return { success: true, email };
	}
};
