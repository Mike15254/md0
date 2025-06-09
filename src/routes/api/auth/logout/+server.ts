import { json } from '@sveltejs/kit';
import { auth } from '$lib/server/auth.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ locals, cookies }) => {
    try {
        if (!locals.session) {
            return json({ error: 'Not authenticated' }, { status: 401 });
        }

        await auth.invalidateSession(locals.session.id);

    		const sessionCookie = auth.lucia.createBlankSessionCookie();
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
