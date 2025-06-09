import { json } from '@sveltejs/kit';
import { deploymentService } from '$lib/server/deployment.js';
import { dbUtils } from '$lib/server/database.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ params, request, locals }) => {
    try {
        if (!locals.user) {
            return json({ error: 'Authentication required' }, { status: 401 });
        }

        const projectId = parseInt(params.id);
        if (isNaN(projectId)) {
            return json({ error: 'Invalid project ID' }, { status: 400 });
        }

        const { action } = await request.json();
        
        if (!['start', 'stop', 'restart'].includes(action)) {
            return json({ error: 'Invalid action. Must be start, stop, or restart' }, { status: 400 });
        }

        // Get project details
        const projects = await dbUtils.getProjects();
        const project = projects.find(p => p.id === projectId);

        if (!project) {
            return json({ error: 'Project not found' }, { status: 404 });
        }

        // Check permissions
        if (!locals.user.isAdmin && project.created_by !== locals.user.id) {
            return json({ error: 'Permission denied' }, { status: 403 });
        }

        let success = false;
        let newStatus = project.status;

        switch (action) {
            case 'start':
                // For start, we need to redeploy
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
                
                deploymentService.deployProject(deploymentConfig).catch(error => {
                    console.error('Background deployment error:', error);
                });
                
                success = true;
                newStatus = 'building';
                break;
                
            case 'stop':
                success = await deploymentService.stopProject(project.name);
                newStatus = success ? 'stopped' : project.status;
                break;
                
            case 'restart':
                success = await deploymentService.restartProject(project.name);
                newStatus = success ? 'running' : project.status;
                break;
        }

        if (success) {
            await dbUtils.updateProjectStatus(projectId, newStatus);
        }

        return json({
            success,
            message: success ? `Project ${action}ed successfully` : `Failed to ${action} project`
        });
    } catch (error) {
        console.error('Control project error:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};
