import { json, type RequestEvent } from '@sveltejs/kit';
import { dbUtils } from '$lib/server/database.js';
import { githubAppService } from '$lib/server/github-app.js';
import { ProjectDetector, PROJECT_TEMPLATES, PROJECT_TYPES } from '$lib/project-templates.js';

export const GET = async ({ locals, url }: RequestEvent) => {
	try {
		if (!locals.user) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}

		// Check if requesting project templates/types
		const getTemplates = url.searchParams.get('templates');
		if (getTemplates === 'true') {
			return json({
				success: true,
				data: {
					templates: PROJECT_TEMPLATES,
					types: PROJECT_TYPES,
					runtimes: ['bun', 'node', 'python', 'deno', 'go', 'static'],
					api_endpoints: {
						projects: '/api/new/projects',
						project_detail: '/api/new/projects/{id}',
						project_deploy: '/api/new/projects/{id}/deploy',
						project_logs: '/api/new/projects/{id}/logs',
						project_env: '/api/new/projects/{id}/env',
						project_restart: '/api/new/projects/{id}/restart',
						project_stop: '/api/new/projects/{id}/stop',
						project_stats: '/api/new/projects/stats'
					}
				}
			});
		}

		const limit = parseInt(url.searchParams.get('limit') || '20');
		const offset = parseInt(url.searchParams.get('offset') || '0');
		const user = locals.user;

		const projects = await dbUtils.getProjects();
		const userProjects = user.isAdmin ? 
			projects : 
			projects.filter(p => p.created_by === user.id);

		const paginatedProjects = userProjects.slice(offset, offset + limit);

		const enhancedProjects = await Promise.all(paginatedProjects.map(async (project: any) => {
			if (project.github_repository_id) {
				const repoInfo = await dbUtils.getGitHubRepository(project.github_repository_id);
				return {
					...project,
					repository: repoInfo,
					status_display: project.status.charAt(0).toUpperCase() + project.status.slice(1)
				};
			}
			return {
				...project,
				status_display: project.status.charAt(0).toUpperCase() + project.status.slice(1)
			};
		}));

		return json({
			success: true,
			data: enhancedProjects,
			pagination: {
				total: userProjects.length,
				limit,
				offset,
				hasMore: offset + limit < userProjects.length
			}
		});
	} catch (error) {
		console.error('Get projects error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

export const POST = async ({ request, locals }: RequestEvent) => {
	try {
		if (!locals.user) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}

		const {
			name,
			description,
			repository_url,
			branch = 'main',
			github_repository_id,
			build_command,
			start_command,
			port,
			custom_domain,
			environment_variables = {},
			runtime,
			tech_stack = [],
			auto_deploy = true,
			project_type, // 'api', 'web', 'static'
			template // Specific template from PROJECT_TEMPLATES
		} = await request.json();

		if (!name || !repository_url) {
			return json({ error: 'Name and repository URL required' }, { status: 400 });
		}

		const existingProject = await dbUtils.findProjectByName(name);
		if (existingProject && existingProject.created_by === Number(locals.user.id)) {
			return json({ error: 'Project name already exists' }, { status: 409 });
		}

		// Enhanced auto-detection with GitHub API
		let detectedTemplate = PROJECT_TEMPLATES['bun-api']; // Default to Bun API
		let packageJson = null;
		
		// Try to fetch package.json for better detection
		try {
			const repoPath = repository_url.replace('https://github.com/', '');
			const packageJsonResponse = await fetch(`https://api.github.com/repos/${repoPath}/contents/package.json`);
			
			if (packageJsonResponse.ok) {
				const packageJsonData = await packageJsonResponse.json();
				packageJson = JSON.parse(Buffer.from(packageJsonData.content, 'base64').toString());
			}
		} catch (error) {
			console.log('Could not fetch package.json for auto-detection:', error);
		}
		
		// Use specific template if provided, otherwise auto-detect
		if (template && PROJECT_TEMPLATES[template]) {
			detectedTemplate = PROJECT_TEMPLATES[template];
		} else {
			detectedTemplate = await ProjectDetector.detectProjectType(repository_url, packageJson);
		}
		
		// Override with user-specified runtime if provided
		const finalRuntime = runtime || detectedTemplate.runtime;
		const optimizedCommands = ProjectDetector.getOptimizedCommands(detectedTemplate, finalRuntime);
		
		// Merge environment variables
		const finalEnvironmentVariables = {
			...detectedTemplate.environment,
			...environment_variables
		};
		
		// Set project type based on template or explicit type
		const finalProjectType = project_type || detectedTemplate.projectType;
		
		// Add project type to tech stack
		const finalTechStack = [
			...tech_stack,
			detectedTemplate.name,
			finalRuntime.toUpperCase(),
			finalProjectType.toUpperCase()
		].filter((item, index, arr) => arr.indexOf(item) === index); // Remove duplicates

		const project = await dbUtils.createProject({
			name,
			description: description || detectedTemplate.description,
			github_url: repository_url,
			github_branch: branch,
			github_repository_id,
			build_command: build_command || optimizedCommands.buildCommand,
			start_command: start_command || optimizedCommands.startCommand,
			port: port || detectedTemplate.defaultPort,
			custom_domain,
			environment_variables: finalEnvironmentVariables,
			runtime: finalRuntime,
			tech_stack: finalTechStack,
			auto_deploy,
			created_by: Number(locals.user.id)
		});

		// Enhanced project response with template info
		const enhancedProject = {
			...project,
			template_used: detectedTemplate.name,
			project_type: finalProjectType,
			runtime_optimized: finalRuntime === 'bun',
			auto_detected: !template && !runtime
		};

		if (custom_domain) {
			try {
				await dbUtils.createDomain({
					domain_name: custom_domain,
					project_id: project.id,
					ssl_enabled: true
				});
			} catch (error) {
				console.warn('Failed to create domain:', error);
			}
		}

		return json({
			success: true,
			data: enhancedProject,
			project: enhancedProject,
			template_info: {
				name: detectedTemplate.name,
				description: detectedTemplate.description,
				runtime: finalRuntime,
				project_type: finalProjectType,
				optimized_for_bun: finalRuntime === 'bun'
			}
		}, { status: 201 });
	} catch (error: any) {
		console.error('Create project error:', error);
		console.error('Error details:', {
			message: error.message,
			stack: error.stack,
			code: error.code
		});
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
