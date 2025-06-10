import jwt from 'jsonwebtoken';
import { dbUtils } from './database.js';

interface GitHubRepository {
    id: number;
    name: string;
    full_name: string;
    html_url: string;
    clone_url: string;
    default_branch: string;
    private: boolean;
    language: string | null;
    description: string | null;
}

interface GitHubAppInstallation {
    id: number;
    app_id: number;
    target_id: number;
    target_type: string;
    permissions: Record<string, string>;
    events: string[];
    repositories_url: string;
}

class GitHubAppService {
    private appId?: string;
    private privateKey?: string;
    private clientId?: string;
    private clientSecret?: string;
    private initialized = false;

    constructor() {
        // Configuration will be loaded from database when needed
    }

    // Initialize GitHub App configuration from database
    private async initializeConfig(): Promise<void> {
        if (this.initialized) return;

        try {
            const { dbUtils } = await import('./database.js');
            const settings = await dbUtils.getSettings();
            
            const appIdSetting = settings.find(s => s.category === 'githubApp' && s.key === 'app_id');
            const privateKeySetting = settings.find(s => s.category === 'githubApp' && s.key === 'private_key');
            const clientIdSetting = settings.find(s => s.category === 'githubApp' && s.key === 'client_id');
            const clientSecretSetting = settings.find(s => s.category === 'githubApp' && s.key === 'client_secret');

            this.appId = appIdSetting?.value || process.env.GITHUB_APP_ID || '';
            this.privateKey = privateKeySetting?.value || process.env.GITHUB_APP_PRIVATE_KEY || '';
            this.clientId = clientIdSetting?.value || process.env.GITHUB_APP_CLIENT_ID || '';
            this.clientSecret = clientSecretSetting?.value || process.env.GITHUB_APP_CLIENT_SECRET || '';

            if (!this.appId || !this.privateKey || !this.clientId || !this.clientSecret) {
                throw new Error('GitHub App configuration not found in database or environment variables');
            }

            this.initialized = true;
        } catch (error) {
            console.error('Failed to initialize GitHub App configuration:', error);
            throw error;
        }
    }

    // Generate JWT for GitHub App authentication
    async generateJWT(): Promise<string> {
        await this.initializeConfig();
        
        const now = Math.floor(Date.now() / 1000);
        
        const payload = {
            iat: now - 60, // issued 60 seconds ago
            exp: now + (10 * 60), // expires in 10 minutes
            iss: this.appId
        };

        return jwt.sign(payload, this.privateKey!, { algorithm: 'RS256' });
    }

    // Get installation access token
    async getInstallationAccessToken(installationId: number): Promise<string> {
        const jwt = await this.generateJWT();
        
        const response = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${jwt}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'MD0-Deployment-Platform'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to get installation token: ${response.status}`);
        }

        const data = await response.json();
        return data.token;
    }

    // Get repositories accessible by installation
    async getInstallationRepositories(installationId: number): Promise<GitHubRepository[]> {
        const token = await this.getInstallationAccessToken(installationId);
        
        const response = await fetch(`https://api.github.com/installation/repositories`, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'MD0-Deployment-Platform'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch repositories: ${response.status}`);
        }

        const data = await response.json();
        
        // Store repository information in database for future lookups
        for (const repo of data.repositories) {
            await dbUtils.updateRepositoryAccess(installationId, repo.id, true);
            // Store repository metadata for better lookups
            await this.storeRepositoryInfo(installationId, repo);
        }
        
