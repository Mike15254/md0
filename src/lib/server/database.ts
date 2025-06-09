import postgres from 'postgres';
import { DATABASE_URL } from '$env/static/private';

if (!DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
}

export const db = postgres(DATABASE_URL, {
    ssl: process.env.NODE_ENV === 'production',
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
});

// Database utility functions
export const dbUtils = {
    async testConnection() {
        try {
            await db`SELECT 1`;
            return true;
        } catch (error) {
            console.error('Database connection failed:', error);
            return false;
        }
    },

    async getUserByUsername(username: string) {
        const result = await db`
            SELECT id, username, password_hash, email, is_admin, created_at 
            FROM users 
            WHERE username = ${username}
        `;
        return result[0] || null;
    },

    async createUser(username: string, passwordHash: string, email?: string) {
        const result = await db`
            INSERT INTO users (username, password_hash, email)
            VALUES (${username}, ${passwordHash}, ${email || null})
            RETURNING id, username, email, is_admin, created_at
        `;
        return result[0];
    },

    async createAdminUser(username: string, passwordHash: string, email?: string) {
        const result = await db`
            INSERT INTO users (username, password_hash, email, is_admin)
            VALUES (${username}, ${passwordHash}, ${email || null}, true)
            RETURNING id, username, email, is_admin, created_at
        `;
        return result[0];
    },

    async checkAdminExists(): Promise<boolean> {
        const result = await db`
            SELECT 1 FROM users WHERE is_admin = true LIMIT 1
        `;
        return result.length > 0;
    },

    async getProjects(userId?: number) {
        if (userId) {
            const result = await db`
                SELECT p.*, u.username as created_by_username
                FROM projects p
                LEFT JOIN users u ON p.created_by = u.id
                WHERE p.created_by = ${userId}
                ORDER BY p.created_at DESC
            `;
            return result;
        } else {
            const result = await db`
                SELECT p.*, u.username as created_by_username
                FROM projects p
                LEFT JOIN users u ON p.created_by = u.id
                ORDER BY p.created_at DESC
            `;
            return result;
        }
    },

    async updateProjectStatus(projectId: number, status: string, containerId?: string, processId?: number) {
        const result = await db`
            UPDATE projects 
            SET status = ${status}, 
                container_id = ${containerId || null},
                process_id = ${processId || null},
                updated_at = CURRENT_TIMESTAMP,
                last_deployed_at = ${status === 'running' ? db`CURRENT_TIMESTAMP` : db`last_deployed_at`}
            WHERE id = ${projectId}
            RETURNING *
        `;
        return result[0];
    },

    async addDeploymentLog(projectId: number, logType: string, message: string) {
        await db`
            INSERT INTO deployment_logs (project_id, log_type, message)
            VALUES (${projectId}, ${logType}, ${message})
        `;
    },

    async getDeploymentLogs(projectId: string, limit: number = 50) {
        const result = await db`
            SELECT * FROM deployment_logs
            WHERE project_id = ${projectId}
            ORDER BY created_at DESC
            LIMIT ${limit}
        `;
        return result;
    },

    async getProject(projectId: string) {
        const result = await db`
            SELECT p.*, u.username as created_by_username
            FROM projects p
            LEFT JOIN users u ON p.created_by = u.id
            WHERE p.id = ${projectId}
        `;
        return result[0] || null;
    },

    async getDatabaseInstances(userId?: number) {
        const result = await db`
            SELECT d.*, u.username as created_by_username
            FROM database_instances d
            LEFT JOIN users u ON d.created_by = u.id
            ${userId ? db`WHERE d.created_by = ${userId}` : db``}
            ORDER BY d.created_at DESC
        `;
        return result;
    },

    async createDatabaseInstance(instance: {
        name: string;
        type: string;
        port?: number;
        config?: Record<string, any>;
        created_by: number;
    }) {
        const result = await db`
            INSERT INTO database_instances (name, type, port, config, created_by)
            VALUES (${instance.name}, ${instance.type}, ${instance.port || null}, 
                    ${JSON.stringify(instance.config || {})}, ${instance.created_by})
            RETURNING *
        `;
        return result[0];
    },

    async getDatabaseInstance(instanceId: string) {
        const result = await db`
            SELECT d.*, u.username as created_by_username
            FROM database_instances d
            LEFT JOIN users u ON d.created_by = u.id
            WHERE d.id = ${instanceId}
        `;
        return result[0] || null;
    },

    async updateDatabaseInstance(instanceId: string, updates: Partial<{
        status: string;
        container_id: string;
        config: Record<string, any>;
    }>) {
        if (updates.status) {
            const result = await db`
                UPDATE database_instances 
                SET status = ${updates.status}, updated_at = CURRENT_TIMESTAMP
                WHERE id = ${instanceId}
                RETURNING *
            `;
            return result[0];
        }
        
        if (updates.container_id) {
            const result = await db`
                UPDATE database_instances 
                SET container_id = ${updates.container_id}, updated_at = CURRENT_TIMESTAMP
                WHERE id = ${instanceId}
                RETURNING *
            `;
            return result[0];
        }

        if (updates.config) {
            const result = await db`
                UPDATE database_instances 
                SET config = ${JSON.stringify(updates.config)}, updated_at = CURRENT_TIMESTAMP
                WHERE id = ${instanceId}
                RETURNING *
            `;
            return result[0];
        }

        return null;
    },

    async deleteDatabaseInstance(instanceId: string) {
        await db`
            DELETE FROM database_instances
            WHERE id = ${instanceId}
        `;
    },

    async logDeployment(log: {
        project_id?: string;
        instance_id?: string;
        log_type: string;
        message: string;
    }) {
        if (log.project_id) {
            await db`
                INSERT INTO deployment_logs (project_id, log_type, message)
                VALUES (${log.project_id}, ${log.log_type}, ${log.message})
            `;
        }
        // For database instances, we could create a separate log table or use the same one
    },

    async getLatestSystemMetrics() {
        const result = await db`
            SELECT * FROM system_metrics 
            ORDER BY recorded_at DESC 
            LIMIT 1
        `;
        return result[0] || null;
    },

    // Project management functions
    async findProjectByName(name: string) {
        const result = await db`
            SELECT * FROM projects WHERE name = ${name}
        `;
        return result[0] || null;
    },

    async createProject(project: {
        name: string;
        description?: string;
        github_url?: string;
        domain?: string;
        status?: string;
        tech_stack?: string[];
        created_at?: Date;
        updated_at?: Date;
        created_by?: number;
    }) {
        const result = await db`
            INSERT INTO projects (
                name, description, github_url, domain, status, tech_stack, 
                created_at, updated_at, created_by
            )
            VALUES (
                ${project.name}, 
                ${project.description || null},
                ${project.github_url || null}, 
                ${project.domain || null},
                ${project.status || 'inactive'}, 
                ${JSON.stringify(project.tech_stack || [])},
                ${project.created_at || new Date()}, 
                ${project.updated_at || new Date()},
                ${project.created_by || null}
            )
            RETURNING *
        `;
        return result[0];
    },

    async recordSystemMetrics(metrics: any) {
        try {
            await db`
                INSERT INTO system_metrics (
                    cpu_usage, memory_usage, disk_usage, active_projects,
                    uptime_seconds, cpu_cores, memory_used_bytes, memory_total_bytes,
                    disk_used_bytes, disk_total_bytes, hostname, boot_time,
                    process_count, load_average, network_connections, failed_login_attempts,
                    recorded_at
                ) VALUES (
                    ${metrics.cpu_usage}, ${metrics.memory_usage}, ${metrics.disk_usage}, 
                    ${metrics.active_projects}, ${metrics.uptime_seconds}, ${metrics.cpu_cores},
                    ${metrics.memory_used_bytes}, ${metrics.memory_total_bytes}, 
                    ${metrics.disk_used_bytes}, ${metrics.disk_total_bytes}, ${metrics.hostname},
                    ${metrics.boot_time}, ${metrics.process_count}, 
                    ${JSON.stringify(metrics.load_average)}, ${metrics.network_connections},
                    ${metrics.failed_login_attempts}, CURRENT_TIMESTAMP
                )
            `;
        } catch (error) {
            console.error('Failed to record system metrics:', error);
        }
    }
};

// Additional utility functions for raw queries
export async function query(sql: string, params: any[] = []) {
    return await db.unsafe(sql, params);
}

export async function execute(sql: string, params: any[] = []) {
    return await db.unsafe(sql, params);
}
