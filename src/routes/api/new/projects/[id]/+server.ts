import { json, type RequestEvent } from '@sveltejs/kit';
import { dbUtils } from '$lib/server/database.js';

export const GET = async ({ params, locals }: RequestEvent) => {
	try {
		if (!locals.user) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}

        if (!params.id) {
                    return json({ error: 'Project ID is required' }, { status: 400 });
                }
		const project = await dbUtils.findProjectByName(params.id) || 
			await dbUtils.getProject(params.id);

		if (!project) {
			return json({ error: 'Project not found' }, { status: 404 });
		}

		if (!locals.user.isAdmin && project.created_by !== locals.user.id) {
			return json({ error: 'Project not found' }, { status: 404 }); // Return 404 instead of 403 for security
		}

		return json({
			success: true,
			data: project,
			project: project
		});
	} catch (error) {
		console.error('Get project error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

export const PATCH = async ({ params, request, locals }: RequestEvent) => {
	try {
		if (!locals.user) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}
        if (!params.id) {
                    return json({ error: 'Project ID is required' }, { status: 400 });
                }

		const project = await dbUtils.findProjectByName(params.id) || 
			await dbUtils.getProject(params.id);

		if (!project) {
			return json({ error: 'Project not found' }, { status: 404 });
		}

		if (!locals.user.isAdmin && project.created_by !== locals.user.id) {
			return json({ error: 'Project not found' }, { status: 404 }); // Return 404 instead of 403 for security
		}

		const updates = await request.json();
		
		try {
			const updatedProject = await dbUtils.updateProject(project.id, updates);

			return json({
				success: true,
				data: updatedProject,
				project: updatedProject
			});
		} catch (error: any) {
			if (error.message === 'Project name already exists') {
				return json({ error: 'Project name already exists' }, { status: 409 });
			}
			throw error;
		}
	} catch (error) {
		console.error('Update project error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

// Alias PUT to PATCH for compatibility
export const PUT = async (event: RequestEvent) => {
	return PATCH(event);
};

export const DELETE = async ({ params, locals }: RequestEvent) => {
	try {
		if (!locals.user) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}

        if (!params.id) {
                    return json({ error: 'Project ID is required' }, { status: 400 });
                }
		const project = await dbUtils.findProjectByName(params.id) || 
			await dbUtils.getProject(params.id);

		if (!project) {
			return json({ error: 'Project not found' }, { status: 404 });
		}

		if (!locals.user.isAdmin && project.created_by !== locals.user.id) {
			return json({ error: 'Project not found' }, { status: 404 }); // Return 404 instead of 403 for security
		}

		const { deploymentService } = await import('$lib/server/deployment.js');
		await deploymentService.deleteProject(project.id, project.name);
		await dbUtils.deleteProject(project.id);

		return json({
			success: true,
			message: 'Project deleted successfully'
		});
	} catch (error) {
		console.error('Delete project error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
