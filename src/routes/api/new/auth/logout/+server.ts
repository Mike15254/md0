import { json, type RequestEvent } from '@sveltejs/kit';
import { lucia } from '$lib/service/auth.js';

export const POST = async ({ locals, cookies }: RequestEvent) => {
	try {
		if (!locals.session) {
			return json({ error: 'Not authenticated' }, { status: 401 });
		}

		await lucia.invalidateSession(locals.session.id);
		const sessionCookie = lucia.createBlankSessionCookie();

		cookies.set(sessionCookie.name, sessionCookie.value, {
			path: '.',
			...sessionCookie.attributes
		});

		return json({ success: true });
	} catch (error) {
		console.error('Logout error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
