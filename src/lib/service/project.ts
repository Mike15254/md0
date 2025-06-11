import { db } from '../server/database.js';
import { BaseService } from './database.js';
import { githubService } from './github.js';
import { deploymentService } from './deployment.js';
import { domainService } from './domain.js';
import type { ServiceResponse, Project, BuildConfig, GitHubRepository } from './types.js';

/**
 * Project service for managing application projects
 */
export class ProjectService extends BaseService {
	/**
	 * Create a new project
	 */
	async createProject(params: {
		name: string;
		description?: string;
		repository_full_name: string;
		branch?: string;
		build_command?: string;
		start_command?: string;
		port?: number;
		runtime?: 'node' | 'python' | 'static' | 'php';
		tech_stack?: string[];
		environment_variables?: Record<string, string>;
		auto_deploy?: boolean;
		created_by: number;
	}): Promise<ServiceResponse<{ id: number }>> {
		try {
			const missing = this.validateRequired({
				name: params.name,
				repository_full_name: params.repository_full_name,
				created_by: params.created_by
			});

			if (missing.length > 0) {
				return this.createResponse(
					false,
					{ id: -1 },
					`Missing required fields: ${missing.join(', ')}`
				);
			}

			// Validate project name
			if (!/^[a-zA-Z0-9_-]+$/.test(params.name) || params.name.length < 3) {
				return this.createResponse(
					false,
					{ id: -1 },
					'Project name must be at least 3 characters and contain only letters, numbers, underscores, and hyphens'
				);
			}

			// Check if project name already exists for this user
			const existingProject = await this.executeQuery(
				db`SELECT id FROM projects WHERE name = ${params.name} AND created_by = ${params.created_by}`
			);

			if (existingProject.length > 0) {
				return this.createResponse(false, { id: -1 }, 'Project name already exists');
			}

			// Get GitHub repository
			const repoResponse = await githubService.getRepository(params.repository_full_name);
			if (!repoResponse.success || !repoResponse.data) {
				return this.createResponse(
					false,
					{ id: -1 },
					'Repository not found or not accessible through GitHub App'
				);
			}

			const repository = repoResponse.data;

			// Auto-detect build configuration if not provided
			const buildConfig = await this.detectBuildConfiguration(
				repository,
				params.branch || repository.default_branch,
				{
					build_command: params.build_command,
					start_command: params.start_command,
					runtime: params.runtime,
					tech_stack: params.tech_stack
				}
			);

			// Create project
			const result = await this.executeQuery(
				db`
                    INSERT INTO projects (
                        name, description, github_repository_id, branch,
                        build_command, start_command, port, runtime, tech_stack,
                        build_timeout, environment_variables, auto_deploy, created_by
                    )
                    VALUES (
                        ${params.name}, ${params.description || null}, ${repository.id},
                        ${params.branch || repository.default_branch}, ${buildConfig.build_command},
                        ${buildConfig.start_command}, ${params.port || buildConfig.port},
                        ${buildConfig.runtime}, ${buildConfig.tech_stack}, ${buildConfig.build_timeout},
                        ${JSON.stringify(params.environment_variables || {})},
                        ${params.auto_deploy !== false}, ${params.created_by}
                    )
                    RETURNING id
                `
			);

			const projectId = (result[0] as { id: number }).id;

			await this.logOperation('info', 'project_created', {
				id: projectId,
				name: params.name,
				repository: params.repository_full_name
			});

			return this.createResponse(
				true,
				{ id: projectId },
				undefined,
				'Project created successfully'
			);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Get projects for a user (or all if admin)
	 */
	async getProjects(userId?: number, includeDetails = false): Promise<ServiceResponse<any[]>> {
		try {
			let query;
			if (userId) {
				query = db`
                    SELECT 
                        p.id, p.name, p.description, p.branch, p.build_command, p.start_command,
                        p.port, p.runtime, p.tech_stack, p.status, p.container_id, p.auto_deploy,
                        p.environment_variables, p.created_at, p.updated_at, p.last_deployed_at,
                        gr.full_name as repository_name, gr.html_url as repository_url,
                        gr.default_branch, gr.language as repository_language,
                        gr.description as repository_description, gr.private as repository_private,
                        u.username as created_by_username
                    FROM projects p
                    LEFT JOIN github_repositories gr ON p.github_repository_id = gr.id
                    LEFT JOIN users u ON p.created_by = u.id
                    WHERE p.created_by = ${userId}
                    ORDER BY p.updated_at DESC
                `;
			} else {
				query = db`
                    SELECT 
                        p.id, p.name, p.description, p.branch, p.build_command, p.start_command,
                        p.port, p.runtime, p.tech_stack, p.status, p.container_id, p.auto_deploy,
                        p.environment_variables, p.created_at, p.updated_at, p.last_deployed_at,
                        gr.full_name as repository_name, gr.html_url as repository_url,
                        gr.default_branch, gr.language as repository_language,
                        gr.description as repository_description, gr.private as repository_private,
                        u.username as created_by_username
                    FROM projects p
                    LEFT JOIN github_repositories gr ON p.github_repository_id = gr.id
                    LEFT JOIN users u ON p.created_by = u.id
                    ORDER BY p.updated_at DESC
                `;
			}

			const projects = (await this.executeQuery(query)) as Array<{
				id: number;
				[key: string]: any;
			}>;

			// Add additional details if requested
			if (includeDetails) {
				for (const project of projects) {
					// Get domains
					const domainsResponse = await domainService.getProjectDomains(project.id);
					project.domains = domainsResponse.data || [];

					// Get recent logs
					const logsResponse = await deploymentService.getProjectLogs(project.id, 10);
					project.recent_logs = logsResponse.data || [];

					// Get deployment stats
					const stats = await this.executeQuery(
						db`SELECT * FROM get_project_deployment_stats(${project.id})`
					);
					project.deployment_stats = stats[0] || {};
				}
			}

			return this.createResponse(true, projects);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Get a single project by ID
	 */
	async getProject(id: number, userId?: number): Promise<ServiceResponse<any>> {
		try {
			let query;
			if (userId) {
				query = db`
                    SELECT 
                        p.*, gr.full_name as repository_name, gr.html_url as repository_url,
                        gr.clone_url, gr.default_branch, gr.language as repository_language,
                        gr.description as repository_description, gr.private as repository_private,
                        u.username as created_by_username
                    FROM projects p
                    LEFT JOIN github_repositories gr ON p.github_repository_id = gr.id
                    LEFT JOIN users u ON p.created_by = u.id
                    WHERE p.id = ${id} AND p.created_by = ${userId}
                `;
			} else {
				query = db`
                    SELECT 
                        p.*, gr.full_name as repository_name, gr.html_url as repository_url,
                        gr.clone_url, gr.default_branch, gr.language as repository_language,
                        gr.description as repository_description, gr.private as repository_private,
                        u.username as created_by_username
                    FROM projects p
                    LEFT JOIN github_repositories gr ON p.github_repository_id = gr.id
                    LEFT JOIN users u ON p.created_by = u.id
                    WHERE p.id = ${id}
                `;
			}

			const projects = await this.executeQuery(query);

			if (projects.length === 0) {
				return this.createResponse(false, undefined, 'Project not found');
			}

			const project = projects[0] as { id: number; [key: string]: any };

			// Get additional details
			const domainsResponse = await domainService.getProjectDomains(project.id);
			project.domains = domainsResponse.data || [];

			const logsResponse = await deploymentService.getProjectLogs(project.id, 50);
			project.logs = logsResponse.data || [];

			const stats = await this.executeQuery(
				db`SELECT * FROM get_project_deployment_stats(${project.id})`
			);
			project.deployment_stats = stats[0] || {};

			return this.createResponse(true, project);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Update project configuration
	 */
	async updateProject(
		id: number,
		updates: {
			name?: string;
			description?: string;
			branch?: string;
			build_command?: string;
			start_command?: string;
			port?: number;
			runtime?: 'bun' | 'node' | 'static' | 'python';
			tech_stack?: string[];
			environment_variables?: Record<string, string>;
			auto_deploy?: boolean;
			build_timeout?: number;
		},
		userId?: number
	): Promise<ServiceResponse> {
		try {
			// Check if project exists and user has permission
			const projectResponse = await this.getProject(id, userId);
			if (!projectResponse.success) {
				return projectResponse;
			}

			// Build update query dynamically
			const updateFields = [];
			const values = [];
			let paramCounter = 1;

			for (const [key, value] of Object.entries(updates)) {
				if (value !== undefined) {
					if (key === 'environment_variables') {
						updateFields.push(`${key} = $${paramCounter}`);
						values.push(JSON.stringify(value));
					} else if (key === 'tech_stack') {
						updateFields.push(`${key} = $${paramCounter}`);
						values.push(value);
					} else {
						updateFields.push(`${key} = $${paramCounter}`);
						values.push(value);
					}
					paramCounter++;
				}
			}

			if (updateFields.length === 0) {
				return this.createResponse(false, undefined, 'No fields to update');
			}

			// Add updated_at
			updateFields.push('updated_at = CURRENT_TIMESTAMP');

			const query = `UPDATE projects SET ${updateFields.join(', ')} WHERE id = $${paramCounter}`;
			values.push(id);

			await this.executeQuery(db.unsafe(query, values));

			await this.logOperation('info', 'project_updated', { id, updates: Object.keys(updates) });

			return this.createResponse(true, undefined, undefined, 'Project updated successfully');
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Delete a project
	 */
	async deleteProject(id: number, userId?: number): Promise<ServiceResponse> {
		try {
			// Check if project exists and user has permission
			const projectResponse = await this.getProject(id, userId);
			if (!projectResponse.success) {
				return projectResponse;
			}

			const project = projectResponse.data;

			// Stop and remove container if running
			if (project.container_id) {
				await deploymentService.stopProject(id);
			}

			// Remove domains
			for (const domain of project.domains || []) {
				await domainService.deleteDomain(domain.id);
			}

			// Delete project (cascading will handle logs, etc.)
			await this.executeQuery(db`DELETE FROM projects WHERE id = ${id}`);

			await this.logOperation('info', 'project_deleted', { id, name: project.name });

			return this.createResponse(true, undefined, undefined, 'Project deleted successfully');
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Get project by name
	 */
	async getProjectByName(name: string, userId?: number): Promise<ServiceResponse<any>> {
		try {
			let query;
			if (userId) {
				query = db`
                    SELECT id FROM projects 
                    WHERE name = ${name} AND created_by = ${userId}
                `;
			} else {
				query = db`
                    SELECT id FROM projects 
                    WHERE name = ${name}
                `;
			}

			const projects = (await this.executeQuery(query)) as Array<{ id: number }>;

			if (projects.length === 0) {
				return this.createResponse(false, undefined, 'Project not found');
			}

			return await this.getProject(projects[0].id, userId);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Auto-detect build configuration from repository
	 */
	private async detectBuildConfiguration(
		repository: GitHubRepository,
		branch: string,
		overrides: {
			build_command?: string;
			start_command?: string;
			runtime?: string;
			tech_stack?: string[];
		}
	): Promise<BuildConfig> {
		const config: BuildConfig = {
			build_command: overrides.build_command || 'bun install && bun run build',
			start_command: overrides.start_command || 'bun start',
			port: 3000,
			runtime: (overrides.runtime as any) || 'node',
			tech_stack: overrides.tech_stack || [],
			build_timeout: 600
		};

		try {
			// Try to detect framework from repository language and package.json
			if (repository.language) {
				config.tech_stack.push(repository.language);
			}

			// Language-specific defaults
			switch (repository.language?.toLowerCase()) {
				case 'javascript':
				case 'typescript':
					config.runtime = 'node';
					config.tech_stack.push('Node.js');

					// Try to detect specific frameworks (would need API call to get package.json)
					// For now, use sensible defaults
					if (!overrides.build_command) {
						config.build_command = 'bun install && bun run build';
					}
					if (!overrides.start_command) {
						config.start_command = 'bun start';
					}
					break;

				case 'python':
					config.runtime = 'python';
					config.tech_stack.push('Python');
					config.port = 8000;

					if (!overrides.build_command) {
						config.build_command = 'pip install -r requirements.txt';
					}
					if (!overrides.start_command) {
						config.start_command = 'python app.py';
					}
					break;

				case 'php':
					config.runtime = 'php';
					config.tech_stack.push('PHP');
					config.port = 8080;

					if (!overrides.build_command) {
						config.build_command = 'composer install';
					}
					if (!overrides.start_command) {
						config.start_command = 'php -S 0.0.0.0:8080';
					}
					break;

				case 'html':
				case 'css':
					config.runtime = 'static';
					config.tech_stack.push('Static Site');
					config.port = 80;

					if (!overrides.build_command) {
						config.build_command = 'echo "Static site - no build required"';
					}
					if (!overrides.start_command) {
						config.start_command = 'nginx';
					}
					break;
			}

			// Remove duplicates from tech_stack
			config.tech_stack = [...new Set(config.tech_stack)];
		} catch (error) {
			console.warn('Failed to detect build configuration:', error);
		}

		return config;
	}

	/**
	 * Get project statistics
	 */
	async getProjectStats(): Promise<
		ServiceResponse<{
			total: number;
			by_status: Record<string, number>;
			by_runtime: Record<string, number>;
			recent_deployments: number;
		}>
	> {
		try {
			// Define types for query results
			interface StatusStat {
				status: string;
				count: string;
			}

			interface RuntimeStat {
				runtime: string;
				count: string;
			}

			interface DeploymentCount {
				count: string;
			}

			// Get total projects and breakdown by status
			const statusStats = (await this.executeQuery(
				db`
                    SELECT status, COUNT(*) as count
                    FROM projects
                    GROUP BY status
                `
			)) as StatusStat[];

			// Get breakdown by runtime
			const runtimeStats = (await this.executeQuery(
				db`
                    SELECT runtime, COUNT(*) as count
                    FROM projects
                    GROUP BY runtime
                `
			)) as RuntimeStat[];

			// Get recent deployments count (last 24 hours)
			const recentDeployments = (await this.executeQuery(
				db`
                    SELECT COUNT(DISTINCT deployment_id) as count
                    FROM deployment_logs
                    WHERE created_at > NOW() - INTERVAL '24 hours'
                `
			)) as DeploymentCount[];

			const byStatus: Record<string, number> = {};
			for (const stat of statusStats) {
				byStatus[stat.status] = parseInt(stat.count);
			}

			const byRuntime: Record<string, number> = {};
			for (const stat of runtimeStats) {
				byRuntime[stat.runtime] = parseInt(stat.count);
			}

			const total = Object.values(byStatus).reduce((sum, count) => sum + count, 0);

			return this.createResponse(true, {
				total,
				by_status: byStatus,
				by_runtime: byRuntime,
				recent_deployments: parseInt(recentDeployments[0]?.count || '0')
			});
		} catch (error) {
			return this.handleError(error);
		}
	}
}

export const projectService = new ProjectService();
