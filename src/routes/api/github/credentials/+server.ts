import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { dbUtils } from '$lib/server/database.js';

export const GET: RequestHandler = async ({ locals }) => {
    try {
        if (!locals.user) {
            return json({ error: 'Authentication required' }, { status: 401 });
        }

        const credentials = await dbUtils.getGitHubCredentials(Number(locals.user.id));
        
        return json({
            success: true,
            data: credentials
        });
    } catch (error) {
        console.error('Get GitHub credentials error:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};

export const POST: RequestHandler = async ({ request, locals }) => {
    try {
        if (!locals.user) {
            return json({ error: 'Authentication required' }, { status: 401 });
        }

        const { name, type, token, scopes } = await request.json();

        if (!name || !type) {
            return json({ error: 'Name and type are required' }, { status: 400 });
        }

        if (type === 'pat' && !token) {
            return json({ error: 'Token is required for PAT' }, { status: 400 });
        }

        // Validate GitHub token if provided
        if (token) {
            const testResponse = await fetch('https://api.github.com/user', {
                headers: {
                    'Authorization': `token ${token}`,
                    'User-Agent': 'MD0-Deployment-Platform'
                }
            });

            if (!testResponse.ok) {
                return json({ error: 'Invalid GitHub token' }, { status: 400 });
            }
        }

        const credential = await dbUtils.createGitHubCredential({
            user_id: Number(locals.user.id),
            name,
            type: type as 'pat' | 'oauth' | 'ssh',
            token,
            scopes: scopes || ['repo']
        });

        return json({
            success: true,
            data: credential
        });
    } catch (error) {
        console.error('Create GitHub credential error:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};
