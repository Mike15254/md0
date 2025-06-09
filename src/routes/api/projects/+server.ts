import { json } from '@sveltejs/kit';
import { dbUtils } from '$lib/server/database.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ locals }) => {
    try {
        if (!locals.user) {
            return json({ error: 'Authentication required' }, { status: 401 });
        }

        const projects = await dbUtils.getProjects(locals.user.isAdmin ? undefined : Number(locals.user.id));
        
        return json({
            success: true,
            data: projects
        });
    } catch (error) {
        console.error('Get projects error:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};

export const POST: RequestHandler = async ({ request, locals }) => {
    try {
        if (!locals.user) {
            return json({ error: 'Authentication required' }, { status: 401 });
        }

        const { name, github_url, github_branch, build_command, start_command, port, environment_variables } = await request.json();

        if (!name || !github_url) {
            return json({ error: 'Name and GitHub URL are required' }, { status: 400 });
        }

        // Validate GitHub URL
        try {
            const url = new URL(github_url);
            if (url.hostname !== 'github.com') {
                return json({ error: 'Invalid GitHub URL' }, { status: 400 });
            }
        } catch {
            return json({ error: 'Invalid GitHub URL format' }, { status: 400 });
        }

        // Create project
        const project = await dbUtils.createProject({
            name,
            github_url,
            github_branch: github_branch || 'main',
            build_command: build_command || 'bun install && bun run build',
            start_command: start_command || 'bun start',
            port: port || null,
            environment_variables: environment_variables || {},
            created_by: Number(locals.user.id)
        });

        return json({
            success: true,
            data: project
        });
    } catch (error) {
        console.error('Create project error:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};
