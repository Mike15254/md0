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
            const result = await deploymentService.stopProject(project.id);
            
            if (result.success) {
                // Update project status
                await dbUtils.updateProjectStatus(project.id, 'stopped');
                
                return json({
                    success: true,
                    message: 'Project stopped successfully',
                    status: 'stopped'
                });
            } else {
                return json({
                    success: false,
                    error: result.error || 'Failed to stop project'
                }, { status: 500 });
            }
        } catch (error) {
            console.error('Project stop error:', error);
            
            return json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to stop project'
            }, { status: 500 });
        }
    } catch (error) {
        console.error('Stop project error:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};
