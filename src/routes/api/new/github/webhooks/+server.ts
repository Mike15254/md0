import { json } from '@sveltejs/kit';
import { db } from '$lib/server/database.js';
import { type RequestEvent } from "@sveltejs/kit";

export const GET = async ({ locals, url }: RequestEvent) => {
	try {
		if (!locals.user) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}

		const limit = parseInt(url.searchParams.get('limit') || '10');
		const projectIdParam = url.searchParams.get('project_id');
		
		// Validate project_id if provided
		let projectId: number | null = null;
		if (projectIdParam) {
			const parsedProjectId = parseInt(projectIdParam);
			if (isNaN(parsedProjectId)) {
				return json({ error: 'Invalid project_id parameter' }, { status: 400 });
			}
			projectId = parsedProjectId;
		}

		// Get webhook events from database
		const events = projectId ? 
			await db`
				SELECT id, project_id, event_type, event_action, source_branch, 
					   commit_sha, commit_message, author_name, author_email, 
					   payload, processed, deployment_triggered, created_at
				FROM webhook_events 
				WHERE project_id = ${projectId}
				ORDER BY created_at DESC 
				LIMIT ${limit}
			` :
			await db`
				SELECT id, project_id, event_type, event_action, source_branch, 
					   commit_sha, commit_message, author_name, author_email, 
					   payload, processed, deployment_triggered, created_at
				FROM webhook_events 
				ORDER BY created_at DESC 
				LIMIT ${limit}
			`;

		return json({
			success: true,
			data: events
		});
	} catch (error) {
		console.error('Get webhook events error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
