import { json } from '@sveltejs/kit';
import { auth } from '$lib/server/auth.js';
import { dbUtils } from '$lib/server/database.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ request, locals }) => {
    try {
        // Only admin users can register new users
        if (!locals.user || !locals.user.isAdmin) {
            return json({ error: 'Admin access required' }, { status: 403 });
        }

        const { username, password, email } = await request.json();

        if (!username || !password) {
            return json({ error: 'Username and password are required' }, { status: 400 });
        }

        if (username.length < 3 || username.length > 50) {
            return json({ error: 'Username must be between 3 and 50 characters' }, { status: 400 });
        }

        if (password.length < 6) {
            return json({ error: 'Password must be at least 6 characters' }, { status: 400 });
        }

        // Check if user already exists
        const existingUser = await dbUtils.getUserByUsername(username);
        if (existingUser) {
            return json({ error: 'Username already exists' }, { status: 409 });
        }

        // Hash password and create user
        const passwordHash = await auth.hashPassword(password);
        const newUser = await dbUtils.createUser(username, passwordHash, email);

        return json({
            success: true,
            user: {
                id: newUser.id,
                username: newUser.username,
                email: newUser.email,
                isAdmin: newUser.is_admin
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};
