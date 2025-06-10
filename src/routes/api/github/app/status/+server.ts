import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth.js';

export const GET: RequestHandler = async ({ locals }) => {
    try {
        const user = requireAuth(locals);
        
        const { dbUtils } = await import('$lib/server/database.js');
        
        // Check if user has any GitHub App installations
        const installations = await dbUtils.getGitHubAppInstallations(user.id);
        const hasInstallation = installations.length > 0;
        
        // Get repository count if there are installations
        let repositoryCount = 0;
        if (hasInstallation) {
            const repositories = await dbUtils.getGitHubAppRepositories(user.id);
            repositoryCount = repositories.length;
        }
        
        return json({
            success: true,
            data: {
                hasInstallation,
                installationCount: installations.length,
                repositoryCount,
                requiresGitHubApp: true // Always require GitHub App for new projects
            }
        });
        
    } catch (error) {
        console.error('GitHub App status check error:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};
