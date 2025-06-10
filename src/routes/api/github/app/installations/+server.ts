import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth.js';

// Get GitHub App installations for the current user
export const GET: RequestHandler = async ({ locals }) => {
    try {
        const user = requireAuth(locals);
        
        const { dbUtils } = await import('$lib/server/database.js');
        
        // Get all active GitHub App installations
        // GitHub Apps are typically installed at account level, not user level
        const installations = await dbUtils.getAllActiveGitHubAppInstallations();
        
        return json({
            success: true,
            data: installations
        });
        
    } catch (error) {
        console.error('Get installations error:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};
