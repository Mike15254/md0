import { json, type RequestEvent } from '@sveltejs/kit';

export const GET = async ({ locals }: RequestEvent) => {
	try {
		if (!locals.user) {
			return json({ error: 'Not authenticated' }, { status: 401 });
		}

		return json({
			success: true,
			user: {
				id: locals.user.id,
				username: locals.user.username,
				email: locals.user.email,
				isAdmin: locals.user.isAdmin,
				githubInstallations: locals.user.githubInstallations || []
			}
		});
	} catch (error) {
		console.error('Session error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
