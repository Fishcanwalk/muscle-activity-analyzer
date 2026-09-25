import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const [{ data: config }, { data: overview }] = await Promise.all([
		event.locals.fastapiClient.GET('/v1/billing/config'),
		event.locals.fastapiClient.GET('/v1/billing/subscription')
	]);
	return { config: config ?? null, overview: overview ?? null };
};
