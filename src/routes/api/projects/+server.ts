import { json } from '@sveltejs/kit';
import { dbUtils } from '$lib/server/database.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ locals }) => {
    try {
        if (!locals.user) {
            return json({ error: 'Authentication required' }, { status: 401 });
        }

        const projects = await dbUtils.getProjects(locals.user.isAdmin ? undefined : Number(locals.user.id));
        
        // Enhance projects with additional repository information
        const enhancedProjects = await Promise.all(projects.map(async (project) => {
            let repoInfo = null;
            if (project.github_repository_id) {
                repoInfo = await dbUtils.getGitHubRepositoryById(project.github_repository_id);
            }
            
            return {
                ...project,
                repository_name: repoInfo?.full_name || project.github_url?.split('/').slice(-2).join('/') || null,
                repository_url: repoInfo?.html_url || project.github_url,
                repository_clone_url: repoInfo?.clone_url || project.github_url,
                repository_language: repoInfo?.language || null,
                repository_description: repoInfo?.description || project.description,
                is_private: repoInfo?.private || false
            };
        }));
        
        return json({
            success: true,
            data: enhancedProjects
        });
    } catch (error) {
        console.error('Get projects error:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};

export const POST: RequestHandler = async ({ request, locals }) => {
    try {
        if (!locals.user) {
            return json({ error: 'Authentication required' }, { status: 401 });
        }

        const requestData = await request.json();
        
        let { 
            name, 
            description,
            repository_url,
            branch = 'main',
            github_repository_id,
            build_command,
            start_command,
            port,
            custom_domain,
            environment_variables = {}
        } = requestData;
        
        let runtime = requestData.runtime || 'node';
        let tech_stack = requestData.tech_stack || [];
        let auto_deploy = requestData.auto_deploy !== false;

        if (!name || !repository_url) {
            return json({ error: 'Name and repository URL are required' }, { status: 400 });
        }

        // Validate GitHub URL
        try {
            const url = new URL(repository_url);
            if (url.hostname !== 'github.com') {
                return json({ error: 'Only GitHub repositories are supported' }, { status: 400 });
            }
        } catch {
            return json({ error: 'Invalid repository URL format' }, { status: 400 });
        }

        // Check if project name already exists for this user
        const existingProject = await dbUtils.findProjectByName(name);
        if (existingProject && existingProject.created_by === Number(locals.user.id)) {
            return json({ error: 'Project name already exists' }, { status: 400 });
        }

        // Validate GitHub repository if provided
        let repoInfo = null;
        if (github_repository_id) {
            const repository = await dbUtils.getGitHubRepositoryById(github_repository_id);
            if (!repository) {
                return json({ error: 'Invalid GitHub repository' }, { status: 400 });
            }
            repoInfo = repository;
        }

        // Auto-detect tech stack and set optimized build commands with Bun
        let detectedTechStack = tech_stack;
        let defaultBuildCommand = build_command;
        let defaultStartCommand = start_command;
        let detectedRuntime = runtime;

        if (repoInfo && !build_command) {
            // Try to detect framework from repository
            const repoPath = repository_url.replace('https://github.com/', '');
            
            // For now, we'll use a basic detection approach
            // In the future, this could be enhanced with GitHub App integration
            try {
                const packageJsonResponse = await fetch(`https://api.github.com/repos/${repoPath}/contents/package.json`);

                if (packageJsonResponse.ok) {
                    const packageJsonData = await packageJsonResponse.json();
                    const packageJson = JSON.parse(Buffer.from(packageJsonData.content, 'base64').toString());
                    
                    // Detect framework and set Bun-optimized commands
                    if (packageJson.dependencies) {
                        if (packageJson.dependencies.next) {
                            detectedTechStack = [...detectedTechStack, 'Next.js'];
                            defaultBuildCommand = defaultBuildCommand || 'bun install && bun run build';
                            defaultStartCommand = defaultStartCommand || 'bun start';
                            detectedRuntime = 'node';
                        } else if (packageJson.dependencies.svelte || packageJson.devDependencies?.['@sveltejs/kit']) {
                            detectedTechStack = [...detectedTechStack, 'SvelteKit'];
                            defaultBuildCommand = defaultBuildCommand || 'bun install && bun run build';
                            defaultStartCommand = defaultStartCommand || 'bun ./build/index.js';
                            detectedRuntime = 'node';
                        } else if (packageJson.dependencies.react) {
                            // Detect if it's Vite React or Create React App
                            if (packageJson.devDependencies?.vite || packageJson.dependencies?.vite) {
                                detectedTechStack = [...detectedTechStack, 'React', 'Vite'];
                                defaultBuildCommand = defaultBuildCommand || 'bun install && bun run build';
                                defaultStartCommand = defaultStartCommand || 'bun run preview';
                            } else {
                                detectedTechStack = [...detectedTechStack, 'React'];
                                defaultBuildCommand = defaultBuildCommand || 'bun install && bun run build';
                                defaultStartCommand = defaultStartCommand || 'bun start';
                            }
                            detectedRuntime = 'node';
                        } else if (packageJson.dependencies.vue) {
                            detectedTechStack = [...detectedTechStack, 'Vue.js'];
                            defaultBuildCommand = defaultBuildCommand || 'bun install && bun run build';
                            defaultStartCommand = defaultStartCommand || 'bun run preview';
                            detectedRuntime = 'node';
                        } else if (packageJson.dependencies.express || packageJson.dependencies.fastify || packageJson.dependencies.koa) {
                            detectedTechStack = [...detectedTechStack, 'Node.js API'];
                            defaultBuildCommand = defaultBuildCommand || 'bun install';
                            defaultStartCommand = defaultStartCommand || 'bun start';
                            detectedRuntime = 'node';
                        }
                    }
                }
            } catch (error) {
                console.log('Could not detect tech stack:', error);
            }
        }

        // Set runtime-specific defaults with Bun optimization
        if (!defaultBuildCommand || !defaultStartCommand) {
            switch (detectedRuntime) {
                case 'node':
                    defaultBuildCommand = defaultBuildCommand || 'bun install';
                    defaultStartCommand = defaultStartCommand || 'bun start';
                    break;
                case 'python':
                    defaultBuildCommand = defaultBuildCommand || 'pip install -r requirements.txt';
                    defaultStartCommand = defaultStartCommand || 'python app.py';
                    break;
                case 'static':
                    defaultBuildCommand = defaultBuildCommand || 'bun install && bun run build';
                    defaultStartCommand = defaultStartCommand || 'bun --bun serve -s build -p $PORT';
                    break;
                default:
                    defaultBuildCommand = defaultBuildCommand || 'bun install';
                    defaultStartCommand = defaultStartCommand || 'bun start';
            }
        }

        // Create project
        const project = await dbUtils.createProject({
            name,
            description,
            github_url: repository_url,
            github_branch: branch,
            github_repository_id,
            build_command: defaultBuildCommand,
            start_command: defaultStartCommand,
            port: port || (detectedRuntime === 'static' ? 80 : 3000),
            custom_domain,
            environment_variables,
            runtime: detectedRuntime,
            tech_stack: detectedTechStack,
            auto_deploy,
            created_by: Number(locals.user.id)
        });

        // Create domain if custom_domain is provided
        if (custom_domain) {
            try {
                await dbUtils.createDomain({
                    domain_name: custom_domain,
                    project_id: project.id,
                    ssl_enabled: true
                });
            } catch (error) {
                console.log('Could not create domain:', error);
            }
        }

        return json({
            success: true,
            data: project
        });
    } catch (error) {
        console.error('Create project error:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};
