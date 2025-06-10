import { json } from '@sveltejs/kit';
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

        // Get enhanced repository information
        let repoInfo = null;
        if (project.github_repository_id) {
            repoInfo = await dbUtils.getGitHubRepositoryById(project.github_repository_id);
        }

        const enhancedProject = {
            ...project,
            repository_name: repoInfo?.full_name || project.github_url?.split('/').slice(-2).join('/') || null,
            repository_url: repoInfo?.html_url || project.github_url,
            repository_clone_url: repoInfo?.clone_url || project.github_url,
            repository_language: repoInfo?.language || null,
            repository_description: repoInfo?.description || project.description,
            is_private: repoInfo?.private || false
        };

        return json({
            success: true,
            data: enhancedProject
        });
    } catch (error) {
        console.error('Get project error:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
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

        const updates = await request.json();
        
        // Validate allowed fields
        const allowedFields = [
            'name', 'description', 'build_command', 'start_command', 
            'port', 'custom_domain', 'runtime', 'auto_deploy', 'environment_variables'
        ];
        
        const validUpdates: any = {};
        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key)) {
                validUpdates[key] = value;
            }
        }

        if (Object.keys(validUpdates).length === 0) {
            return json({ error: 'No valid fields to update' }, { status: 400 });
        }

        // Update the project
        const updatedProject = await dbUtils.updateProject(project.id, validUpdates);

        if (!updatedProject) {
            return json({ error: 'Failed to update project' }, { status: 500 });
        }

        return json({
            success: true,
            data: updatedProject
        });
    } catch (error) {
        console.error('Update project error:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
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

        // Delete the project
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
