// filepath: /Users/Mikemax/dev/md0/src/lib/server/deployment.ts
import Docker from 'dockerode';
import { dbUtils } from './database.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);
const docker = new Docker();

interface DeploymentConfig {
    projectId: number;
    name: string;
    githubUrl: string;
    branch: string;
    buildCommand: string;
    startCommand: string;
    port?: number;
    runtime?: string;
    githubToken?: string;
    installationId?: number;
    envVars?: Record<string, string>;
    customDomain?: string;
}

export const deploymentService = {
    // Execute commands locally
    async execCommand(command: string): Promise<{ stdout: string; stderr: string; code: number }> {
        try {
            const { stdout, stderr } = await execAsync(command);
            return { stdout, stderr, code: 0 };
        } catch (error: any) {
            return { 
                stdout: error.stdout || '', 
                stderr: error.stderr || error.message, 
                code: error.code || 1 
            };
        }
    },

    async deployProject(config: DeploymentConfig): Promise<{ success: boolean; message: string }> {
        const projectPath = `/var/projects/${config.name}`;
        
        try {
            await dbUtils.addDeploymentLog(config.projectId, 'info', 'Starting deployment...');
            await dbUtils.updateProjectStatus(config.projectId, 'building');

            // Validate configuration
            if (!config.githubUrl) {
                throw new Error('GitHub URL is required');
            }
            if (!config.name) {
                throw new Error('Project name is required');
            }

            // Try to find GitHub App installation for this repository
            let installationId: number | undefined;
            try {
                const match = config.githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
                if (match) {
                    const [, owner, repo] = match;
                    const cleanRepo = repo.replace('.git', '');
                    const installation = await dbUtils.findInstallationForRepository(owner, cleanRepo);
                    if (installation) {
                        installationId = installation.installation_id;
                        await dbUtils.addDeploymentLog(config.projectId, 'info', 'Using GitHub App for authentication');
                    }
                }
            } catch (error) {
                console.log('Could not determine GitHub App installation:', error);
            }

            // Step 1: Clone repository
            await dbUtils.addDeploymentLog(config.projectId, 'info', `Cloning repository from ${config.githubUrl} (branch: ${config.branch})`);
            try {
                await this.cloneRepository(config.githubUrl, config.branch, projectPath, config.githubToken, installationId);
                await dbUtils.addDeploymentLog(config.projectId, 'success', 'Repository cloned successfully');
            } catch (error) {
                await dbUtils.addDeploymentLog(config.projectId, 'error', `Failed to clone repository: ${error}`);
                throw new Error(`Failed to clone repository: ${error}`);
            }

            // Step 2: Validate project structure and create Dockerfile
            await dbUtils.addDeploymentLog(config.projectId, 'info', 'Preparing Docker configuration...');
            try {
                await this.ensureDockerfile(projectPath, config);
                await dbUtils.addDeploymentLog(config.projectId, 'success', 'Docker configuration ready');
            } catch (error) {
                await dbUtils.addDeploymentLog(config.projectId, 'error', `Failed to prepare Docker configuration: ${error}`);
                throw new Error(`Failed to prepare Docker configuration: ${error}`);
            }

            // Step 3: Run build command if specified
            if (config.buildCommand && config.buildCommand.trim()) {
                await dbUtils.addDeploymentLog(config.projectId, 'info', `Running build command: ${config.buildCommand}`);
                try {
                    const buildResult = await this.execCommand(`cd ${projectPath} && ${config.buildCommand}`);
                    if (buildResult.code !== 0) {
                        await dbUtils.addDeploymentLog(config.projectId, 'error', `Build failed: ${buildResult.stderr}`);
                        throw new Error(`Build command failed: ${buildResult.stderr}`);
                    }
                    await dbUtils.addDeploymentLog(config.projectId, 'success', 'Build completed successfully');
                } catch (error) {
                    await dbUtils.addDeploymentLog(config.projectId, 'error', `Build command failed: ${error}`);
                    throw new Error(`Build command failed: ${error}`);
                }
            } else {
                await dbUtils.addDeploymentLog(config.projectId, 'info', 'No build command specified, skipping build step');
            }

            // Step 4: Build Docker image
            await dbUtils.addDeploymentLog(config.projectId, 'info', 'Building Docker image...');
            const imageName = `md0-${config.name.toLowerCase()}`;
            try {
                await this.buildDockerImage(projectPath, imageName);
                await dbUtils.addDeploymentLog(config.projectId, 'success', 'Docker image built successfully');
            } catch (error) {
                await dbUtils.addDeploymentLog(config.projectId, 'error', `Failed to build Docker image: ${error}`);
                throw new Error(`Failed to build Docker image: ${error}`);
            }

            // Step 5: Stop existing container if running
            await dbUtils.addDeploymentLog(config.projectId, 'info', 'Stopping existing container...');
            try {
                await this.stopContainer(config.name);
                await dbUtils.addDeploymentLog(config.projectId, 'info', 'Existing container stopped');
            } catch (error) {
                await dbUtils.addDeploymentLog(config.projectId, 'warning', `No existing container to stop: ${error}`);
            }

            // Step 6: Start new container
            await dbUtils.addDeploymentLog(config.projectId, 'info', `Starting new container on port ${config.port || 3000}...`);
            let containerId;
            try {
                containerId = await this.runContainer(imageName, config);
                await dbUtils.addDeploymentLog(config.projectId, 'success', `Container started successfully (ID: ${containerId.substring(0, 12)})`);
            } catch (error) {
                await dbUtils.addDeploymentLog(config.projectId, 'error', `Failed to start container: ${error}`);
                throw new Error(`Failed to start container: ${error}`);
            }

            // Step 7: Test if application started successfully
            await dbUtils.addDeploymentLog(config.projectId, 'info', 'Verifying application startup...');
            try {
                // Wait a few seconds for the app to start
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                // Check if container is still running
                const healthCheck = await this.execCommand(`docker ps --filter "id=${containerId}" --format "{{.Status}}"`);
                if (healthCheck.stdout.includes('Up')) {
                    await dbUtils.addDeploymentLog(config.projectId, 'success', 'Application is running healthy');
                } else {
                    throw new Error('Container stopped unexpectedly after startup');
                }
            } catch (error) {
                await dbUtils.addDeploymentLog(config.projectId, 'warning', `Could not verify application health: ${error}`);
            }

            // Step 8: Update nginx configuration
            await dbUtils.addDeploymentLog(config.projectId, 'info', 'Updating nginx configuration...');
            try {
                await this.updateNginxConfig(config.name, config.port || 3000, config.customDomain);
                await dbUtils.addDeploymentLog(config.projectId, 'success', 'Nginx configuration updated');
            } catch (error) {
                await dbUtils.addDeploymentLog(config.projectId, 'error', `Failed to update nginx configuration: ${error}`);
                throw new Error(`Failed to update nginx configuration: ${error}`);
            }

            // Step 9: Final status update
            await dbUtils.updateProjectStatus(config.projectId, 'running', containerId);
            await dbUtils.addDeploymentLog(config.projectId, 'success', 'Deployment completed successfully! 🎉');

            return { success: true, message: 'Deployment completed successfully' };
        } catch (error) {
            console.error('Deployment error:', error);
            await dbUtils.updateProjectStatus(config.projectId, 'failed');
            await dbUtils.addDeploymentLog(config.projectId, 'error', `Deployment failed: ${error instanceof Error ? error.message : String(error)}`);
            return { success: false, message: `Deployment failed: ${error instanceof Error ? error.message : String(error)}` };
        }
    },

    async cloneRepository(githubUrl: string, branch: string, projectPath: string, githubToken?: string, installationId?: number) {
        // Ensure the parent directory exists with proper permissions
        const parentDir = projectPath.substring(0, projectPath.lastIndexOf('/'));
        await this.execCommand(`sudo mkdir -p ${parentDir}`);
        await this.execCommand(`sudo chown -R $USER:$USER ${parentDir}`);
        
        // Remove existing directory if it exists
        await this.execCommand(`rm -rf ${projectPath}`);
        
        // Clone repository with authentication
        let cloneUrl = githubUrl;
        let tokenToUse = githubToken;
        
        // If we have a GitHub App installation, try to get an installation token
        if (installationId && !githubToken) {
            try {
                const { githubAppService } = await import('./github-app.js');
                tokenToUse = await githubAppService.getInstallationAccessToken(installationId);
                console.log('Using GitHub App installation token for cloning');
            } catch (error) {
                console.warn('Failed to get GitHub App token, proceeding without authentication:', error);
            }
        }
        
        if (tokenToUse) {
            // Convert HTTPS URL to authenticated URL
            cloneUrl = githubUrl.replace('https://github.com/', `https://${tokenToUse}@github.com/`);
        }
        
        const result = await this.execCommand(
            `git clone -b ${branch} ${cloneUrl} ${projectPath}`
        );
        
        if (result.code !== 0) {
            throw new Error(`Git clone failed: ${result.stderr}`);
        }

        // Remove sensitive info from git config
        if (tokenToUse) {
            await this.execCommand(`cd ${projectPath} && git remote set-url origin ${githubUrl}`);
        }
    },

    async ensureDockerfile(projectPath: string, config: DeploymentConfig) {
        const dockerfilePath = `${projectPath}/Dockerfile`;
        
        // Check if Dockerfile already exists
        try {
            await this.execCommand(`test -f ${dockerfilePath}`);
            await dbUtils.addDeploymentLog(config.projectId, 'build', 'Using existing Dockerfile');
            return;
        } catch {
            // Dockerfile doesn't exist, create one based on runtime
        }

        let dockerfileContent = '';
        
        // Generate Dockerfile based on runtime and detected framework
        switch (config.runtime || 'node') {
            case 'node':
                dockerfileContent = await this.generateNodeDockerfile(projectPath, config);
                break;
            case 'python':
                dockerfileContent = await this.generatePythonDockerfile(projectPath, config);
                break;
            case 'static':
                dockerfileContent = await this.generateStaticDockerfile(projectPath, config);
                break;
            default:
                dockerfileContent = await this.generateNodeDockerfile(projectPath, config);
        }

        // Write Dockerfile
        await this.execCommand(`cat > ${dockerfilePath} << 'EOF'\n${dockerfileContent}\nEOF`);
        await dbUtils.addDeploymentLog(config.projectId, 'build', `Generated Dockerfile for ${config.runtime || 'node'} runtime`);
    },

    async generateNodeDockerfile(projectPath: string, config: DeploymentConfig): Promise<string> {
        // Check for package.json to determine Node version and package manager
        let packageManager = 'npm';
        let nodeVersion = '18';
        
        try {
            const packageJsonResult = await this.execCommand(`cat ${projectPath}/package.json`);
            if (packageJsonResult.code === 0) {
                const packageJson = JSON.parse(packageJsonResult.stdout);
                
                // Detect package manager
                if (await this.fileExists(`${projectPath}/bun.lockb`)) {
                    packageManager = 'bun';
                } else if (await this.fileExists(`${projectPath}/yarn.lock`)) {
                    packageManager = 'yarn';
                } else if (await this.fileExists(`${projectPath}/pnpm-lock.yaml`)) {
                    packageManager = 'pnpm';
                }

                // Check for Node version in engines
                if (packageJson.engines?.node) {
                    const nodeVersionMatch = packageJson.engines.node.match(/(\d+)/);
                    if (nodeVersionMatch) {
                        nodeVersion = nodeVersionMatch[1];
                    }
                }
            }
        } catch (error) {
            console.log('Could not read package.json, using defaults');
        }

        const baseImage = packageManager === 'bun' ? 'oven/bun:1' : `node:${nodeVersion}-alpine`;
        const installCommand = packageManager === 'npm' ? 'npm ci' : 
                             packageManager === 'yarn' ? 'yarn install --frozen-lockfile' :
                             packageManager === 'pnpm' ? 'pnpm install --frozen-lockfile' :
                             'bun install';

        return `FROM ${baseImage}

WORKDIR /app

# Copy package files
COPY package*.json ./
${packageManager === 'yarn' ? 'COPY yarn.lock ./' : ''}
${packageManager === 'pnpm' ? 'COPY pnpm-lock.yaml ./' : ''}
${packageManager === 'bun' ? 'COPY bun.lockb ./' : ''}

# Install dependencies
RUN ${installCommand}

# Copy source code
COPY . .

# Build the application
RUN ${config.buildCommand || 'npm run build'}

# Expose port
EXPOSE ${config.port || 3000}

# Start the application
CMD ${packageManager === 'bun' ? config.startCommand.split(' ') : `["${config.startCommand || 'npm start'}"]`}
`;
    },

    async generatePythonDockerfile(projectPath: string, config: DeploymentConfig): Promise<string> {
        let pythonVersion = '3.11';
        
        // Check for Python version in runtime.txt or pyproject.toml
        try {
            const runtimeResult = await this.execCommand(`cat ${projectPath}/runtime.txt`);
            if (runtimeResult.code === 0) {
                const versionMatch = runtimeResult.stdout.match(/python-(\d+\.\d+)/);
                if (versionMatch) {
                    pythonVersion = versionMatch[1];
                }
            }
        } catch {
            // Use default version
        }

        return `FROM python:${pythonVersion}-slim

WORKDIR /app

# Copy requirements
COPY requirements.txt ./

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Build if needed
${config.buildCommand && config.buildCommand !== 'pip install -r requirements.txt' ? `RUN ${config.buildCommand}` : ''}

# Expose port
EXPOSE ${config.port || 8000}

# Start the application
CMD ["${config.startCommand || 'python app.py'}"]
`;
    },

    async generateStaticDockerfile(projectPath: string, config: DeploymentConfig): Promise<string> {
        return `FROM node:18-alpine as builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN ${config.buildCommand || 'npm run build'}

# Production stage
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/build /usr/share/nginx/html
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config if exists
COPY nginx.conf /etc/nginx/nginx.conf || true

# Expose port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
`;
    },

    async fileExists(filePath: string): Promise<boolean> {
        try {
            const result = await this.execCommand(`test -f ${filePath}`);
            return result.code === 0;
        } catch {
            return false;
        }
    },

    async buildDockerImage(projectPath: string, imageName: string) {
        // Remove any existing image with the same name to avoid conflicts
        await this.execCommand(`docker rmi ${imageName} || true`);
        
        const result = await this.execCommand(
            `cd ${projectPath} && docker build -t ${imageName} .`
        );

        if (result.code !== 0) {
            // Parse docker build output for more specific errors
            let errorMessage = result.stderr;
            if (result.stderr.includes('no such file or directory')) {
                errorMessage = 'Build failed: Missing required files or dependencies';
            } else if (result.stderr.includes('permission denied')) {
                errorMessage = 'Build failed: Permission denied accessing files';
            } else if (result.stderr.includes('network timeout')) {
                errorMessage = 'Build failed: Network timeout during dependency installation';
            } else if (result.stderr.includes('ENOSPC')) {
                errorMessage = 'Build failed: No space left on device';
            }
            
            throw new Error(`Docker build failed: ${errorMessage}`);
        }
        
        // Verify the image was created successfully
        const verifyResult = await this.execCommand(`docker images ${imageName} --format "{{.Repository}}:{{.Tag}}"`);
        if (verifyResult.code !== 0 || !verifyResult.stdout.trim()) {
            throw new Error('Docker image build completed but image verification failed');
        }
    },

    async runContainer(imageName: string, config: DeploymentConfig): Promise<string> {
        const containerName = `md0-${config.name.toLowerCase()}`;
        const port = config.port || 3000;
        
        // Build environment variables string
        let envString = '';
        if (config.envVars && typeof config.envVars === 'object') {
            envString = Object.entries(config.envVars)
                .map(([key, value]) => `-e ${key}="${value}"`)
                .join(' ');
        }

        // Add default environment variables
        envString += ` -e PORT=${port} -e NODE_ENV=production`;

        const dockerCommand = `docker run -d --name ${containerName} -p ${port}:${port} ${envString} --restart unless-stopped ${imageName}`;
        
        const result = await this.execCommand(dockerCommand);

        if (result.code !== 0) {
            // Parse common Docker run errors
            let errorMessage = result.stderr;
            if (result.stderr.includes('port is already allocated')) {
                errorMessage = `Port ${port} is already in use`;
            } else if (result.stderr.includes('no such image')) {
                errorMessage = 'Docker image not found or build failed';
            } else if (result.stderr.includes('name is already in use')) {
                errorMessage = `Container ${containerName} already exists`;
            }
            
            throw new Error(`Container start failed: ${errorMessage}`);
        }

        const containerId = result.stdout.trim();
        
        // Verify container started successfully
        const checkResult = await this.execCommand(`docker inspect ${containerId} --format="{{.State.Status}}"`);
        if (checkResult.code !== 0) {
            throw new Error('Failed to verify container status after start');
        }
        
        const status = checkResult.stdout.trim();
        if (status !== 'running') {
            // Get container logs to understand why it failed
            const logsResult = await this.execCommand(`docker logs ${containerId}`);
            throw new Error(`Container failed to start properly. Status: ${status}. Logs: ${logsResult.stderr || logsResult.stdout}`);
        }

        return containerId;
    },

    async stopContainer(projectName: string) {
        const containerName = `md0-${projectName.toLowerCase()}`;
        
        // Stop and remove existing container
        await this.execCommand(`docker stop ${containerName} || true`);
        await this.execCommand(`docker rm ${containerName} || true`);
    },

    async updateNginxConfig(projectName: string, port: number, customDomain?: string) {
        const domain = customDomain || `${projectName.toLowerCase()}.localhost`;
        const configContent = `
# Configuration for ${projectName}
server {
    listen 80;
    listen [::]:80;
    server_name ${domain};

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    
    # Client max body size
    client_max_body_size 100M;
    
    # Timeouts
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;

    location / {
        proxy_pass http://localhost:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Handle errors
        proxy_intercept_errors on;
        error_page 502 503 504 @fallback;
    }
    
    # Fallback for when the app is not running
    location @fallback {
        return 503 '<!DOCTYPE html><html><head><title>Service Unavailable</title></head><body><h1>Service Temporarily Unavailable</h1><p>The application is starting up or temporarily unavailable. Please try again in a few moments.</p></body></html>';
        add_header Content-Type text/html;
    }
    
    # Health check endpoint
    location /health {
        access_log off;
        proxy_pass http://localhost:${port}/health;
        proxy_connect_timeout 5s;
        proxy_send_timeout 5s;
        proxy_read_timeout 5s;
    }
}

# SSL configuration (if custom domain is provided)
${customDomain ? `
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${domain};

    # SSL configuration will be handled by Certbot/Let's Encrypt
    # ssl_certificate /etc/letsencrypt/live/${domain}/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/${domain}/privkey.pem;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # Client max body size
    client_max_body_size 100M;
    
    # Timeouts
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;

    location / {
        proxy_pass http://localhost:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Handle errors
        proxy_intercept_errors on;
        error_page 502 503 504 @fallback;
    }
    
    # Fallback for when the app is not running
    location @fallback {
        return 503 '<!DOCTYPE html><html><head><title>Service Unavailable</title></head><body><h1>Service Temporarily Unavailable</h1><p>The application is starting up or temporarily unavailable. Please try again in a few moments.</p></body></html>';
        add_header Content-Type text/html;
    }
    
    # Health check endpoint
    location /health {
        access_log off;
        proxy_pass http://localhost:${port}/health;
        proxy_connect_timeout 5s;
        proxy_send_timeout 5s;
        proxy_read_timeout 5s;
    }
}
` : ''}
        `.trim();

        const configPath = `/etc/nginx/sites-available/${projectName}`;
        const symlinkPath = `/etc/nginx/sites-enabled/${projectName}`;

        try {
            // Create nginx config
            await this.execCommand(`sudo tee ${configPath} > /dev/null << 'EOF'\n${configContent}\nEOF`);
            
            // Enable site
            await this.execCommand(`sudo ln -sf ${configPath} ${symlinkPath}`);
            
            // Test nginx configuration
            const testResult = await this.execCommand('sudo nginx -t');
            if (testResult.code !== 0) {
                throw new Error(`Nginx config test failed: ${testResult.stderr}`);
            }
            
            // Reload nginx
            await this.execCommand('sudo systemctl reload nginx');
            
            // If custom domain is provided, attempt to set up SSL
            if (customDomain && customDomain !== `${projectName.toLowerCase()}.localhost`) {
                try {
                    // Check if certbot is available
                    const certbotCheck = await this.execCommand('which certbot');
                    if (certbotCheck.code === 0) {
                        // Attempt to get SSL certificate
                        await this.execCommand(`sudo certbot --nginx -d ${domain} --non-interactive --agree-tos --no-eff-email --register-unsafely-without-email || true`);
                    }
                } catch (error) {
                    console.log('SSL certificate setup skipped:', error);
                }
            }
        } catch (error) {
            throw new Error(`Failed to update nginx configuration: ${error}`);
        }
    },

    async getProjectLogs(projectName: string): Promise<string> {
        const containerName = `md0-${projectName.toLowerCase()}`;
        const result = await this.execCommand(`docker logs --tail 100 ${containerName}`);
        
        return result.stdout + (result.stderr ? `\nErrors:\n${result.stderr}` : '');
    },

    async restartProject(projectName: string): Promise<boolean> {
        try {
            const containerName = `md0-${projectName.toLowerCase()}`;
            const result = await this.execCommand(`docker restart ${containerName}`);
            
            return result.code === 0;
        } catch (error) {
            console.error('Failed to restart project:', error);
            return false;
        }
    },

    async stopProject(projectName: string): Promise<boolean> {
        try {
            const containerName = `md0-${projectName.toLowerCase()}`;
            const result = await this.execCommand(`docker stop ${containerName}`);
            
            return result.code === 0;
        } catch (error) {
            console.error('Failed to stop project:', error);
            return false;
        }
    },

    async deleteProject(projectId: number, projectName: string): Promise<boolean> {
        try {
            const containerName = `md0-${projectName.toLowerCase()}`;
            const imageName = `md0-${projectName.toLowerCase()}`;
            const projectPath = `/var/projects/${projectName}`;
            const configPath = `/etc/nginx/sites-available/${projectName}`;
            const symlinkPath = `/etc/nginx/sites-enabled/${projectName}`;

            // Stop and remove container
            await this.execCommand(`docker stop ${containerName} || true`);
            await this.execCommand(`docker rm ${containerName} || true`);
            
            // Remove image
            await this.execCommand(`docker rmi ${imageName} || true`);
            
            // Remove project files
            await this.execCommand(`rm -rf ${projectPath}`);
            
            // Remove nginx config
            await this.execCommand(`sudo rm -f ${configPath} ${symlinkPath}`);
            await this.execCommand('sudo systemctl reload nginx');

            return true;
        } catch (error) {
            console.error('Failed to delete project:', error);
            return false;
        }
    }
};
