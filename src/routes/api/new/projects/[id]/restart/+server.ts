import { json } from '@sveltejs/kit';
import { deploymentService } from '$lib/server/deployment.js';
import { dbUtils } from '$lib/server/database.js';
import { type RequestEvent } from '@sveltejs/kit';

export const POST = async ({ params, locals }: RequestEvent) => {
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

		const success = await deploymentService.restartProject(project.name);
		const newStatus = success ? 'running' : project.status;

		if (success) {
			await dbUtils.updateProjectStatus(project.id, 'running');
			await dbUtils.addDeploymentLog(project.id, 'success', 'Project restarted successfully');
		} else {
			await dbUtils.addDeploymentLog(project.id, 'error', 'Failed to restart project');
		}

		return json({
			success,
			message: success ? 'Project restarted successfully' : 'Failed to restart project',
			status: newStatus
		});
	} catch (error) {
		console.error('Restart project error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
