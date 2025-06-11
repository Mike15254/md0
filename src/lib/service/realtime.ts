import { db } from '$lib/server/database.js';
import { BaseService } from './database.js';
import type { ServiceResponse, DeploymentLog } from './types.js';

/**
 * Real-time service for live updates on deployments, logs, and system events
 * Uses Server-Sent Events (SSE) for real-time communication
 */
export class RealtimeService extends BaseService {
    private clients: Map<string, ReadableStreamDefaultController<Uint8Array>> = new Map();
    private userClients: Map<number, Set<string>> = new Map();

    /**
     * Create SSE connection for a user
     */
    createSSEConnection(userId: number): ReadableStream<Uint8Array> {
        const clientId = crypto.randomUUID();
        
        return new ReadableStream({
            start: (controller) => {
                // Store client
                this.clients.set(clientId, controller);
                
                // Track user clients
                if (!this.userClients.has(userId)) {
                    this.userClients.set(userId, new Set());
                }
                this.userClients.get(userId)!.add(clientId);

                // Send initial connection message
                this.sendToClient(clientId, {
                    type: 'connected',
                    data: { clientId, timestamp: new Date().toISOString() }
                });

                // Send initial data
                this.sendInitialData(clientId, userId);
            },
            cancel: () => {
                // Clean up on disconnect
                this.removeClient(clientId, userId);
            }
        });
    }

    /**
     * Remove client and clean up
     */
    private removeClient(clientId: string, userId: number): void {
        this.clients.delete(clientId);
        
        if (this.userClients.has(userId)) {
            this.userClients.get(userId)!.delete(clientId);
            if (this.userClients.get(userId)!.size === 0) {
                this.userClients.delete(userId);
            }
        }
    }

    /**
     * Send message to specific client
     */
    private sendToClient(clientId: string, message: any): void {
        const controller = this.clients.get(clientId);
        if (controller) {
            try {
                const data = `data: ${JSON.stringify(message)}\n\n`;
                controller.enqueue(new TextEncoder().encode(data));
            } catch (error) {
                console.error('Failed to send SSE message:', error);
                this.clients.delete(clientId);
            }
        }
    }

    /**
     * Broadcast to all clients of a user
     */
    private broadcastToUser(userId: number, message: any): void {
        const clientIds = this.userClients.get(userId);
        if (clientIds) {
            for (const clientId of clientIds) {
                this.sendToClient(clientId, message);
            }
        }
    }

    /**
     * Broadcast to all connected clients
     */
    private broadcast(message: any): void {
        for (const [clientId] of this.clients) {
            this.sendToClient(clientId, message);
        }
    }

    /**
     * Send initial data when client connects
     */
    private async sendInitialData(clientId: string, userId: number): Promise<void> {
        try {
            // Get user's projects with current status
            const projects = await this.executeQuery(
                db`
                    SELECT id, name, status, last_deployed_at
                    FROM projects 
                    WHERE created_by = ${userId}
                    ORDER BY updated_at DESC
                    LIMIT 20
                `
            );

            this.sendToClient(clientId, {
                type: 'initial_projects',
                data: projects
            });

            // Get recent deployment logs for user's projects
            const logs = await this.executeQuery(
                db`
                    SELECT dl.*, p.name as project_name
                    FROM deployment_logs dl
                    JOIN projects p ON dl.project_id = p.id
                    WHERE p.created_by = ${userId}
                    ORDER BY dl.created_at DESC
                    LIMIT 50
                `
            );

            this.sendToClient(clientId, {
                type: 'initial_logs',
                data: logs
            });
        } catch (error) {
            console.error('Failed to send initial data:', error);
        }
    }

    /**
     * Notify project status change
     */
    async notifyProjectStatusChange(projectId: number, status: string, userId: number): Promise<void> {
        const message = {
            type: 'project_status_changed',
            data: {
                project_id: projectId,
                status,
                timestamp: new Date().toISOString()
            }
        };

        this.broadcastToUser(userId, message);
        
        // Log the event
        await this.logRealtimeEvent('project_status_change', { projectId, status }, userId);
    }

    /**
     * Stream deployment logs in real-time
     */
    async streamDeploymentLog(
        projectId: number, 
        deploymentId: string, 
        type: string, 
        level: string, 
        message: string, 
        userId: number
    ): Promise<void> {
        // Store log in database
        await this.executeQuery(
            db`
                INSERT INTO deployment_logs (project_id, deployment_id, type, level, message)
                VALUES (${projectId}, ${deploymentId}, ${type}, ${level}, ${message})
            `
        );

        // Broadcast to user's clients
        const logMessage = {
            type: 'deployment_log',
            data: {
                project_id: projectId,
                deployment_id: deploymentId,
                log_type: type,
                level,
                message,
                timestamp: new Date().toISOString()
            }
        };

        this.broadcastToUser(userId, logMessage);
    }

