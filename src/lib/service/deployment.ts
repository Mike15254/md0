import { db } from '../server/database.js';
import { BaseService } from './database.js';
import { githubService } from './github.js';
import type {
	ServiceResponse,
	Project,
	BuildConfig,
	DeploymentConfig,
	ProjectStatus,
	DeploymentLog
} from './types.js';

/**
 * Deployment service for managing Docker container deployments
 */
export class DeploymentService extends BaseService {
	private readonly projectsPath = '/var/projects';
	private readonly dockerSocket = '/var/run/docker.sock';

	/**
	 * Deploy a project
	 */
	async deployProject(projectId: number): Promise<ServiceResponse<{ deployment_id: string }>> {
		const deploymentId = crypto.randomUUID();

		try {
			// Get project details
			const project = await this.getProjectById(projectId);
			if (!project.success || !project.data) {
				return this.createResponse(false, { deployment_id: deploymentId }, 'Project not found');
			}

			const projectData = project.data;

			// Update project status
			await this.updateProjectStatus(projectId, 'building');
			await this.addDeploymentLog(projectId, deploymentId, 'info', 'Starting deployment...');

			// Clone repository
			await this.cloneRepository(projectData, deploymentId);

			// Build Docker image
			await this.buildDockerImage(projectData, deploymentId);

			// Stop existing container if running
			if (projectData.container_id) {
				await this.stopContainer(projectData.container_id);
			}

			// Start new container
			const containerId = await this.startContainer(projectData, deploymentId);

			// Update project with new container ID
			await this.executeQuery(
				db`
                    UPDATE projects 
                    SET container_id = ${containerId}, status = 'running', 
                        last_deployed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ${projectId}
                `
			);

			await this.addDeploymentLog(
				projectId,
				deploymentId,
				'info',
				'Deployment completed successfully'
			);

			return this.createResponse(
				true,
				{ deployment_id: deploymentId },
				undefined,
				'Deployment completed successfully'
			);
		} catch (error) {
			await this.updateProjectStatus(projectId, 'failed');
			await this.addDeploymentLog(
				projectId,
				deploymentId,
				'error',
				`Deployment failed: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
			return this.handleError(error);
		}
	}

	/**
	 * Start a stopped project
	 */
	async startProject(projectId: number): Promise<ServiceResponse> {
		try {
			const project = await this.getProjectById(projectId);
			if (!project.success || !project.data) {
				return this.createResponse(false, undefined, 'Project not found');
			}

			const projectData = project.data;

			if (projectData.status === 'running') {
				return this.createResponse(false, undefined, 'Project is already running');
			}

			if (projectData.container_id) {
				// Try to start existing container
				await this.startExistingContainer(projectData.container_id);
				await this.updateProjectStatus(projectId, 'running');
				return this.createResponse(true, undefined, undefined, 'Project started successfully');
			} else {
				// Deploy from scratch if no container exists
				return await this.deployProject(projectId);
			}
		} catch (error) {
			await this.updateProjectStatus(projectId, 'failed');
			return this.handleError(error);
		}
	}

	/**
	 * Stop a running project
	 */
	async stopProject(projectId: number): Promise<ServiceResponse> {
		try {
			const project = await this.getProjectById(projectId);
			if (!project.success || !project.data) {
				return this.createResponse(false, undefined, 'Project not found');
			}

			const projectData = project.data;

			if (projectData.status === 'stopped') {
				return this.createResponse(false, undefined, 'Project is already stopped');
			}

			if (projectData.container_id) {
				await this.stopContainer(projectData.container_id);
			}

			await this.updateProjectStatus(projectId, 'stopped');
			return this.createResponse(true, undefined, undefined, 'Project stopped successfully');
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Restart a project
	 */
	async restartProject(projectId: number): Promise<ServiceResponse> {
		try {
			await this.stopProject(projectId);
			// Add a small delay
			await new Promise((resolve) => setTimeout(resolve, 2000));
			return await this.startProject(projectId);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Get project logs
	 */
	async getProjectLogs(projectId: number, limit = 100): Promise<ServiceResponse<DeploymentLog[]>> {
		try {
			const logs = await this.executeQuery(
				db`
                    SELECT id, deployment_id, type, level, message, metadata, created_at
                    FROM deployment_logs 
                    WHERE project_id = ${projectId}
                    ORDER BY created_at DESC
                    LIMIT ${limit}
                `
			);

			return this.createResponse(true, logs as DeploymentLog[]);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Get container stats
	 */
	async getContainerStats(containerId: string): Promise<ServiceResponse<any>> {
		try {
			const { exec } = await import('child_process');
			const { promisify } = await import('util');
			const execAsync = promisify(exec);

			const result = await execAsync(
				`docker stats ${containerId} --no-stream --format "table {{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"`
			);

			const lines = result.stdout.trim().split('\n');
			if (lines.length < 2) {
				throw new Error('Container not found or not running');
			}

			const stats = lines[1].split('\t');
			return this.createResponse(true, {
				cpu_usage: stats[0],
				memory_usage: stats[1],
				network_io: stats[2],
				block_io: stats[3]
			});
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Clone repository using GitHub App token
	 */
	private async cloneRepository(project: any, deploymentId: string): Promise<void> {
		const projectPath = `${this.projectsPath}/${project.name}`;

		await this.addDeploymentLog(
			project.id,
			deploymentId,
			'info',
			`Cloning repository ${project.github_repository.full_name}...`
		);

		// Get GitHub App installation token
		const installation = await githubService.findInstallationForRepository(
			project.github_repository.full_name.split('/')[0],
			project.github_repository.full_name.split('/')[1]
		);

		if (!installation.success || !installation.data) {
			throw new Error('GitHub App installation not found for repository');
		}

		const token = await githubService.getInstallationToken(installation.data.installation_id);

		// Prepare clone command
		const { exec } = await import('child_process');
		const { promisify } = await import('util');
		const execAsync = promisify(exec);

		// Ensure parent directory exists
		await execAsync(`sudo mkdir -p ${this.projectsPath}`);
		await execAsync(`sudo chown -R $USER:$USER ${this.projectsPath}`);

		// Remove existing directory
		await execAsync(`rm -rf ${projectPath}`).catch(() => {});

		// Clone with authentication
		const cloneUrl = project.github_repository.clone_url.replace(
			'https://github.com/',
			`https://${token}@github.com/`
		);

		await execAsync(`git clone -b ${project.branch} ${cloneUrl} ${projectPath}`);

		// Remove sensitive info from git config
		await execAsync(
			`cd ${projectPath} && git remote set-url origin ${project.github_repository.clone_url}`
		);

		await this.addDeploymentLog(project.id, deploymentId, 'info', 'Repository cloned successfully');
	}

	/**
	 * Build Docker image for project
	 */
	private async buildDockerImage(project: any, deploymentId: string): Promise<void> {
		const projectPath = `${this.projectsPath}/${project.name}`;

		await this.addDeploymentLog(project.id, deploymentId, 'info', 'Building Docker image...');

		// Create Dockerfile if not exists
		await this.ensureDockerfile(project, projectPath);

		const { exec } = await import('child_process');
		const { promisify } = await import('util');
		const execAsync = promisify(exec);

		// Build Docker image
		const imageName = `md0-${project.name.toLowerCase()}:latest`;
		await execAsync(`cd ${projectPath} && docker build -t ${imageName} .`);

		await this.addDeploymentLog(
			project.id,
			deploymentId,
			'info',
			'Docker image built successfully'
		);
	}

	/**
	 * Start Docker container
	 */
	private async startContainer(project: any, deploymentId: string): Promise<string> {
		await this.addDeploymentLog(project.id, deploymentId, 'info', 'Starting container...');

		const { exec } = await import('child_process');
		const { promisify } = await import('util');
		const execAsync = promisify(exec);

		const imageName = `md0-${project.name.toLowerCase()}:latest`;
		const containerName = `md0-${project.name.toLowerCase()}`;

		// Remove existing container if exists
		await execAsync(`docker rm -f ${containerName}`).catch(() => {});

		// Prepare environment variables
		const envVars = Object.entries(project.environment_variables || {})
			.map(([key, value]) => `-e ${key}="${value}"`)
			.join(' ');

		// Start container
		const dockerCommand = `docker run -d \
            --name ${containerName} \
            --restart unless-stopped \
            -p ${project.build_config.port}:${project.build_config.port} \
            ${envVars} \
            ${imageName}`;

		const result = await execAsync(dockerCommand);
		const containerId = result.stdout.trim();

		await this.addDeploymentLog(project.id, deploymentId, 'info', 'Container started successfully');

		return containerId;
	}

	/**
	 * Stop Docker container
	 */
	private async stopContainer(containerId: string): Promise<void> {
		const { exec } = await import('child_process');
		const { promisify } = await import('util');
		const execAsync = promisify(exec);

		await execAsync(`docker stop ${containerId}`);
	}

	/**
	 * Start existing Docker container
	 */
	private async startExistingContainer(containerId: string): Promise<void> {
		const { exec } = await import('child_process');
		const { promisify } = await import('util');
		const execAsync = promisify(exec);

		await execAsync(`docker start ${containerId}`);
	}

	/**
	 * Ensure Dockerfile exists for project
	 */
	private async ensureDockerfile(project: any, projectPath: string): Promise<void> {
		const { access, writeFile } = await import('fs/promises');
		const { constants } = await import('fs');
		const path = await import('path');

		const dockerfilePath = path.join(projectPath, 'Dockerfile');

		try {
			await access(dockerfilePath, constants.F_OK);
			return; // Dockerfile exists
		} catch {
			// Create Dockerfile based on runtime
			const dockerfile = this.generateDockerfile(project.build_config);
			await writeFile(dockerfilePath, dockerfile);
		}
	}

	/**
	 * Generate Dockerfile based on project configuration
	 */
	private generateDockerfile(buildConfig: BuildConfig): string {
		switch (buildConfig.runtime) {
			case 'node':
				return `# Node.js with Bun
FROM oven/bun:latest

WORKDIR /app

# Copy package files
COPY package*.json bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build application
RUN ${buildConfig.build_command}

# Expose port
EXPOSE ${buildConfig.port}

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD curl -f http://localhost:${buildConfig.port}/health || exit 1

# Start application
CMD ${buildConfig.start_command}`;

			case 'python':
				return `# Python application
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \\
    curl \\
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt* ./

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Expose port
EXPOSE ${buildConfig.port}

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD curl -f http://localhost:${buildConfig.port}/health || exit 1

# Start application
CMD ${buildConfig.start_command}`;

			case 'static':
				return `# Static file server with Nginx
FROM nginx:alpine

# Copy built files to nginx
COPY dist/ /usr/share/nginx/html/
COPY build/ /usr/share/nginx/html/

# Create nginx config
RUN echo 'server { \\
    listen ${buildConfig.port}; \\
    location / { \\
        root /usr/share/nginx/html; \\
        index index.html index.htm; \\
        try_files $uri $uri/ /index.html; \\
    } \\
    location /health { \\
        return 200 "OK"; \\
        add_header Content-Type text/plain; \\
    } \\
}' > /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE ${buildConfig.port}

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD curl -f http://localhost:${buildConfig.port}/health || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]`;

			default:
				return `# Generic application
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build if needed
RUN ${buildConfig.build_command}

# Expose port
EXPOSE ${buildConfig.port}

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD curl -f http://localhost:${buildConfig.port}/health || exit 1

# Start application
CMD ${buildConfig.start_command}`;
		}
	}

	/**
	 * Get project by ID with full details
	 */
	private async getProjectById(projectId: number): Promise<ServiceResponse<any>> {
		try {
			const projects = await this.executeQuery(
				db`
                    SELECT 
                        p.*,
                        gr.repository_id, gr.name as repo_name, gr.full_name, 
                        gr.clone_url, gr.html_url, gr.default_branch, gr.private,
                        gr.language, gr.description as repo_description
                    FROM projects p
                    JOIN github_repositories gr ON p.github_repository_id = gr.id
                    WHERE p.id = ${projectId}
                `
			);

			if (projects.length === 0) {
				return this.createResponse(false, undefined, 'Project not found');
			}

			// Add type assertion to help TypeScript understand the structure
			const project = projects[0] as {
				repository_id: number;
				repo_name: string;
				full_name: string;
				clone_url: string;
				html_url: string;
				default_branch: string;
				private: boolean;
				language: string;
				repo_description: string;
				[key: string]: any; // Allow other properties
			};

			// Structure the response
			const structuredProject = {
				...(project as Record<string, any>),
				github_repository: {
					id: project.repository_id,
					name: project.repo_name,
					full_name: project.full_name,
					clone_url: project.clone_url,
					html_url: project.html_url,
					default_branch: project.default_branch,
					private: project.private,
					language: project.language,
					description: project.repo_description
				},
				build_config: {
					build_command: project.build_command,
					start_command: project.start_command,
					port: project.port,
					runtime: project.runtime,
					tech_stack: project.tech_stack,
					build_timeout: project.build_timeout || 600
				}
			};

			return this.createResponse(true, structuredProject);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Update project status
	 */
	private async updateProjectStatus(projectId: number, status: ProjectStatus): Promise<void> {
		await this.executeQuery(
			db`
                UPDATE projects 
                SET status = ${status}, updated_at = CURRENT_TIMESTAMP 
                WHERE id = ${projectId}
            `
		);
	}

	/**
	 * Add deployment log entry
	 */
	private async addDeploymentLog(
		projectId: number,
		deploymentId: string,
		level: 'debug' | 'info' | 'warn' | 'error',
		message: string
	): Promise<void> {
		await this.executeQuery(
			db`
                INSERT INTO deployment_logs (project_id, deployment_id, type, level, message)
                VALUES (${projectId}, ${deploymentId}, 'build', ${level}, ${message})
            `
		);
	}
}

export const deploymentService = new DeploymentService();
