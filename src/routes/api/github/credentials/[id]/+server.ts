import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { dbUtils } from '$lib/server/database.js';

export const DELETE: RequestHandler = async ({ params, locals }) => {
    try {
        if (!locals.user) {
            return json({ error: 'Authentication required' }, { status: 401 });
        }

        if (!params.id) {
            return json({ error: 'Missing credential ID' }, { status: 400 });
        }
        
        const credentialId = parseInt(params.id);
        if (isNaN(credentialId)) {
            return json({ error: 'Invalid credential ID' }, { status: 400 });
        }

        await dbUtils.deleteGitHubCredential(credentialId);

        return json({
            success: true,
            message: 'GitHub credential deleted successfully'
        });
    } catch (error) {
        console.error('Delete GitHub credential error:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};
