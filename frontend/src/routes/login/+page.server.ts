import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { loginSchema } from '$lib/schemas/auth.schema';
import { logger, sanitize } from '$lib/logger';
import { setAuthTokens } from '$lib/utils/auth';
import { PRESET_USERS } from '$lib/workout/user.svelte';

export const load = (async () => {
	const form = await superValidate(zod4(loginSchema));

	return {
		form,
		presetUsers: Object.values(PRESET_USERS)
	};
}) satisfies PageServerLoad;

export const actions: Actions = {
	default: async (event) => {
		const { request, cookies } = event;
		const form = await superValidate(request, zod4(loginSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		const email = form.data.email.toLowerCase();
		const password = form.data.password;
		const rememberMe = form.data.rememberMe ?? false;

		try {
			const { data, error, response } = await event.locals.fastapiClient.POST('/v1/auth/login', {
				body: { email, password, remember_me: rememberMe }
			});

			if (error || !data) {
				const detail = error?.detail?.[0]?.msg;
				logger.warn(sanitize({ email, status: response.status }), 'Login failed');
				return message(
					form,
					{
						type: 'error',
						text:
							response.status === 401
								? 'Invalid email or password'
								: detail
									? `Login failed: ${detail}`
									: 'Login failed. Please try again.'
					},
					{ status: response.status === 422 ? 422 : response.status === 401 ? 401 : 400 }
				);
			}

			setAuthTokens(cookies, data.access_token, data.refresh_token);
			cookies.set('user_email', email, {
				path: '/',
				httpOnly: false,
				maxAge: 60 * 60 * 24 * 7
			});

			logger.info(sanitize({ email }), 'User logged in successfully');
		} catch (err) {
			logger.error({ err }, 'Login request failed');
			return message(
				form,
				{ type: 'error', text: 'Login failed: could not reach the server.' },
				{ status: 502 }
			);
		}

		return redirect(303, '/dashboard');
	}
};
