import { json } from '@sveltejs/kit';
import { systemService } from '$lib/server/system.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ locals, url }) => {
    try {
        if (!locals.user) {
            return json({ error: 'Authentication required' }, { status: 401 });
        }

        const lines = parseInt(url.searchParams.get('lines') || '100');
        const logs = await systemService.getSystemLogs(lines);

        return json({
            success: true,
            data: {
                logs,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Get system logs error:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};

export const POST: RequestHandler = async ({ request, locals }) => {
    try {
        if (!locals.user || !locals.user.isAdmin) {
            return json({ error: 'Admin access required' }, { status: 403 });
        }

        const { action, service } = await request.json();

        if (!action || !service) {
            return json({ error: 'Action and service are required' }, { status: 400 });
        }

        if (!['start', 'stop'].includes(action)) {
            return json({ error: 'Invalid action' }, { status: 400 });
        }

        if (!['postgresql', 'pocketbase'].includes(service)) {
            return json({ error: 'Invalid service' }, { status: 400 });
        }

        let success = false;
        
        if (action === 'start') {
            success = await systemService.startDatabase(service as 'postgresql' | 'pocketbase');
        } else {
            success = await systemService.stopDatabase(service as 'postgresql' | 'pocketbase');
        }

        return json({
            success,
            message: success ? `${service} ${action}ed successfully` : `Failed to ${action} ${service}`
        });
    } catch (error) {
        console.error('System control error:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};
