import { db } from '../server/database.js';
import type { ServiceResponse } from './types.js';

/**
 * Base service class with common database operations and error handling
 */
export abstract class BaseService {
	protected async executeQuery<T>(query: any): Promise<T[]> {
		try {
			return await query;
		} catch (error) {
			console.error('Database query error:', error);
			throw new Error('Database operation failed');
		}
	}

	protected createResponse<T>(
		success: boolean,
		data?: T,
		error?: string,
		message?: string
	): ServiceResponse<T> {
		return {
			success,
			data,
			error,
			message
		};
	}

	protected handleError(error: unknown): ServiceResponse {
		const message = error instanceof Error ? error.message : 'Unknown error occurred';
		console.error('Service error:', error);
		return this.createResponse(false, undefined, message);
	}

	protected validateRequired(fields: Record<string, any>): string[] {
		const missing: string[] = [];
		for (const [key, value] of Object.entries(fields)) {
			if (value === undefined || value === null || value === '') {
				missing.push(key);
			}
		}
		return missing;
	}

	protected async logOperation(
		type: 'info' | 'error' | 'warn',
		operation: string,
		details?: Record<string, any>
	): Promise<void> {
		// Skip logging during tests
		if (process.env.NODE_ENV === 'test' || process.env.BUN_TEST === '1') {
			return;
		}
		
		try {
			await db`
                INSERT INTO service_logs (type, operation, details, created_at)
                VALUES (${type}, ${operation}, ${JSON.stringify(details || {})}, CURRENT_TIMESTAMP)
            `;
		} catch (error) {
			console.error('Failed to log operation:', error);
		}
	}

	/**
	 * Generate a secure random password
	 */
	protected generateSecurePassword(): string {
		const { randomBytes } = require('crypto');
		return randomBytes(16).toString('hex');
	}
}

/**
 * Database service for managing PostgreSQL and PocketBase instances
 */
