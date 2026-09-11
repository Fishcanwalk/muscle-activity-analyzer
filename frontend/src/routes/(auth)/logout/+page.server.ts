import { redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { clearCookieTokens } from '$lib/utils/auth';

export const load: PageServerLoad = async ({ cookies }) => {
	clearCookieTokens(cookies);
	cookies.delete('user_email', { path: '/' });
	throw redirect(303, '/login');
};

export const actions: Actions = {
	default: async ({ cookies }) => {
		clearCookieTokens(cookies);
		cookies.delete('user_email', { path: '/' });
		throw redirect(303, '/login');
	}
};
