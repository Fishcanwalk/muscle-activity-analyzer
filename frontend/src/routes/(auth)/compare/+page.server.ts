import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { data: users } = await event.locals.fastapiClient.GET('/v1/users');
	return { users: users ?? null };
};
