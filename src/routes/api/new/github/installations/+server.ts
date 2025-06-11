import { json } from '@sveltejs/kit';
import { GitHubService } from '$lib/service/github.js';
import { db } from '$lib/server/database.js';
import { type RequestEvent } from "@sveltejs/kit";

export const GET = async ({ locals }: RequestEvent) => {
	try {
		if (!locals.user) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}

		// Get user's installations from database
		const installations = await db`
			SELECT 
				id, installation_id, account_login, account_type,
				permissions, events, is_active, created_at, updated_at
			FROM github_app_installations 
			WHERE user_id = ${parseInt(locals.user.id, 10)} AND is_active = true
			ORDER BY created_at DESC
		`;
		
		return json({
			success: true,
			data: installations
		});
	} catch (error) {
		console.error('Get GitHub installations error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

export const POST = async ({ request, locals }: RequestEvent) => {
	try {
		if (!locals.user) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}

		const { installation_id } = await request.json();

		if (!installation_id) {
			return json({ error: 'Installation ID required' }, { status: 400 });
		}

		// Link installation to user
		await db`
			INSERT INTO github_app_installations (
				user_id, installation_id, account_login, account_type, is_active
			)
			VALUES (
				${parseInt(locals.user.id, 10)}, ${installation_id}, 
				'linked_user', 'User', true
			)
			ON CONFLICT (installation_id) DO UPDATE SET
				user_id = EXCLUDED.user_id,
				updated_at = CURRENT_TIMESTAMP
		`;

		return json({
			success: true,
			message: 'GitHub App installation linked successfully'
		});
	} catch (error) {
		console.error('Link GitHub installation error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
