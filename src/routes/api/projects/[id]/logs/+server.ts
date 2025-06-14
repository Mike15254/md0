import { json } from '@sveltejs/kit';
import { deploymentService } from '$lib/server/deployment.js';
import { dbUtils } from '$lib/server/database.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ params, locals }) => {
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

        // Get deployment logs
        const logs = await dbUtils.getDeploymentLogs(project.id.toString());
        
        // Get runtime logs from container
        let runtimeLogs = '';
        try {
            if (project.status === 'running') {
                runtimeLogs = await deploymentService.getProjectLogs(project.name);
            }
        } catch (error) {
            console.error('Error getting runtime logs:', error);
        }

        return json({
            success: true,
            data: {
                deployment_logs: logs,
                runtime_logs: runtimeLogs
            }
        });
    } catch (error) {
        console.error('Get logs error:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};
