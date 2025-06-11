import { json, type RequestHandler } from '@sveltejs/kit';
import { deploymentService } from '$lib/server/deployment.js';
import { dbUtils } from '$lib/server/database.js';

export const GET: RequestHandler = async ({ params, locals, url }) => {
	try {
		if (!locals.user) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}
		if (!params.id) {
			return json({ error: 'Project ID is required' }, { status: 400 });
		}
		const project =
			(await dbUtils.findProjectByName(params.id)) || (await dbUtils.getProject(params.id));

		if (!project) {
			return json({ error: 'Project not found' }, { status: 404 });
		}

		if (!locals.user.isAdmin && project.created_by !== locals.user.id) {
			return json({ error: 'Permission denied' }, { status: 403 });
		}

		const limit = parseInt(url.searchParams.get('limit') || '50');
		const deploymentLogs = await dbUtils.getDeploymentLogs(project.id.toString(), limit);

		let runtimeLogs = '';
		try {
			if (project.status === 'running') {
				runtimeLogs = await deploymentService.getProjectLogs(project.name);
			}
		} catch (error) {
			console.warn('Failed to get runtime logs:', error);
		}

		return json({
			success: true,
			data: {
				deployment_logs: deploymentLogs,
				runtime_logs: runtimeLogs.split('\n').filter((line) => line.trim())
			}
		});
	} catch (error) {
		console.error('Get logs error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
