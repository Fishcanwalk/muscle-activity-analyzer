import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const client = event.locals.fastapiClient;
	const { data: me } = await client.GET('/users/me');
	if (!me) throw error(401, 'Not authenticated');
	if (event.params.userId === me.id) throw redirect(303, '/compare');

	// Both sides come from the same endpoint so they cover the same history span.
	const [mine, theirs] = await Promise.all([
		client.GET('/v1/users/{user_id}/performance', { params: { path: { user_id: me.id } } }),
		client.GET('/v1/users/{user_id}/performance', {
			params: { path: { user_id: event.params.userId } }
		})
	]);
	if (!theirs.data) throw error(404, 'ไม่พบผู้ใช้นี้');
	if (!mine.data) throw error(502, 'โหลดข้อมูลการฝึกของคุณไม่สำเร็จ');

	return { me: mine.data, them: theirs.data };
};
