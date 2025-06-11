import { json, type RequestEvent } from '@sveltejs/kit';
import { dbUtils } from '$lib/server/database.js';
import bcrypt from 'bcryptjs';

export const POST = async ({ request }: RequestEvent) => {
	try {
		const { username, password, email } = await request.json();

		if (!username || !password) {
			return json({ error: 'Username and password required' }, { status: 400 });
		}

		if (username.length < 3) {
			return json({ error: 'Username must be at least 3 characters' }, { status: 400 });
		}

		if (password.length < 6) {
			return json({ error: 'Password must be at least 6 characters' }, { status: 400 });
		}

		const existingUser = await dbUtils.findUserByUsername(username);
		if (existingUser) {
			return json({ error: 'Username already taken' }, { status: 409 });
		}

		if (email) {
			const existingEmail = await dbUtils.findUserByEmail(email);
			if (existingEmail) {
				return json({ error: 'Email already registered' }, { status: 409 });
			}
		}

		const passwordHash = await bcrypt.hash(password, 12);
		const user = await dbUtils.createUser(username, passwordHash, email);

		return json({
			success: true,
			user: {
				id: user.id,
				username: user.username,
				email: user.email,
				isAdmin: user.is_admin
			}
		});
	} catch (error: any) {
		console.error('Register error:', error);
		
		// Handle database constraint violations
		if (error.code === '23514' && error.constraint_name === 'valid_email') {
			return json({ error: 'Invalid email format' }, { status: 400 });
		}
		
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
