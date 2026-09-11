import { redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { loginSchema } from '$lib/schemas/auth.schema';
import { logger, sanitize } from '$lib/logger';
import { setAuthTokens } from '$lib/utils/auth';
import jwt from 'jsonwebtoken';
import { PRESET_USERS } from '$lib/workout/user.svelte';

export const load = (async () => {
	const form = await superValidate(zod4(loginSchema));

	return {
		form,
		presetUsers: Object.values(PRESET_USERS)
	};
}) satisfies PageServerLoad;

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await superValidate(request, zod4(loginSchema));

		if (!form.valid) {
			return { form };
		}

		const email = form.data.email.toLowerCase();
		const user = PRESET_USERS[email] || {
			id: `usr_${Date.now()}`,
			name: email.split('@')[0],
			email,
			level: 'Dedicated Lifter'
		};

		const JWT_SECRET = 'cyberpump-jwt-secret-2026';
		const accessToken = jwt.sign(
			{
				sub: user.id,
				email: user.email,
				name: user.name,
				exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24
			},
			JWT_SECRET
		);

		const refreshToken = jwt.sign(
			{
				sub: user.id,
				email: user.email,
				exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
			},
			JWT_SECRET
		);

		setAuthTokens(cookies, accessToken, refreshToken);
		cookies.set('user_email', user.email, {
			path: '/',
			httpOnly: false,
			maxAge: 60 * 60 * 24 * 7
		});

		logger.info(sanitize({ email: user.email }), 'User logged in successfully');
		return redirect(303, '/dashboard');
	}
};
