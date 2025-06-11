// Enhanced project templates for different runtimes and project types
export interface ProjectTemplate {
    name: string;
    runtime: string;
    description: string;
    defaultPort: number;
    buildCommand: string;
    startCommand: string;
    environment: Record<string, string>;
    dockerfileTemplate?: string;
    packageJsonDetection?: RegExp[];
    fileDetection?: string[];
    projectType: 'web' | 'api' | 'static' | 'desktop' | 'cli';
}

export const PROJECT_TEMPLATES: Record<string, ProjectTemplate> = {
    // Bun-based projects
    'bun-api': {
        name: 'Bun API Server',
        runtime: 'bun',
        description: 'High-performance API server using Bun runtime',
        defaultPort: 3000,
        buildCommand: 'bun install',
        startCommand: 'bun run start',
        environment: {
            NODE_ENV: 'production',
            BUN_ENV: 'production'
        },
        packageJsonDetection: [/bun/, /@types\/bun/],
        fileDetection: ['bun.lockb', 'bunfig.toml'],
        projectType: 'api'
    },
    'bun-web': {
        name: 'Bun Web Application',
        runtime: 'bun',
        description: 'Web application powered by Bun',
        defaultPort: 3000,
        buildCommand: 'bun install && bun run build',
        startCommand: 'bun run start',
        environment: {
            NODE_ENV: 'production'
        },
        packageJsonDetection: [/bun/, /@types\/bun/],
        fileDetection: ['bun.lockb'],
        projectType: 'web'
    },
    
    // Node.js projects
    'node-api': {
        name: 'Node.js API Server',
        runtime: 'node',
        description: 'RESTful API server using Node.js',
        defaultPort: 3000,
        buildCommand: 'npm install',
        startCommand: 'npm start',
        environment: {
            NODE_ENV: 'production'
        },
        packageJsonDetection: [/express/, /fastify/, /koa/, /hapi/],
        fileDetection: ['package-lock.json'],
        projectType: 'api'
    },
    'node-web': {
        name: 'Node.js Web Application',
        runtime: 'node',
        description: 'Full-stack web application using Node.js',
        defaultPort: 3000,
        buildCommand: 'npm install && npm run build',
        startCommand: 'npm start',
        environment: {
            NODE_ENV: 'production'
        },
        packageJsonDetection: [/next/, /nuxt/, /gatsby/, /svelte/, /react/, /vue/],
        projectType: 'web'
    },
    
    // Python projects
    'python-api': {
        name: 'Python API Server',
        runtime: 'python',
        description: 'Python API using FastAPI or Flask',
        defaultPort: 8000,
        buildCommand: 'pip install -r requirements.txt',
        startCommand: 'python main.py',
        environment: {
            PYTHONPATH: '/app',
            PYTHON_ENV: 'production'
        },
        fileDetection: ['requirements.txt', 'pyproject.toml', 'Pipfile'],
        packageJsonDetection: [/fastapi/, /flask/, /django/],
        projectType: 'api'
    },
    'python-web': {
        name: 'Python Web Application',
        runtime: 'python',
        description: 'Python web application using Django or Flask',
        defaultPort: 8000,
        buildCommand: 'pip install -r requirements.txt',
        startCommand: 'python manage.py runserver 0.0.0.0:$PORT',
        environment: {
            PYTHONPATH: '/app',
            DJANGO_SETTINGS_MODULE: 'app.settings'
        },
        fileDetection: ['requirements.txt', 'manage.py'],
        projectType: 'web'
    },
    
    // Deno projects
    'deno-api': {
        name: 'Deno API Server',
        runtime: 'deno',
        description: 'Modern API server using Deno',
        defaultPort: 8000,
        buildCommand: 'deno cache main.ts',
        startCommand: 'deno run --allow-net --allow-env main.ts',
        environment: {
            DENO_ENV: 'production'
        },
        fileDetection: ['deno.json', 'deno.jsonc', 'deps.ts'],
        projectType: 'api'
    },
    
    // Go projects
    'go-api': {
        name: 'Go API Server',
        runtime: 'go',
        description: 'High-performance API server using Go',
        defaultPort: 8080,
        buildCommand: 'go mod download && go build -o main .',
        startCommand: './main',
        environment: {
            GO_ENV: 'production',
            CGO_ENABLED: '0'
        },
        fileDetection: ['go.mod', 'go.sum'],
        projectType: 'api'
    },
    
    // Static sites
    'static-site': {
        name: 'Static Website',
        runtime: 'static',
        description: 'Static website with build process',
        defaultPort: 80,
        buildCommand: 'npm install && npm run build',
        startCommand: 'bun --bun serve -s dist -p $PORT',
        environment: {},
        fileDetection: ['index.html', 'dist/', 'build/', 'public/'],
        projectType: 'static'
    }
};

