import { json } from '@sveltejs/kit';
import { auth } from '$lib/server/auth.js';
import { dbUtils } from '$lib/server/database.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ request, cookies }) => {
    try {
        const { username, password } = await request.json();

        if (!username || !password) {
            return json({ error: 'Username and password are required' }, { status: 400 });
        }

        // Get user from database
        const user = await dbUtils.getUserByUsername(username);
        if (!user) {
            return json({ error: 'Invalid credentials' }, { status: 401 });
        }

        // Verify password
        const validPassword = await auth.verifyPassword(password, user.password_hash);
        if (!validPassword) {
            return json({ error: 'Invalid credentials' }, { status: 401 });
        }

        // Create session
        const session = await auth.createSession(user.id.toString());
    		const sessionCookie = auth.lucia.createSessionCookie(session.id);

        cookies.set(sessionCookie.name, sessionCookie.value, {
            path: '.',
            ...sessionCookie.attributes
        });

        return json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                isAdmin: user.is_admin
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};
