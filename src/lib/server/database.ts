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

    async createProject(project: {
        name: string;
        github_url: string;
        github_branch?: string;
        build_command?: string;
        start_command?: string;
        port?: number;
        environment_variables?: Record<string, string>;
        created_by: number;
    }) {
        const result = await db`
            INSERT INTO projects (
                name, github_url, github_branch, build_command, 
                start_command, port, environment_variables, created_by
            )
            VALUES (
                ${project.name}, ${project.github_url}, ${project.github_branch || 'main'},
                ${project.build_command || 'bun install && bun run build'},
                ${project.start_command || 'bun start'}, ${project.port || null},
                ${JSON.stringify(project.environment_variables || {})}, ${project.created_by}
            )
            RETURNING *
        `;
        return result[0];
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

    async recordSystemMetrics(metrics: {
        cpu_usage: number;
        memory_usage: number;
        disk_usage: number;
        active_projects: number;
        uptime_seconds: number;
    }) {
        await db`
            INSERT INTO system_metrics (cpu_usage, memory_usage, disk_usage, active_projects, uptime_seconds)
            VALUES (${metrics.cpu_usage}, ${metrics.memory_usage}, ${metrics.disk_usage}, 
                    ${metrics.active_projects}, ${metrics.uptime_seconds})
        `;
    },

    async getLatestSystemMetrics() {
        const result = await db`
            SELECT * FROM system_metrics 
            ORDER BY recorded_at DESC 
            LIMIT 1
        `;
        return result[0] || null;
    }
};

// Additional utility functions for raw queries
export async function query(sql: string, params: any[] = []) {
    return await db.unsafe(sql, params);
}

export async function execute(sql: string, params: any[] = []) {
    return await db.unsafe(sql, params);
}
