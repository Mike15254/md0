import { json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth.js';

// GitHub App installation flow
export const GET: RequestHandler = async ({ url, locals }) => {
    try {
        const user = requireAuth(locals);
        
        // Get installation_id from GitHub callback
        const installationId = url.searchParams.get('installation_id');
        const setupAction = url.searchParams.get('setup_action');
        
        if (setupAction === 'install' && installationId) {
            // Store installation mapping in database
            const { dbUtils } = await import('$lib/server/database.js');
            
            await dbUtils.createGitHubAppInstallation({
                user_id: user.id,
                installation_id: parseInt(installationId),
                setup_action: setupAction
            });
            
            // Redirect to projects page with success message
            throw redirect(302, '/projects?github_app=installed');
        }
        
        // If no installation_id, redirect to GitHub App installation
        const githubAppClientId = process.env.GITHUB_APP_CLIENT_ID;
        
        if (!githubAppClientId) {
            return json({ error: 'GitHub App not configured' }, { status: 500 });
        }
        
        const installUrl = `https://github.com/apps/md0-deployment/installations/new`;
        throw redirect(302, installUrl);
        
    } catch (error) {
        if (error instanceof Response) throw error; // Re-throw redirects
        
        console.error('GitHub App install error:', error);
        return json({ error: 'Installation failed' }, { status: 500 });
    }
};
