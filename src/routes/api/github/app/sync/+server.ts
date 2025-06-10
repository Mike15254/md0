import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth.js';

export const POST: RequestHandler = async ({ locals }) => {
    try {
        const user = requireAuth(locals);
        
        const { githubAppService } = await import('$lib/server/github-app.js');
        const { dbUtils } = await import('$lib/server/database.js');
        
        // Generate JWT and fetch installations from GitHub
        const jwt = await githubAppService.generateJWT();
        
        const response = await fetch('https://api.github.com/app/installations', {
            headers: {
                'Authorization': `Bearer ${jwt}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'MD0-Deployment-Platform'
            }
        });
        
        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status} ${await response.text()}`);
        }
        
        const installations = await response.json();
        
        // Sync installations to database
        const syncedInstallations = [];
        for (const installation of installations) {
            try {
                const existingInstallation = await dbUtils.getGitHubAppInstallation(installation.id);
                
                if (!existingInstallation) {
                    // Create new installation record
                    const newInstallation = await dbUtils.createGitHubAppInstallation({
                        installation_id: installation.id,
                        account_id: installation.account.id,
                        account_login: installation.account.login,
                        account_type: installation.account.type,
                        permissions: installation.permissions,
                        events: installation.events
                    });
                    syncedInstallations.push(newInstallation);
                } else {
                    syncedInstallations.push(existingInstallation);
                }
                
                // Fetch and store repositories for this installation
                try {
                    const repositories = await githubAppService.getInstallationRepositories(installation.id);
                    console.log(`Synced ${repositories.length} repositories for installation ${installation.id}`);
                } catch (repoError) {
                    console.error(`Failed to sync repositories for installation ${installation.id}:`, repoError);
                }
                
            } catch (error) {
                console.error(`Failed to sync installation ${installation.id}:`, error);
            }
        }
        
        return json({
            success: true,
            message: 'Installations synced successfully',
            data: {
                total_installations: installations.length,
                synced_installations: syncedInstallations.length,
                installations: syncedInstallations
            }
        });
        
    } catch (error) {
        console.error('Sync installations error:', error);
        return json({ 
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            message: 'Failed to sync installations'
        }, { status: 500 });
    }
};
