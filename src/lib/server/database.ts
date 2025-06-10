import postgres from 'postgres';
import { DATABASE_URL } from '$env/static/private';
import { randomUUID } from 'crypto';

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

    async updateProjectStatusOld(projectId: number, status: string, containerId?: string, processId?: number) {
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
        github_url: string;
        github_branch?: string;
        github_repository_id?: number;
        build_command?: string;
        start_command?: string;
        port?: number;
        custom_domain?: string;
        environment_variables?: Record<string, any>;
        runtime?: string;
        tech_stack?: string[];
        auto_deploy?: boolean;
        created_by: number;
    }) {
        const webhookSecret = randomUUID().replace(/-/g, '');
        const result = await db`
            INSERT INTO projects (
                name, description, github_url, github_branch, github_repository_id,
                build_command, start_command, port, custom_domain, environment_variables,
                runtime, tech_stack, auto_deploy, webhook_secret, created_by
            )
            VALUES (
                ${project.name}, 
                ${project.description || null},
                ${project.github_url}, 
                ${project.github_branch || 'main'},
                ${project.github_repository_id || null},
                ${project.build_command || 'bun install'},
                ${project.start_command || 'bun start'},
                ${project.port || null},
                ${project.custom_domain || null},
                ${JSON.stringify(project.environment_variables || {})},
                ${project.runtime || 'node'},
                ${project.tech_stack || []},
                ${project.auto_deploy !== false},
                ${webhookSecret},
                ${project.created_by}
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
    },

    // Settings Management
    async getSettings() {
        const result = await db`
            SELECT category, key, value, type FROM settings ORDER BY category, key
        `;
        return result;
    },

    async updateSetting(category: string, key: string, value: string, type: string = 'string') {
        await db`
            INSERT INTO settings (category, key, value, type) 
            VALUES (${category}, ${key}, ${value}, ${type})
            ON CONFLICT (category, key) 
            DO UPDATE SET value = ${value}, updated_at = CURRENT_TIMESTAMP
        `;
    },

    // Enhanced project queries
    async getProjectsByGitHubUrl(urls: string[]) {
        const result = await db`
            SELECT * FROM projects 
            WHERE github_url = ANY(${urls})
            ORDER BY created_at DESC
        `;
        return result;
    },

    async updateProjectStatus(projectId: number, status: string, containerId?: string, processId?: number, additionalFields?: Record<string, any>) {
        const updateData: any = {
            status,
            container_id: containerId || null,
            process_id: processId || null,
            updated_at: new Date(),
        };

        if (status === 'running') {
            updateData.last_deployed_at = new Date();
        }

        // Add any additional fields
        if (additionalFields) {
            Object.assign(updateData, additionalFields);
        }

        const result = await db`
            UPDATE projects 
            SET ${db(updateData)}
            WHERE id = ${projectId}
            RETURNING *
        `;
        return result[0];
    },

    async updateProject(projectId: number, updates: Partial<{
        name: string;
        description: string;
        build_command: string;
        start_command: string;
        port: number;
        custom_domain: string;
        runtime: string;
        auto_deploy: boolean;
        environment_variables: any;
    }>) {
        const result = await db`
            UPDATE projects 
            SET ${db(updates)}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ${projectId}
            RETURNING *
        `;
        return result[0];
    },

    // Webhook Events
    async logWebhookEvent(event: {
        project_id: number;
        event_type: string;
        event_action?: string;
        source_branch?: string;
        target_branch?: string;
        commit_sha?: string;
        commit_message?: string;
        author_name?: string;
        author_email?: string;
        payload: Record<string, any> | string;
        repository_name?: string;
        processed?: boolean;
    }) {
        const payloadData = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
        
        const result = await db`
            INSERT INTO webhook_events (
                project_id, event_type, event_action, source_branch, target_branch,
                commit_sha, commit_message, author_name, author_email, payload,
                repository_name, processed
            )
            VALUES (
                ${event.project_id}, ${event.event_type}, ${event.event_action || null},
                ${event.source_branch || null}, ${event.target_branch || null},
                ${event.commit_sha || null}, ${event.commit_message || null},
                ${event.author_name || null}, ${event.author_email || null},
                ${JSON.stringify(payloadData)}, ${event.repository_name || null},
                ${event.processed || false}
            )
            RETURNING *
        `;
        return result[0];
    },

    async markWebhookEventProcessed(eventId: number, deploymentTriggered: boolean = false) {
        await db`
            UPDATE webhook_events 
            SET processed = true, deployment_triggered = ${deploymentTriggered},
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ${eventId}
        `;
    },

    async getWebhookEvents(projectId: number, limit: number = 50) {
        const result = await db`
            SELECT * FROM webhook_events
            WHERE project_id = ${projectId}
            ORDER BY created_at DESC
            LIMIT ${limit}
        `;
        return result;
    },

    // Additional utility functions for raw queries
    async query(sql: string, params: any[] = []) {
        // This is for backward compatibility with the old query function
        const paramPlaceholders = params.map((_, index) => `$${index + 1}`);
        const query = sql.replace(/\$(\d+)/g, (match, num) => {
            const index = parseInt(num) - 1;
            return params[index];
        });
        return await db.unsafe(sql, params);
    },

    async execute(sql: string, params: any[] = []) {
        // This is for backward compatibility with the old execute function
        return await db.unsafe(sql, params);
    },

    // GitHub Credentials Management
    async createGitHubCredential(credential: {
        user_id: number;
        name: string;
        type: 'pat' | 'oauth' | 'ssh';
        token?: string;
        public_key?: string;
        private_key?: string;
        oauth_data?: Record<string, any>;
        scopes?: string[];
        expires_at?: Date;
    }) {
        const result = await db`
            INSERT INTO github_credentials (
                user_id, name, type, token, public_key, private_key,
                oauth_data, scopes, expires_at
            )
            VALUES (
                ${credential.user_id}, ${credential.name}, ${credential.type},
                ${credential.token || null}, ${credential.public_key || null},
                ${credential.private_key || null}, ${JSON.stringify(credential.oauth_data || {})},
                ${credential.scopes || []}, ${credential.expires_at || null}
            )
            RETURNING *
        `;
        return result[0];
    },

    async getGitHubCredentials(userId: number) {
        const result = await db`
            SELECT id, user_id, name, type, scopes, expires_at, is_active, created_at, updated_at
            FROM github_credentials
            WHERE user_id = ${userId} AND is_active = true
            ORDER BY created_at DESC
        `;
        return result;
    },

    async getGitHubCredential(credentialId: number) {
        const result = await db`
            SELECT * FROM github_credentials
            WHERE id = ${credentialId} AND is_active = true
        `;
        return result[0] || null;
    },

    async updateGitHubCredential(credentialId: number, updates: Partial<{
        name: string;
        token: string;
        scopes: string[];
        expires_at: Date;
    }>) {
        const result = await db`
            UPDATE github_credentials 
            SET ${db(updates)}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ${credentialId}
            RETURNING *
        `;
        return result[0];
    },

    async deleteGitHubCredential(credentialId: number) {
        await db`
            UPDATE github_credentials 
            SET is_active = false, updated_at = CURRENT_TIMESTAMP
            WHERE id = ${credentialId}
        `;
    },

    // GitHub App Installation Management
    async createGitHubAppInstallation(installation: {
        user_id?: number;
        installation_id: number;
        account_id?: number;
        account_login?: string;
        account_type?: string;
        permissions?: Record<string, string>;
        events?: string[];
        setup_action?: string;
    }) {
        const result = await db`
            INSERT INTO github_app_installations (
                user_id, installation_id, account_id, account_login, 
                account_type, permissions, events, setup_action
            )
            VALUES (
                ${installation.user_id || null}, ${installation.installation_id},
                ${installation.account_id || null}, ${installation.account_login || null},
                ${installation.account_type || null}, ${JSON.stringify(installation.permissions || {})},
                ${installation.events || []}, ${installation.setup_action || null}
            )
            ON CONFLICT (installation_id) DO UPDATE SET
                user_id = EXCLUDED.user_id,
                account_id = EXCLUDED.account_id,
                account_login = EXCLUDED.account_login,
                account_type = EXCLUDED.account_type,
                permissions = EXCLUDED.permissions,
                events = EXCLUDED.events,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `;
        return result[0];
    },

    async getGitHubAppInstallations(userId: number) {
        const result = await db`
            SELECT * FROM github_app_installations
            WHERE user_id = ${userId} AND is_active = true
            ORDER BY created_at DESC
        `;
        return result;
    },

    async getAllActiveGitHubAppInstallations() {
        const result = await db`
            SELECT * FROM github_app_installations
            WHERE is_active = true
            ORDER BY created_at DESC
        `;
        return result;
    },

    async getGitHubAppInstallation(installationId: number) {
        const result = await db`
            SELECT * FROM github_app_installations
            WHERE installation_id = ${installationId} AND is_active = true
        `;
        return result[0] || null;
    },

    async deleteGitHubAppInstallation(installationId: number) {
        const result = await db`
            UPDATE github_app_installations 
            SET is_active = false, updated_at = CURRENT_TIMESTAMP
            WHERE installation_id = ${installationId}
            RETURNING *
        `;
        return result[0];
    },

    async updateRepositoryAccess(installationId: number, repositoryId: number, hasAccess: boolean) {
        const result = await db`
            INSERT INTO github_repository_access (
                installation_id, repository_id, has_access
            )
            VALUES (${installationId}, ${repositoryId}, ${hasAccess})
            ON CONFLICT (installation_id, repository_id) DO UPDATE SET
                has_access = EXCLUDED.has_access,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `;
        return result[0];
    },

    async findInstallationForRepository(owner: string, repo: string) {
        // First try to find by stored repository information
        const result = await db`
            SELECT gai.* FROM github_app_installations gai
            JOIN github_repositories gr ON gai.installation_id = gr.installation_id
            WHERE gr.full_name = ${`${owner}/${repo}`} AND gai.is_active = true
            ORDER BY gai.created_at DESC
            LIMIT 1
        `;
        
        if (result.length > 0) {
            return result[0];
        }
        
        // Fallback: return the first available installation
        const fallbackResult = await db`
            SELECT * FROM github_app_installations
            WHERE is_active = true
            ORDER BY created_at DESC
            LIMIT 1
        `;
        return fallbackResult[0] || null;
    },

    // Get repository information from GitHub App installations
    async getGitHubAppRepository(owner: string, repo: string) {
        const result = await db`
            SELECT gr.*, gai.account_login, gai.account_type 
            FROM github_repositories gr
            JOIN github_app_installations gai ON gr.installation_id = gai.installation_id
            WHERE gr.full_name = ${`${owner}/${repo}`} AND gai.is_active = true
            ORDER BY gr.updated_at DESC
            LIMIT 1
        `;
        return result[0] || null;
    },

    // List all repositories accessible through GitHub App installations
    async getGitHubAppRepositories(userId?: number) {
        let query;
        if (userId) {
            query = db`
                SELECT gr.*, gai.account_login, gai.account_type 
                FROM github_repositories gr
                JOIN github_app_installations gai ON gr.installation_id = gai.installation_id
                WHERE gai.user_id = ${userId} AND gai.is_active = true
                ORDER BY gr.full_name ASC
            `;
        } else {
            query = db`
                SELECT gr.*, gai.account_login, gai.account_type 
                FROM github_repositories gr
                JOIN github_app_installations gai ON gr.installation_id = gai.installation_id
                WHERE gai.is_active = true
                ORDER BY gr.full_name ASC
            `;
        }
        return await query;
    },

    // Get repository by database ID
    async getGitHubRepositoryById(repositoryId: number) {
        const result = await db`
            SELECT gr.*, gai.account_login, gai.account_type 
            FROM github_repositories gr
            JOIN github_app_installations gai ON gr.installation_id = gai.installation_id
            WHERE gr.id = ${repositoryId} AND gai.is_active = true
        `;
        return result[0] || null;
    },

    // Domain Management
    async createDomain(domain: {
        project_id: number;
        domain_name: string;
        subdomain?: string;
        ssl_enabled?: boolean;
        dns_configured?: boolean;
    }) {
        const result = await db`
            INSERT INTO domains (
                project_id, domain_name, subdomain, ssl_enabled, dns_configured
            )
            VALUES (
                ${domain.project_id}, ${domain.domain_name}, ${domain.subdomain || null},
                ${domain.ssl_enabled !== false}, ${domain.dns_configured || false}
            )
            RETURNING *
        `;
        return result[0];
    },

    async getDomains(projectId: number) {
        const result = await db`
            SELECT * FROM domains
            WHERE project_id = ${projectId} AND is_active = true
            ORDER BY created_at DESC
        `;
        return result;
    },

    async getDomain(domainId: number) {
        const result = await db`
            SELECT * FROM domains
            WHERE id = ${domainId} AND is_active = true
        `;
        return result[0] || null;
    },

    async updateDomain(domainId: number, updates: Partial<{
        ssl_enabled: boolean;
        dns_configured: boolean;
        ssl_certificate_path: string;
        ssl_private_key_path: string;
        verification_status: string;
        last_verified_at: Date;
    }>) {
        const result = await db`
            UPDATE domains 
            SET ${db(updates)}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ${domainId}
            RETURNING *
        `;
        return result[0];
    },

    async deleteDomain(domainId: number) {
        await db`
            UPDATE domains 
            SET is_active = false, updated_at = CURRENT_TIMESTAMP
            WHERE id = ${domainId}
        `;
    },

    async deleteProject(projectId: number) {
        // First delete related records
        await db`DELETE FROM deployment_logs WHERE project_id = ${projectId}`;
        await db`DELETE FROM domains WHERE project_id = ${projectId}`;
        
        // Then delete the project
        const result = await db`
            DELETE FROM projects 
            WHERE id = ${projectId}
            RETURNING *
        `;
        return result[0];
    }
};
