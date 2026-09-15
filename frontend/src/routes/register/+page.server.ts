import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { registerSchema } from '$lib/schemas/auth.schema';
import { logger, sanitize } from '$lib/logger';
import { setAuthTokens } from '$lib/utils/auth';

export const load = (async () => {
	const form = await superValidate(zod4(registerSchema));

	return { form };
}) satisfies PageServerLoad;

export const actions: Actions = {
	default: async (event) => {
		const { request, cookies } = event;
		const form = await superValidate(request, zod4(registerSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		const { name, email, password } = form.data;

		try {
			const { data, error, response } = await event.locals.fastapiClient.POST('/v1/auth/register', {
				body: { name, email, password }
			});

			if (error || !data) {
				const detail = error?.detail?.[0]?.msg;
				logger.warn(sanitize({ email, status: response.status }), 'Registration failed');
				return message(
					form,
					{
						type: 'error',
						text: detail
							? `Registration failed: ${detail}`
							: 'Registration failed. Please try again.'
					},
					{ status: response.status === 422 ? 422 : 400 }
				);
			}

			setAuthTokens(cookies, data.access_token, data.refresh_token);
			cookies.set('user_email', email, {
				path: '/',
				httpOnly: false,
				maxAge: 60 * 60 * 24 * 7
			});

			logger.info(sanitize({ email }), 'User registered successfully');
		} catch (err) {
			logger.error({ err }, 'Registration request failed');
			return message(
				form,
				{ type: 'error', text: 'Registration failed: could not reach the server.' },
				{ status: 502 }
			);
		}

		return redirect(303, '/dashboard');
	}
};