export class DatabaseService extends BaseService {
	/**
	 * Create a new database instance
	 */
	async createInstance(params: {
		name: string;
		type: 'postgresql' | 'pocketbase';
		version?: string;
		port?: number;
		memory_limit?: number;
		storage_limit?: number;
		created_by: number;
		config?: Record<string, any>;
	}): Promise<ServiceResponse<{ id: number } | undefined>> {
		try {
			const missing = this.validateRequired({
				name: params.name,
				type: params.type,
				created_by: params.created_by
			});

			if (missing.length > 0) {
				return this.createResponse(
					false,
					undefined,
					`Missing required fields: ${missing.join(', ')}`
				);
			}

			// Check if name already exists for this user
			const existing = await this.executeQuery(
				db`SELECT id FROM database_instances WHERE name = ${params.name} AND created_by = ${params.created_by}`
			);

			if (existing.length > 0) {
				return this.createResponse(
					false,
					undefined,
					'Database instance with this name already exists'
				);
			}
		// Generate available port
		const port = params.port || (await this.getAvailablePort(params.type));

		// Set up default configuration based on database type
		let defaultConfig = {};
		if (params.type === 'postgresql') {
			defaultConfig = {
				database_name: params.name,
				username: 'postgres',
				password: this.generateSecurePassword(),
				...params.config
			};
		} else if (params.type === 'pocketbase') {
			defaultConfig = {
				admin_email: `admin@${params.name}.local`,
				admin_password: this.generateSecurePassword(),
				cors_enabled: true,
				logs_enabled: true,
				...params.config
			};
		}

		const result = await this.executeQuery<{ id: number }>(
			db`
                INSERT INTO database_instances (
                    name, type, version, port, memory_limit, storage_limit,
                    created_by, config, status, backup_enabled
                )
                VALUES (
                    ${params.name}, ${params.type}, ${params.version || 'latest'},
                    ${port}, ${params.memory_limit || 512}, ${params.storage_limit || 1024},
                    ${params.created_by}, ${JSON.stringify(defaultConfig)}, 'stopped', false
                )
                RETURNING id
            `
		);

			await this.logOperation('info', 'database_instance_created', {
				id: result[0].id,
				name: params.name,
				type: params.type
			});

			return this.createResponse(
				true,
				{ id: result[0].id },
				undefined,
				'Database instance created successfully'
			);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Get database instances for a user
	 */
	async getInstances(userId: number): Promise<ServiceResponse<any[]>> {
		try {
			const instances = await this.executeQuery(
				db`
                    SELECT 
                        id, name, type, version, port, status, memory_limit, 
                        storage_limit, backup_enabled, last_backup, created_at, updated_at
                    FROM database_instances 
                    WHERE created_by = ${userId}
                    ORDER BY created_at DESC
                `
			);

			return this.createResponse(true, instances);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Start a database instance
	 */
	async startInstance(id: number, userId: number): Promise<ServiceResponse> {
		try {
			interface DatabaseInstance {
				name: string;
				type: string;
				port: number;
				config: any;
				created_by: number;
			}

			// Get instance details
			const instances = await this.executeQuery<DatabaseInstance>(
				db`
                    SELECT name, type, port, config, created_by 
                    FROM database_instances 
                    WHERE id = ${id}
                `
			);

			if (instances.length === 0) {
				return this.createResponse(false, undefined, 'Database instance not found');
			}

			const instance = instances[0];

			if (instance.created_by !== userId) {
				return this.createResponse(false, undefined, 'Permission denied');
			}

			// Update status to starting
			await this.executeQuery(
				db`UPDATE database_instances SET status = 'starting', updated_at = CURRENT_TIMESTAMP WHERE id = ${id}`
			);

			// Start the container based on type
			const containerId = await this.startDatabaseContainer(instance);

			// Update with container ID and running status
			await this.executeQuery(
				db`
                    UPDATE database_instances 
                    SET status = 'running', container_id = ${containerId}, updated_at = CURRENT_TIMESTAMP 
                    WHERE id = ${id}
                `
			);

			await this.logOperation('info', 'database_instance_started', { id, name: instance.name });

			return this.createResponse(
				true,
				undefined,
				undefined,
				'Database instance started successfully'
			);
		} catch (error) {
			// Set status to error on failure
			await this.executeQuery(
				db`UPDATE database_instances SET status = 'error', updated_at = CURRENT_TIMESTAMP WHERE id = ${id}`
			).catch(() => {});

			return this.handleError(error);
		}
	}

	/**
	 * Stop a database instance
	 */
	async stopInstance(id: number, userId: number): Promise<ServiceResponse> {
		try {
			interface DatabaseInstance {
				container_id: string;
				created_by: number;
				name: string;
			}

			const instances = await this.executeQuery<DatabaseInstance>(
				db`
                    SELECT container_id, created_by, name 
                    FROM database_instances 
                    WHERE id = ${id}
                `
			);

			if (instances.length === 0) {
				return this.createResponse(false, undefined, 'Database instance not found');
			}

			const instance = instances[0];

			if (instance.created_by !== userId) {
				return this.createResponse(false, undefined, 'Permission denied');
			}

			// Update status to stopping
			await this.executeQuery(
				db`UPDATE database_instances SET status = 'stopping', updated_at = CURRENT_TIMESTAMP WHERE id = ${id}`
			);

			// Stop the container
			if (instance.container_id) {
				await this.stopDatabaseContainer(instance.container_id);
			}

			// Update status to stopped
			await this.executeQuery(
				db`
                    UPDATE database_instances 
                    SET status = 'stopped', updated_at = CURRENT_TIMESTAMP 
                    WHERE id = ${id}
                `
			);

			await this.logOperation('info', 'database_instance_stopped', { id, name: instance.name });

			return this.createResponse(
				true,
				undefined,
				undefined,
				'Database instance stopped successfully'
			);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Delete a database instance
	 */
	async deleteInstance(id: number, userId: number): Promise<ServiceResponse> {
		try {
			interface DatabaseInstance {
				container_id: string;
				created_by: number;
				name: string;
				status: string;
			}

			const instances = await this.executeQuery<DatabaseInstance>(
				db`
                    SELECT container_id, created_by, name, status 
                    FROM database_instances 
                    WHERE id = ${id}
                `
			);

			if (instances.length === 0) {
				return this.createResponse(false, undefined, 'Database instance not found');
			}

			const instance = instances[0];

			if (instance.created_by !== userId) {
				return this.createResponse(false, undefined, 'Permission denied');
			}

			// Stop container if running
			if (instance.container_id && instance.status === 'running') {
				await this.stopDatabaseContainer(instance.container_id);
			}

			// Remove container and volumes
			if (instance.container_id) {
				await this.removeDatabaseContainer(instance.container_id);
			}

			// Delete from database
			await this.executeQuery(db`DELETE FROM database_instances WHERE id = ${id}`);

			await this.logOperation('info', 'database_instance_deleted', { id, name: instance.name });

			return this.createResponse(
				true,
				undefined,
				undefined,
				'Database instance deleted successfully'
			);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Create a backup of a database instance
	 */
	async createBackup(id: number, userId: number): Promise<ServiceResponse<{ backupId: string } | undefined>> {
		try {
			interface DatabaseInstance {
				name: string;
				type: string;
				created_by: number;
				backup_enabled: boolean;
				container_id: string;
				status: string;
			}

			const instances = await this.executeQuery<DatabaseInstance>(
				db`
                    SELECT name, type, created_by, backup_enabled, container_id, status
                    FROM database_instances 
                    WHERE id = ${id}
                `
			);

			if (instances.length === 0) {
				return this.createResponse(false, undefined, 'Database instance not found');
			}

			const instance = instances[0];

			if (instance.created_by !== userId) {
				return this.createResponse(false, undefined, 'Permission denied');
			}

			if (!instance.backup_enabled) {
				return this.createResponse(false, undefined, 'Backup is not enabled for this database');
			}

			// Generate backup ID
			const backupId = `backup_${id}_${Date.now()}`;

			// Create backup based on database type
			await this.createDatabaseBackup(instance, backupId);

			// Update last backup time
			await this.executeQuery(
				db`
                    UPDATE database_instances 
                    SET last_backup = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
                    WHERE id = ${id}
                `
			);

			await this.logOperation('info', 'database_backup_created', { 
				id, 
				name: instance.name, 
				backupId 
			});

			return this.createResponse(
				true,
				{ backupId },
				undefined,
				'Database backup created successfully'
			);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Get available port for database type
	 */
	private async getAvailablePort(type: 'postgresql' | 'pocketbase'): Promise<number> {
		interface PortRecord {
			port: number;
		}

		const basePort = type === 'postgresql' ? 5432 : 8090;
		const usedPorts = await this.executeQuery<PortRecord>(
			db`SELECT port FROM database_instances WHERE type = ${type}`
		);

		const ports = usedPorts.map((p) => p.port);
		let port = basePort;

		while (ports.includes(port)) {
			port++;
		}

		return port;
	}

	/**
	 * Start database container
	 */
	private async startDatabaseContainer(instance: any): Promise<string> {
		const { exec } = await import('child_process');
		const { promisify } = await import('util');
		const execAsync = promisify(exec);

		let dockerCommand: string;

		if (instance.type === 'postgresql') {
			dockerCommand = `docker run -d \
				--name ${instance.name}-postgres \
				--restart unless-stopped \
				-p ${instance.port}:5432 \
				-e POSTGRES_DB=${instance.config.database_name || 'app'} \
				-e POSTGRES_USER=${instance.config.username || 'postgres'} \
				-e POSTGRES_PASSWORD=${instance.config.password || 'password'} \
				-v ${instance.name}-postgres-data:/var/lib/postgresql/data \
				postgres:${instance.version || 'latest'}`;
		} else if (instance.type === 'pocketbase') {
			// For PocketBase, we'll build a custom image with the latest release
			await this.buildPocketBaseImage(instance);
			
			dockerCommand = `docker run -d \
				--name ${instance.name}-pocketbase \
				--restart unless-stopped \
				-p ${instance.port}:8080 \
				-v ${instance.name}-pocketbase-data:/pb_data \
				pocketbase-custom:${instance.name}`;
		} else {
			throw new Error(`Unsupported database type: ${instance.type}`);
		}

		const result = await execAsync(dockerCommand);
		return result.stdout.trim();
	}

	/**
	 * Stop database container
	 */
	private async stopDatabaseContainer(containerId: string): Promise<void> {
		const { exec } = await import('child_process');
		const { promisify } = await import('util');
		const execAsync = promisify(exec);

		await execAsync(`docker stop ${containerId}`);
	}

	/**
	 * Remove database container and volumes
	 */
	private async removeDatabaseContainer(containerId: string): Promise<void> {
		const { exec } = await import('child_process');
		const { promisify } = await import('util');
		const execAsync = promisify(exec);

		await execAsync(`docker rm -f ${containerId}`);
		// Note: Volumes are preserved for data safety
	}

	/**
	 * Create database backup
	 */
	private async createDatabaseBackup(instance: any, backupId: string): Promise<void> {
		const { exec } = await import('child_process');
		const { promisify } = await import('util');
		const execAsync = promisify(exec);

		const backupPath = `/backups/${backupId}`;

		if (instance.type === 'postgresql') {
			const command = `docker exec ${instance.container_id} pg_dump -U postgres ${instance.config?.database_name || 'app'} > ${backupPath}.sql`;
			await execAsync(command);
		} else if (instance.type === 'pocketbase') {
			const command = `docker exec ${instance.container_id} cp -r /pb_data ${backupPath}`;
			await execAsync(command);
		}
	}

	/**
	 * Build custom PocketBase image with latest release
	 */
	private async buildPocketBaseImage(instance: any): Promise<void> {
		const { exec } = await import('child_process');
		const { promisify } = await import('util');
		const { writeFile, mkdir } = await import('fs/promises');
		const execAsync = promisify(exec);

		// Create temporary build directory
		const buildDir = `/tmp/pocketbase-${instance.name}`;
		await mkdir(buildDir, { recursive: true });

		// Get latest PocketBase release version
		const latestVersion = await this.getLatestPocketBaseVersion();
		
		// Create Dockerfile for PocketBase
		const dockerfile = `FROM alpine:latest

# Install required packages
RUN apk add --no-cache ca-certificates wget unzip

# Set working directory
WORKDIR /pb

# Download and install PocketBase
RUN wget https://github.com/pocketbase/pocketbase/releases/download/v${latestVersion}/pocketbase_${latestVersion}_linux_amd64.zip && \\
    unzip pocketbase_${latestVersion}_linux_amd64.zip && \\
    rm pocketbase_${latestVersion}_linux_amd64.zip && \\
    chmod +x pocketbase

# Create data directory
RUN mkdir -p /pb_data

# Expose port
EXPOSE 8080

# Start PocketBase
CMD ["./pocketbase", "serve", "--http=0.0.0.0:8080"]
`;

		// Write Dockerfile
		await writeFile(`${buildDir}/Dockerfile`, dockerfile);

		// Build Docker image
		await execAsync(`docker build -t pocketbase-custom:${instance.name} ${buildDir}`);

		// Clean up build directory
		await execAsync(`rm -rf ${buildDir}`);
	}

	/**
	 * Get latest PocketBase version from GitHub releases
	 */
	private async getLatestPocketBaseVersion(): Promise<string> {
		try {
			const response = await fetch('https://api.github.com/repos/pocketbase/pocketbase/releases/latest');
			if (!response.ok) {
				throw new Error('Failed to fetch latest PocketBase version');
			}
			const data = await response.json();
			return data.tag_name.replace('v', ''); // Remove 'v' prefix
		} catch (error) {
			console.error('Error fetching PocketBase version:', error);
			return '0.22.0'; // Fallback version
		}
	}
}

export const databaseService = new DatabaseService();