        return data.repositories;
    }

    // Store repository information for better lookups
    async storeRepositoryInfo(installationId: number, repo: GitHubRepository): Promise<void> {
        try {
            await dbUtils.execute(`
                INSERT INTO github_repositories (
                    installation_id, repository_id, name, full_name, 
                    clone_url, html_url, default_branch, private, language
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (installation_id, repository_id) DO UPDATE SET
                    name = EXCLUDED.name,
                    full_name = EXCLUDED.full_name,
                    clone_url = EXCLUDED.clone_url,
                    html_url = EXCLUDED.html_url,
                    default_branch = EXCLUDED.default_branch,
                    private = EXCLUDED.private,
                    language = EXCLUDED.language,
                    updated_at = CURRENT_TIMESTAMP
            `, [
                installationId, repo.id, repo.name, repo.full_name,
                repo.clone_url, repo.html_url, repo.default_branch, 
                repo.private, repo.language
            ]);
        } catch (error) {
            console.warn('Failed to store repository info:', error);
        }
    }

    // Enhanced repository lookup with stored data
    async findInstallationForRepo(owner: string, repo: string): Promise<any> {
        // First try to find by stored repository information
        const result = await dbUtils.execute(`
            SELECT gai.* FROM github_app_installations gai
            JOIN github_repositories gr ON gai.installation_id = gr.installation_id
            WHERE gr.full_name = $1 AND gai.is_active = true
            ORDER BY gai.created_at DESC
            LIMIT 1
        `, [`${owner}/${repo}`]);
        
        if (result.length > 0) {
            return result[0];
        }
        
        // Fallback to existing method
        return await dbUtils.findInstallationForRepository(owner, repo);
    }

    // Create a webhook for repository (if needed)
    async createRepositoryWebhook(installationId: number, owner: string, repo: string, webhookUrl: string): Promise<boolean> {
        try {
            const token = await this.getInstallationAccessToken(installationId);
            
            const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/hooks`, {
                method: 'POST',
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'MD0-Deployment-Platform',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: 'web',
                    active: true,
                    events: ['push', 'pull_request', 'release'],
                    config: {
                        url: webhookUrl,
                        content_type: 'json',
                        insecure_ssl: '0'
                    }
                })
            });

            if (response.ok) {
                const webhook = await response.json();
                console.log(`Webhook created for ${owner}/${repo}:`, webhook.id);
                return true;
            } else {
                const error = await response.text();
                console.error(`Failed to create webhook: ${response.status} ${error}`);
                return false;
            }
        } catch (error) {
            console.error('Webhook creation error:', error);
            return false;
        }
    }

    // Handle webhook events
    async handleWebhook(payload: any, installationId: number): Promise<void> {
        const event = payload.action;
        
        switch (event) {
            case 'created':
                // New installation
                await this.handleInstallationCreated(payload, installationId);
                break;
            case 'deleted':
                // Installation removed
                await this.handleInstallationDeleted(installationId);
                break;
            case 'added':
                // Repositories added to installation
                if (payload.repositories_added) {
                    await this.handleRepositoriesAdded(payload.repositories_added, installationId);
                }
                break;
            case 'removed':
                // Repositories removed from installation
                if (payload.repositories_removed) {
                    await this.handleRepositoriesRemoved(payload.repositories_removed, installationId);
                }
                break;
        }
    }

    private async handleInstallationCreated(payload: any, installationId: number): Promise<void> {
        // Store installation in database
        await dbUtils.createGitHubAppInstallation({
            installation_id: installationId,
            account_id: payload.installation.account.id,
            account_login: payload.installation.account.login,
            account_type: payload.installation.account.type,
            permissions: payload.installation.permissions,
            events: payload.installation.events
        });
    }

    private async handleInstallationDeleted(installationId: number): Promise<void> {
        // Remove installation from database
        await dbUtils.deleteGitHubAppInstallation(installationId);
    }

    private async handleRepositoriesAdded(repositories: any[], installationId: number): Promise<void> {
        // Update repository access
        for (const repo of repositories) {
            await dbUtils.updateRepositoryAccess(installationId, repo.id, true);
        }
    }

    private async handleRepositoriesRemoved(repositories: any[], installationId: number): Promise<void> {
        // Remove repository access
        for (const repo of repositories) {
            await dbUtils.updateRepositoryAccess(installationId, repo.id, false);
        }
    }

    // Auto-setup webhooks for project deployment
    async setupProjectWebhook(projectId: number, repositoryUrl: string): Promise<boolean> {
        try {
            // Extract owner/repo from URL
            const match = repositoryUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
            if (!match) return false;
            
            const [, owner, repo] = match;
            const cleanRepo = repo.replace('.git', '');
            
            // Find installation that has access to this repository
            const installation = await this.findInstallationForRepo(owner, cleanRepo);
            if (!installation) return false;
            
            // This would typically be handled automatically by GitHub App
            // since all repositories with the app installed will send webhooks
            return true;
            
        } catch (error) {
            console.error('Setup webhook error:', error);
            return false;
        }
    }
}

export const githubAppService = new GitHubAppService();
