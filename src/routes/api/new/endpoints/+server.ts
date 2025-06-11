import { json, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ locals }) => {
    try {
        if (!locals.user) {
            return json({ error: 'Authentication required' }, { status: 401 });
        }

        const endpoints = {
            authentication: {
                login: {
                    method: 'POST',
                    path: '/api/new/auth/login',
                    description: 'Authenticate user with username/password',
                    body: { username: 'string', password: 'string' }
                },
                register: {
                    method: 'POST', 
                    path: '/api/new/auth/register',
                    description: 'Register new user account',
                    body: { username: 'string', password: 'string', email: 'string' }
                },
                logout: {
                    method: 'POST',
                    path: '/api/new/auth/logout',
                    description: 'End user session'
                },
                session: {
                    method: 'GET',
                    path: '/api/new/auth/session',
                    description: 'Get current session info'
                }
            },
            projects: {
                list: {
                    method: 'GET',
                    path: '/api/new/projects',
                    description: 'List user projects with pagination',
                    query: { limit: 'number', offset: 'number', templates: 'boolean' }
                },
                create: {
                    method: 'POST',
                    path: '/api/new/projects',
                    description: 'Create new project with auto-detection',
                    body: {
                        name: 'string',
                        repository_url: 'string',
                        description: 'string?',
                        runtime: 'bun|node|python|deno|go|static?',
                        project_type: 'api|web|static?',
                        template: 'string?',
                        port: 'number?',
                        environment_variables: 'object?'
                    }
                },
                detail: {
                    method: 'GET',
                    path: '/api/new/projects/{id}',
                    description: 'Get project details by ID or name'
                },
                update: {
                    method: 'PATCH|PUT',
                    path: '/api/new/projects/{id}',
                    description: 'Update project configuration',
                    body: { 'any_project_field': 'mixed' }
                },
                delete: {
                    method: 'DELETE',
                    path: '/api/new/projects/{id}',
                    description: 'Delete project and cleanup resources'
                },
                deploy: {
                    method: 'POST',
                    path: '/api/new/projects/{id}/deploy',
                    description: 'Trigger project deployment'
                },
                restart: {
                    method: 'POST',
                    path: '/api/new/projects/{id}/restart',
                    description: 'Restart running project'
                },
                stop: {
                    method: 'POST',
                    path: '/api/new/projects/{id}/stop',
                    description: 'Stop running project'
                },
                logs: {
                    method: 'GET',
                    path: '/api/new/projects/{id}/logs',
                    description: 'Get deployment and runtime logs'
                },
                environment: {
                    method: 'PATCH',
                    path: '/api/new/projects/{id}/env',
                    description: 'Update environment variables',
                    body: { environment_variables: 'object' }
                },
                stats: {
                    method: 'GET',
                    path: '/api/new/projects/stats',
                    description: 'Get project statistics and metrics'
                }
            },
            databases: {
                list: {
                    method: 'GET',
                    path: '/api/new/databases',
                    description: 'List database instances'
                },
                create: {
                    method: 'POST',
                    path: '/api/new/databases',
                    description: 'Create new database instance',
                    body: {
                        name: 'string',
                        type: 'postgresql|pocketbase',
                        memory_limit: 'number?',
                        storage_limit: 'number?'
                    }
                },
                detail: {
                    method: 'GET',
                    path: '/api/new/databases/{id}',
                    description: 'Get database instance details'
                },
                update: {
                    method: 'PATCH|PUT',
                    path: '/api/new/databases/{id}',
                    description: 'Update database configuration'
                },
                delete: {
                    method: 'DELETE',
                    path: '/api/new/databases/{id}',
                    description: 'Delete database instance'
                },
                backup: {
                    method: 'POST',
                    path: '/api/new/databases/{id}/backup',
                    description: 'Create database backup'
                }
            },
            domains: {
                list: {
                    method: 'GET',
                    path: '/api/new/domains',
                    description: 'List custom domains',
                    query: { project_id: 'number' }
                },
                create: {
                    method: 'POST',
                    path: '/api/new/domains',
                    description: 'Add custom domain',
                    body: {
                        project_id: 'number',
                        domain_name: 'string',
                        ssl_enabled: 'boolean?'
                    }
                }
            },
            system: {
                info: {
                    method: 'GET',
                    path: '/api/new/system/info',
                    description: 'Get system information and health'
                },
                settings: {
                    method: 'GET|PUT',
                    path: '/api/new/settings',
                    description: 'Get or update system settings'
                }
            },
            github: {
                app_status: {
                    method: 'GET',
                    path: '/api/github/app/test',
                    description: 'Test GitHub App connection'
                },
                repositories: {
                    method: 'GET',
                    path: '/api/github/app/repositories',
                    description: 'List accessible repositories'
                },
                sync: {
                    method: 'POST',
                    path: '/api/github/app/sync',
                    description: 'Sync GitHub App installations'
                }
            }
        };

        const runtimeInfo = {
            supported_runtimes: ['bun', 'node', 'python', 'deno', 'go', 'static'],
            default_runtime: 'bun',
            bun_optimizations: {
                faster_installs: 'Uses bun install instead of npm install',
                native_performance: 'Direct execution without Node.js overhead',
                built_in_bundler: 'No need for separate build tools',
                typescript_support: 'Native TypeScript execution'
            },
            project_types: {
                api: 'RESTful APIs and backend services',
                web: 'Full-stack web applications with frontend',
                static: 'Static sites and SPAs',
                cli: 'Command-line tools and scripts',
                desktop: 'Desktop applications'
            }
        };

        return json({
            success: true,
            data: {
                endpoints,
                runtime_info: runtimeInfo,
                version: '2.0.0',
                documentation: 'https://md0.dev/docs/api',
                base_url: '/api/new'
            }
        });
    } catch (error) {
        console.error('API documentation error:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};
