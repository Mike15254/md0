import { json } from '@sveltejs/kit';
import { deploymentService } from '$lib/server/deployment.js';
import { dbUtils } from '$lib/server/database.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ params, locals }) => {
    try {
        if (!locals.user) {
            return json({ error: 'Authentication required' }, { status: 401 });
        }

        const projectId = parseInt(params.id);
        if (isNaN(projectId)) {
            return json({ error: 'Invalid project ID' }, { status: 400 });
        }

        // Get project details
        const projects = await dbUtils.getProjects();
        const project = projects.find(p => p.id === projectId);

        if (!project) {
            return json({ error: 'Project not found' }, { status: 404 });
        }

        // Check permissions (user must own project or be admin)
        if (!locals.user.isAdmin && project.created_by !== locals.user.id) {
            return json({ error: 'Permission denied' }, { status: 403 });
        }

        // Start deployment
        const deploymentConfig = {
            projectId: project.id,
            name: project.name,
            githubUrl: project.github_url,
            branch: project.github_branch,
            buildCommand: project.build_command,
            startCommand: project.start_command,
            port: project.port,
            envVars: project.environment_variables
        };

        // Deploy in background
        deploymentService.deployProject(deploymentConfig).catch(error => {
            console.error('Background deployment error:', error);
        });

        return json({
            success: true,
            message: 'Deployment started'
        });
    } catch (error) {
        console.error('Deploy project error:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};
