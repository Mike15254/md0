import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth.js';

export const GET: RequestHandler = async ({ locals }) => {
    try {
        const user = requireAuth(locals);
        
        const { githubAppService } = await import('$lib/server/github-app.js');
        
        // Test GitHub App authentication by trying to generate a JWT
        const jwt = await githubAppService.generateJWT();
        
        // Test GitHub API access by fetching app installations
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
        
        return json({
            success: true,
            message: 'GitHub App authentication successful',
            data: {
                installations_count: installations.length,
                installations: installations
            }
        });
        
    } catch (error) {
        console.error('GitHub App test error:', error);
        return json({ 
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            message: 'GitHub App authentication failed'
        }, { status: 500 });
    }
};
