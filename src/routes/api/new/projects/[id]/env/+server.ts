import { json, type RequestHandler } from '@sveltejs/kit';
import { dbUtils } from '$lib/server/database.js';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
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

		const { environment_variables } = await request.json();

		if (!environment_variables || typeof environment_variables !== 'object') {
			return json({ error: 'Invalid environment variables' }, { status: 400 });
		}

		const updatedProject = await dbUtils.updateProject(project.id, {
			environment_variables
		});

		await dbUtils.addDeploymentLog(project.id, 'info', 'Environment variables updated');

		return json({
			success: true,
			data: updatedProject,
			message: 'Environment variables updated successfully'
		});
	} catch (error) {
		console.error('Update environment variables error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