    /**
     * Notify domain status change
     */
    async notifyDomainStatusChange(
        domainId: number, 
        domainName: string, 
        status: string, 
        userId: number
    ): Promise<void> {
        const message = {
            type: 'domain_status_changed',
            data: {
                domain_id: domainId,
                domain_name: domainName,
                status,
                timestamp: new Date().toISOString()
            }
        };

        this.broadcastToUser(userId, message);
    }

    /**
     * Notify SSL certificate events
     */
    async notifySSLEvent(
        domainName: string, 
        event: 'issued' | 'renewed' | 'failed', 
        details: string,
        userId: number
    ): Promise<void> {
        const message = {
            type: 'ssl_event',
            data: {
                domain_name: domainName,
                event,
                details,
                timestamp: new Date().toISOString()
            }
        };

        this.broadcastToUser(userId, message);
    }

    /**
     * Notify database instance status change
     */
    async notifyDatabaseStatusChange(
        databaseId: number, 
        name: string, 
        status: string, 
        userId: number
    ): Promise<void> {
        const message = {
            type: 'database_status_changed',
            data: {
                database_id: databaseId,
                name,
                status,
                timestamp: new Date().toISOString()
            }
        };

        this.broadcastToUser(userId, message);
    }

    /**
     * Broadcast system alerts (for all users or specific user)
     */
    async broadcastSystemAlert(
        alert: {
            type: 'warning' | 'error' | 'info' | 'success';
            title: string;
            message: string;
            action?: string;
        },
        userId?: number
    ): Promise<void> {
        const message = {
            type: 'system_alert',
            data: {
                ...alert,
                timestamp: new Date().toISOString()
            }
        };

        if (userId) {
            this.broadcastToUser(userId, message);
        } else {
            this.broadcast(message);
        }
    }

    /**
     * Stream VPS metrics in real-time
     */
    async streamVPSMetrics(metrics: any): Promise<void> {
        const message = {
            type: 'vps_metrics',
            data: {
                ...metrics,
                timestamp: new Date().toISOString()
            }
        };

        // Broadcast to all connected admin clients
        for (const [userId, clientIds] of this.userClients) {
            // Check if user is admin (you might want to implement this check)
            const user = await this.executeQuery(
                db`SELECT is_admin FROM users WHERE id = ${userId}`
            ) as { is_admin: boolean }[];

            if (user[0]?.is_admin) {
                for (const clientId of clientIds) {
                    this.sendToClient(clientId, message);
                }
            }
        }
    }

    /**
     * Get real-time statistics
     */
    async getRealtimeStats(): Promise<ServiceResponse<{
        connected_clients: number;
        connected_users: number;
        active_deployments: number;
        recent_logs_count: number;
    }>> {
        try {
            const activeDeployments = await this.executeQuery(
                db`SELECT COUNT(*) as count FROM projects WHERE status IN ('building', 'deploying')`
            ) as { count: string | number }[];

            const recentLogs = await this.executeQuery(
                db`SELECT COUNT(*) as count FROM deployment_logs WHERE created_at > NOW() - INTERVAL '1 hour'`
            ) as { count: string | number }[];

            const stats = {
                connected_clients: this.clients.size,
                connected_users: this.userClients.size,
                active_deployments: Number(activeDeployments[0].count),
                recent_logs_count: Number(recentLogs[0].count)
            };

            return this.createResponse(true, stats);
        } catch (error) {
            return this.handleError(error);
        }
    }

    /**
     * Log real-time events for debugging
     */
    private async logRealtimeEvent(
        event: string, 
        data: any, 
        userId?: number
    ): Promise<void> {
        try {
            await this.executeQuery(
                db`
                    INSERT INTO realtime_events (event_type, event_data, user_id)
                    VALUES (${event}, ${JSON.stringify(data)}, ${userId || null})
                `
            );
        } catch (error) {
            console.error('Failed to log realtime event:', error);
        }
    }

    /**
     * Get active clients for debugging
     */
    getActiveClients(): {
        total_clients: number;
        users: Array<{ user_id: number; client_count: number }>;
    } {
        const users = Array.from(this.userClients.entries()).map(([userId, clientIds]) => ({
            user_id: userId,
            client_count: clientIds.size
        }));

        return {
            total_clients: this.clients.size,
            users
        };
    }

    /**
     * Close all connections (for shutdown)
     */
    closeAllConnections(): void {
        for (const [clientId, controller] of this.clients) {
            try {
                this.sendToClient(clientId, {
                    type: 'server_shutdown',
                    data: { message: 'Server is shutting down' }
                });
                // Close the stream properly
                controller.close();
            } catch (error) {
                console.error('Error closing client connection:', error);
            }
        }

        this.clients.clear();
        this.userClients.clear();
    }
}

export const realtimeService = new RealtimeService();
