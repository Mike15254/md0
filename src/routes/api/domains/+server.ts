import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { dbUtils } from '$lib/server/database.js';

export const POST: RequestHandler = async ({ request, locals }) => {
    try {
        if (!locals.user) {
            return json({ error: 'Authentication required' }, { status: 401 });
        }

        const { project_id, domain_name, ssl_enabled = false } = await request.json();

        if (!project_id || !domain_name) {
            return json({ error: 'Project ID and domain name are required' }, { status: 400 });
        }

        // Validate domain name format
        const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.[a-zA-Z]{2,}$/;
        if (!domainRegex.test(domain_name)) {
            return json({ error: 'Invalid domain name format' }, { status: 400 });
        }

        // Check if user owns the project
        const project = await dbUtils.getProject(project_id);
        if (!project || (!locals.user.isAdmin && project.created_by !== Number(locals.user.id))) {
            return json({ error: 'Project not found or permission denied' }, { status: 403 });
        }

        const domain = await dbUtils.createDomain({
            domain_name,
            project_id: parseInt(project_id),
            ssl_enabled
        });

        // Update project with custom domain if it's the first one
        const existingDomains = await dbUtils.getDomains(parseInt(project_id));
        if (existingDomains.length === 1) {
            await dbUtils.updateProjectStatus(parseInt(project_id), project.status, undefined, undefined, {
                custom_domain: domain_name
            });
        }

        return json({
            success: true,
            data: domain
        });
    } catch (error) {
        console.error('Create domain error:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};

export const GET: RequestHandler = async ({ url, locals }) => {
    try {
        if (!locals.user) {
            return json({ error: 'Authentication required' }, { status: 401 });
        }

        const projectId = url.searchParams.get('project_id');
        if (!projectId) {
            return json({ error: 'Project ID is required' }, { status: 400 });
        }

        // Check if user owns the project
        const project = await dbUtils.getProject(projectId);
        if (!project || (!locals.user.isAdmin && project.created_by !== Number(locals.user.id))) {
            return json({ error: 'Project not found or permission denied' }, { status: 403 });
        }

        const domains = await dbUtils.getDomains(parseInt(projectId));

        return json({
            success: true,
            data: domains
        });
    } catch (error) {
        console.error('Get domains error:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};
