import { json, type RequestHandler } from '@sveltejs/kit';
import { deploymentService } from '$lib/server/deployment.js';
import { dbUtils } from '$lib/server/database.js';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		if (!locals.user) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}

		const projects = await dbUtils.getProjects();
		const user = locals.user; // Store user after null check
		const userProjects = user.isAdmin ? 
			projects : 
			projects.filter(p => p.created_by === user.id);

		const stats = {
			total_projects: userProjects.length,
			running_projects: userProjects.filter(p => p.status === 'running').length,
			stopped_projects: userProjects.filter(p => p.status === 'stopped').length,
			failed_projects: userProjects.filter(p => p.status === 'failed').length,
			building_projects: userProjects.filter(p => p.status === 'building').length
		};

		return json({
			success: true,
			data: stats
		});
	} catch (error) {
		console.error('Get project stats error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
