import { json } from '@sveltejs/kit';
import { systemService } from '$lib/server/system.js';
import { dbUtils } from '$lib/server/database.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ locals }) => {
    try {
        if (!locals.user) {
            return json({ error: 'Authentication required' }, { status: 401 });
        }

        // Get enhanced system metrics with security data
        const enhancedMetrics = await systemService.getEnhancedSystemMetrics();
        
        // Get basic system metrics as fallback
        const basicMetrics = await systemService.getSystemMetrics();
        
        // Get Docker containers
        const containers = await systemService.getDockerContainers();
        
        // Get database status
        const databaseStatus = await systemService.getDatabaseStatus();
        
        // Get security metrics
        const securityMetrics = await systemService.getSecurityMetrics();
        
        // Get VPS information
        const vpsInformation = await systemService.getVPSInformation();
        
        // Get system processes
        const processes = await systemService.getProcesses();
        
        // Get recent system metrics from database
        const latestMetrics = await dbUtils.getLatestSystemMetrics();

        // Get system logs for security analysis
        const recentLogs = await systemService.getSystemLogs(50);

        return json({
            success: true,
            data: {
                current_metrics: enhancedMetrics || basicMetrics || latestMetrics,
                security_metrics: securityMetrics,
                vps_information: vpsInformation,
                containers,
                database_status: databaseStatus,
                top_processes: processes,
                recent_logs: recentLogs,
                last_updated: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Get system metrics error:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};