// Enhanced auto-detection logic
export class ProjectDetector {
    static async detectProjectType(repositoryUrl: string, packageJson?: any): Promise<ProjectTemplate> {
        // Default to Bun API if no specific detection
        let detectedTemplate = PROJECT_TEMPLATES['bun-api'];
        
        if (packageJson) {
            // Check for Bun indicators
            if (this.hasBunIndicators(packageJson)) {
                if (this.isApiProject(packageJson)) {
                    detectedTemplate = PROJECT_TEMPLATES['bun-api'];
                } else {
                    detectedTemplate = PROJECT_TEMPLATES['bun-web'];
                }
            }
            // Check for Node.js frameworks
            else if (this.hasNodeIndicators(packageJson)) {
                if (this.isApiProject(packageJson)) {
                    detectedTemplate = PROJECT_TEMPLATES['node-api'];
                } else {
                    detectedTemplate = PROJECT_TEMPLATES['node-web'];
                }
            }
            // Check for static site generators
            else if (this.isStaticSite(packageJson)) {
                detectedTemplate = PROJECT_TEMPLATES['static-site'];
            }
        }
        
        return detectedTemplate;
    }
    
    private static hasBunIndicators(packageJson: any): boolean {
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
        return Object.keys(deps).some(dep => 
            dep.includes('bun') || 
            dep === '@types/bun' ||
            packageJson.scripts?.start?.includes('bun')
        );
    }
    
    private static hasNodeIndicators(packageJson: any): boolean {
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
        return Object.keys(deps).some(dep => 
            ['express', 'fastify', 'koa', 'hapi', 'next', 'nuxt', 'gatsby'].includes(dep)
        );
    }
    
    private static isApiProject(packageJson: any): boolean {
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
        const apiIndicators = ['express', 'fastify', 'koa', 'hapi', '@hono/node-server', 'elysia'];
        return Object.keys(deps).some(dep => apiIndicators.includes(dep));
    }
    
    private static isStaticSite(packageJson: any): boolean {
        const buildScript = packageJson.scripts?.build;
        if (!buildScript) return false;
        
        return buildScript.includes('build') && 
               !packageJson.scripts?.start?.includes('server');
    }
    
    static getOptimizedCommands(template: ProjectTemplate, runtime: string): {
        buildCommand: string;
        startCommand: string;
    } {
        // Optimize for Bun when possible
        if (runtime === 'bun' || template.runtime === 'bun') {
            return {
                buildCommand: template.buildCommand.replace('npm install', 'bun install'),
                startCommand: template.startCommand.replace('npm start', 'bun start').replace('node', 'bun')
            };
        }
        
        return {
            buildCommand: template.buildCommand,
            startCommand: template.startCommand
        };
    }
}

// Available project types for API documentation
export const PROJECT_TYPES = {
    API_PROJECTS: [
        'bun-api',
        'node-api', 
        'python-api',
        'deno-api',
        'go-api'
    ],
    WEB_PROJECTS: [
        'bun-web',
        'node-web',
        'python-web'
    ],
    STATIC_PROJECTS: [
        'static-site'
    ]
};
