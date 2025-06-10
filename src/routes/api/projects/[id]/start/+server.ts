import { json } from '@sveltejs/kit';
import { deploymentService } from '$lib/server/deployment.js';
import { dbUtils } from '$lib/server/database.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ params, locals }) => {
    try {
        if (!locals.user) {
            return json({ error: 'Authentication required' }, { status: 401 });
        }

        // Try to get project by name first, then by ID for backwards compatibility
        let project = await dbUtils.findProjectByName(decodeURIComponent(params.id));
        
        if (!project) {
            // Fallback: try to get by ID if the param looks like a number
            const projectId = parseInt(params.id);
            if (!isNaN(projectId)) {
                const projects = await dbUtils.getProjects();
                project = projects.find(p => p.id === projectId);
            }
        }

        if (!project) {
            return json({ error: 'Project not found' }, { status: 404 });
        }

        // Check permissions
        if (!locals.user.isAdmin && project.created_by !== locals.user.id) {
            return json({ error: 'Permission denied' }, { status: 403 });
        }

        try {
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

            const result = await deploymentService.deployProject(deploymentConfig);
            
            if (result.success) {
                // Update project status
                await dbUtils.updateProjectStatus(project.id, 'running');
                
                return json({
                    success: true,
                    message: 'Project started successfully',
                    status: 'running'
                });
            } else {
                return json({
                    success: false,
                    error: result.error || 'Failed to start project'
                }, { status: 500 });
            }
        } catch (error) {
            console.error('Project start error:', error);
            
            // Update project status to error
            await dbUtils.updateProjectStatus(project.id, 'error');
            
            return json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to start project'
            }, { status: 500 });
        }
    } catch (error) {
        console.error('Start project error:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};
