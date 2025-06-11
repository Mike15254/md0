import { json, type RequestEvent } from '@sveltejs/kit';
import { lucia } from '$lib/service/auth.js';
import { dbUtils } from '$lib/server/database.js';
import bcrypt from 'bcryptjs';

export const POST = async ({ request, cookies }: RequestEvent) => {
	try {
		const { username, password } = await request.json();

		if (!username || !password) {
			return json({ error: 'Username and password required' }, { status: 400 });
		}

		const user = await dbUtils.findUserByUsername(username);
		if (!user) {
			return json({ error: 'Invalid credentials' }, { status: 401 });
		}

		if (user.locked_until && new Date() < new Date(user.locked_until)) {
			return json({ error: 'Account temporarily locked' }, { status: 423 });
		}

		const validPassword = await bcrypt.compare(password, user.password_hash);
		if (!validPassword) {
			await dbUtils.incrementFailedLoginAttempts(user.id);
			return json({ error: 'Invalid credentials' }, { status: 401 });
		}

		await dbUtils.resetFailedLoginAttempts(user.id);
		await dbUtils.updateLastLogin(user.id);

		const session = await lucia.createSession(user.id.toString(), {});
		const sessionCookie = lucia.createSessionCookie(session.id);

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
				isAdmin: user.is_admin,
				githubInstallations: user.github_installations
			}
		});
	} catch (error) {
		console.error('Login error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
