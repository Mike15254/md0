import Docker from 'dockerode';
import { NodeSSH } from 'node-ssh';
import { VPS_HOST, VPS_USERNAME, VPS_PASSWORD } from '$env/static/private';
import { dbUtils } from './database.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);
const docker = new Docker();
const ssh = new NodeSSH();

interface DeploymentConfig {
    projectId: number;
    name: string;
    githubUrl: string;
    branch: string;
    buildCommand: string;
    startCommand: string;
    port?: number;
    envVars?: Record<string, string>;
}

export const deploymentService = {
    async connectToVPS() {
        try {
            await ssh.connect({
                host: VPS_HOST,
                username: VPS_USERNAME,
                password: VPS_PASSWORD
            });
            return true;
        } catch (error) {
            console.error('Failed to connect to VPS:', error);
            return false;
        }
    },

    async deployProject(config: DeploymentConfig): Promise<{ success: boolean; message: string }> {
        const projectPath = `/var/projects/${config.name}`;
        
        try {
            await dbUtils.addDeploymentLog(config.projectId, 'build', 'Starting deployment...');
            await dbUtils.updateProjectStatus(config.projectId, 'building');

            // Clone or update repository
            await dbUtils.addDeploymentLog(config.projectId, 'build', 'Cloning repository...');
            await this.cloneRepository(config.githubUrl, config.branch, projectPath);

            // Create Dockerfile if it doesn't exist
            await this.ensureDockerfile(projectPath, config);

            // Build Docker image
            await dbUtils.addDeploymentLog(config.projectId, 'build', 'Building Docker image...');
            const imageName = `md0-${config.name.toLowerCase()}`;
            await this.buildDockerImage(projectPath, imageName);

            // Stop existing container if running
            await this.stopContainer(config.name);

            // Run new container
            await dbUtils.addDeploymentLog(config.projectId, 'build', 'Starting container...');
            const containerId = await this.runContainer(imageName, config);

            // Update nginx configuration
            await dbUtils.addDeploymentLog(config.projectId, 'build', 'Updating nginx configuration...');
            await this.updateNginxConfig(config.name, config.port || 3000);

            // Update project status
            await dbUtils.updateProjectStatus(config.projectId, 'running', containerId);
            await dbUtils.addDeploymentLog(config.projectId, 'build', 'Deployment completed successfully!');

            return { success: true, message: 'Deployment completed successfully' };
        } catch (error) {
            await dbUtils.updateProjectStatus(config.projectId, 'failed');
            await dbUtils.addDeploymentLog(config.projectId, 'error', `Deployment failed: ${error}`);
            return { success: false, message: `Deployment failed: ${error}` };
        }
    },

    async cloneRepository(githubUrl: string, branch: string, projectPath: string) {
        const connected = await this.connectToVPS();
        if (!connected) throw new Error('Cannot connect to VPS');

        // Remove existing directory if it exists
        await ssh.execCommand(`rm -rf ${projectPath}`);
        
        // Clone repository
        const result = await ssh.execCommand(
            `git clone -b ${branch} ${githubUrl} ${projectPath}`
        );
        
        if (result.code !== 0) {
            throw new Error(`Git clone failed: ${result.stderr}`);
        }
    },

    async ensureDockerfile(projectPath: string, config: DeploymentConfig) {
        const dockerfilePath = `${projectPath}/Dockerfile`;
        
        const dockerfileContent = `
FROM oven/bun:1

WORKDIR /app

# Copy package files
COPY package*.json bun.lockb* ./

# Install dependencies
RUN bun install

# Copy source code
COPY . .

# Build the application
RUN ${config.buildCommand}

# Expose port
EXPOSE ${config.port || 3000}

# Start the application
CMD ${config.startCommand.split(' ')}
        `.trim();

        const connected = await this.connectToVPS();
        if (!connected) throw new Error('Cannot connect to VPS');

        // Check if Dockerfile exists
        const checkResult = await ssh.execCommand(`test -f ${dockerfilePath}`);
        
        if (checkResult.code !== 0) {
            // Create Dockerfile
            await ssh.execCommand(`cat > ${dockerfilePath} << 'EOF'\n${dockerfileContent}\nEOF`);
        }
    },

    async buildDockerImage(projectPath: string, imageName: string) {
        const connected = await this.connectToVPS();
        if (!connected) throw new Error('Cannot connect to VPS');

        const result = await ssh.execCommand(
            `cd ${projectPath} && docker build -t ${imageName} .`
        );

        if (result.code !== 0) {
            throw new Error(`Docker build failed: ${result.stderr}`);
        }
    },

    async runContainer(imageName: string, config: DeploymentConfig): Promise<string> {
        const connected = await this.connectToVPS();
        if (!connected) throw new Error('Cannot connect to VPS');

        const containerName = `md0-${config.name.toLowerCase()}`;
        const port = config.port || 3000;
        
        // Build environment variables string
        let envString = '';
        if (config.envVars) {
            envString = Object.entries(config.envVars)
                .map(([key, value]) => `-e ${key}="${value}"`)
                .join(' ');
        }

        const result = await ssh.execCommand(
            `docker run -d --name ${containerName} -p ${port}:${port} ${envString} --restart unless-stopped ${imageName}`
        );

        if (result.code !== 0) {
            throw new Error(`Container start failed: ${result.stderr}`);
        }

        return result.stdout.trim();
    },

    async stopContainer(projectName: string) {
        const connected = await this.connectToVPS();
        if (!connected) throw new Error('Cannot connect to VPS');

        const containerName = `md0-${projectName.toLowerCase()}`;
        
        // Stop and remove existing container
        await ssh.execCommand(`docker stop ${containerName} || true`);
        await ssh.execCommand(`docker rm ${containerName} || true`);
    },

    async updateNginxConfig(projectName: string, port: number) {
        const connected = await this.connectToVPS();
        if (!connected) throw new Error('Cannot connect to VPS');

        const domain = `${projectName.toLowerCase()}.yourdomain.com`;
        const configContent = `
server {
    listen 80;
    listen [::]:80;
    server_name ${domain};

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
    }
}
        `.trim();

        const configPath = `/etc/nginx/sites-available/${projectName}`;
        const symlinkPath = `/etc/nginx/sites-enabled/${projectName}`;

        // Create nginx config
        await ssh.execCommand(`sudo tee ${configPath} > /dev/null << 'EOF'\n${configContent}\nEOF`);
        
        // Enable site
        await ssh.execCommand(`sudo ln -sf ${configPath} ${symlinkPath}`);
        
        // Test and reload nginx
        const testResult = await ssh.execCommand('sudo nginx -t');
        if (testResult.code === 0) {
            await ssh.execCommand('sudo systemctl reload nginx');
        } else {
            throw new Error(`Nginx config test failed: ${testResult.stderr}`);
        }
    },

    async getProjectLogs(projectName: string): Promise<string> {
        const connected = await this.connectToVPS();
        if (!connected) throw new Error('Cannot connect to VPS');

        const containerName = `md0-${projectName.toLowerCase()}`;
        const result = await ssh.execCommand(`docker logs --tail 100 ${containerName}`);
        
        return result.stdout + (result.stderr ? `\nErrors:\n${result.stderr}` : '');
    },

    async restartProject(projectName: string): Promise<boolean> {
        try {
            const connected = await this.connectToVPS();
            if (!connected) return false;

            const containerName = `md0-${projectName.toLowerCase()}`;
            const result = await ssh.execCommand(`docker restart ${containerName}`);
            
            return result.code === 0;
        } catch (error) {
            console.error('Failed to restart project:', error);
            return false;
        }
    },

    async stopProject(projectName: string): Promise<boolean> {
        try {
            const connected = await this.connectToVPS();
            if (!connected) return false;

            const containerName = `md0-${projectName.toLowerCase()}`;
            const result = await ssh.execCommand(`docker stop ${containerName}`);
            
            return result.code === 0;
        } catch (error) {
            console.error('Failed to stop project:', error);
            return false;
        }
    },

    async deleteProject(projectId: number, projectName: string): Promise<boolean> {
        try {
            const connected = await this.connectToVPS();
            if (!connected) return false;

            const containerName = `md0-${projectName.toLowerCase()}`;
            const imageName = `md0-${projectName.toLowerCase()}`;
            const projectPath = `/var/projects/${projectName}`;
            const configPath = `/etc/nginx/sites-available/${projectName}`;
            const symlinkPath = `/etc/nginx/sites-enabled/${projectName}`;

            // Stop and remove container
            await ssh.execCommand(`docker stop ${containerName} || true`);
            await ssh.execCommand(`docker rm ${containerName} || true`);
            
            // Remove image
            await ssh.execCommand(`docker rmi ${imageName} || true`);
            
            // Remove project files
            await ssh.execCommand(`rm -rf ${projectPath}`);
            
            // Remove nginx config
            await ssh.execCommand(`sudo rm -f ${configPath} ${symlinkPath}`);
            await ssh.execCommand('sudo systemctl reload nginx');

            return true;
        } catch (error) {
            console.error('Failed to delete project:', error);
            return false;
        }
    }
};
