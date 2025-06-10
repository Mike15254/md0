import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth.js';

// Get repositories accessible through GitHub App
export const GET: RequestHandler = async ({ locals }) => {
    try {
        const user = requireAuth(locals);
        
        const { githubAppService } = await import('$lib/server/github-app.js');
        const { dbUtils } = await import('$lib/server/database.js');
        
        // Get all active GitHub App installations
        // GitHub Apps are typically installed at account level, not user level
        const installations = await dbUtils.getAllActiveGitHubAppInstallations();
        
        if (installations.length === 0) {
            return json({
                success: true,
                data: {
                    repositories: [],
                    hasInstallation: false
                }
            });
        }
        
        // Fetch repositories for all installations
        const allRepositories = [];
        
        for (const installation of installations) {
            try {
                const repositories = await githubAppService.getInstallationRepositories(
                    installation.installation_id
                );
                allRepositories.push(...repositories);
            } catch (error) {
                console.error(`Failed to fetch repos for installation ${installation.installation_id}:`, error);
            }
        }
        
        return json({
            success: true,
            data: {
                repositories: allRepositories,
                hasInstallation: true,
                installationCount: installations.length
            }
        });
        
    } catch (error) {
        console.error('Get repositories error:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};
