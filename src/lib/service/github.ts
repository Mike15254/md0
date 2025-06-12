import jwt from 'jsonwebtoken';
import { db } from '../server/database.js';
import { BaseService } from './database.js';
import type {
	ServiceResponse,
	GitHubInstallation,
	GitHubRepository,
	GitHubAppConfig
} from './types.js';

/**
 * GitHub service for managing GitHub App installations and repositories
 * Only supports GitHub Apps - no personal access tokens or other auth methods
 */
export class GitHubService extends BaseService {
	private config: GitHubAppConfig | null = null;
	private configLoaded = false;

	/**
	 * Load GitHub App configuration from database
	 */
	private async loadConfig(): Promise<void> {
		if (this.configLoaded) return;

		try {
			interface SettingRecord {
				key: string;
				value: string;
			}

			// Use 'github' category to match the new settings API
			const settings = (await this.executeQuery(
				db`SELECT key, value FROM settings WHERE category = 'github'`
			)) as SettingRecord[];

			const config: Partial<GitHubAppConfig> = {};
			for (const setting of settings) {
				config[setting.key as keyof GitHubAppConfig] = setting.value;
			}

			// Validate required config
			if (!config.app_id || !config.private_key || !config.client_id || !config.client_secret) {
				throw new Error('GitHub App configuration is incomplete. Please configure in settings.');
			}

			this.config = config as GitHubAppConfig;
			this.configLoaded = true;
		} catch (error) {
			console.error('Failed to load GitHub App configuration:', error);
			throw error;
		}
	}

	/**
	 * Generate JWT for GitHub App authentication
	 */
	private async generateJWT(): Promise<string> {
		await this.loadConfig();
		if (!this.config) throw new Error('GitHub App not configured');

		const now = Math.floor(Date.now() / 1000);
		const payload = {
			iat: now - 60,
			exp: now + 10 * 60,
			iss: this.config.app_id
		};

		return jwt.sign(payload, this.config.private_key, { algorithm: 'RS256' });
	}

	/**
	 * Get installation access token
	 */
	async getInstallationToken(installationId: number): Promise<string> {
		try {
			const jwtToken = await this.generateJWT();

			const response = await fetch(
				`https://api.github.com/app/installations/${installationId}/access_tokens`,
				{
					method: 'POST',
					headers: {
						Authorization: `Bearer ${jwtToken}`,
						Accept: 'application/vnd.github.v3+json',
						'User-Agent': 'MD0-Deployment-Platform'
					}
				}
			);

			if (!response.ok) {
				throw new Error(`Failed to get installation token: ${response.status}`);
			}

			const data = await response.json();
			return data.token;
		} catch (error) {
			console.error('Get installation token error:', error);
			throw error;
		}
	}

	/**
	 * Get all GitHub App installations
	 */
	async getInstallations(): Promise<ServiceResponse<GitHubInstallation[]>> {
		try {
			const installations = (await this.executeQuery(
				db`
                    SELECT 
                        id, installation_id, account_login, account_type,
                        permissions, events, is_active, created_at, updated_at
                    FROM github_app_installations 
                    WHERE is_active = true
                    ORDER BY created_at DESC
                `
			)) as Array<{ installation_id: number; [key: string]: any }>;

			// Get repositories for each installation
			const installationsWithRepos = (await Promise.all(
				installations.map(async (installation) => {
					const repositories = await this.getInstallationRepositories(installation.installation_id);
					return {
						...installation,
						repositories: repositories.data || []
					};
				})
			)) as GitHubInstallation[];

			return this.createResponse(true, installationsWithRepos);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Get repositories for a specific installation
	 */
	async getInstallationRepositories(
		installationId: number
	): Promise<ServiceResponse<GitHubRepository[]>> {
		try {
			const repositories = (await this.executeQuery(
				db`
                    SELECT 
                        id, repository_id, name, full_name, clone_url, html_url,
                        default_branch, private, language, description, installation_id
                    FROM github_repositories 
                    WHERE installation_id = ${installationId}
                    ORDER BY full_name ASC
                `
			)) as GitHubRepository[];

			return this.createResponse(true, repositories);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Sync installations and repositories from GitHub
	 */
	async syncInstallations(): Promise<
		ServiceResponse<{ installations: number; repositories: number }>
	> {
		try {
			const jwtToken = await this.generateJWT();

			// Fetch installations from GitHub
			const response = await fetch('https://api.github.com/app/installations', {
				headers: {
					Authorization: `Bearer ${jwtToken}`,
					Accept: 'application/vnd.github.v3+json',
					'User-Agent': 'MD0-Deployment-Platform'
				}
			});

			if (!response.ok) {
				throw new Error(`GitHub API error: ${response.status}`);
			}

			const installationsData = await response.json();
			let syncedInstallations = 0;
			let syncedRepositories = 0;

			for (const installation of installationsData) {
				// Store/update installation
				await this.executeQuery(
					db`
                        INSERT INTO github_app_installations (
                            installation_id, account_id, account_login, account_type,
                            permissions, events, is_active
                        )
                        VALUES (
                            ${installation.id}, ${installation.account.id}, 
                            ${installation.account.login}, ${installation.account.type},
                            ${JSON.stringify(installation.permissions)}, 
                            ${installation.events}, true
                        )
                        ON CONFLICT (installation_id) DO UPDATE SET
                            account_id = EXCLUDED.account_id,
                            account_login = EXCLUDED.account_login,
                            account_type = EXCLUDED.account_type,
                            permissions = EXCLUDED.permissions,
                            events = EXCLUDED.events,
                            is_active = EXCLUDED.is_active,
                            updated_at = CURRENT_TIMESTAMP
                    `
				);
				syncedInstallations++;

				// Sync repositories for this installation
				const repoCount = await this.syncInstallationRepositories(installation.id);
				syncedRepositories += repoCount;
			}

			await this.logOperation('info', 'github_installations_synced', {
				installations: syncedInstallations,
				repositories: syncedRepositories
			});

			return this.createResponse(
				true,
				{
					installations: syncedInstallations,
					repositories: syncedRepositories
				},
				undefined,
				'GitHub installations synced successfully'
			);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Sync repositories for a specific installation
	 */
	private async syncInstallationRepositories(installationId: number): Promise<number> {
		try {
			const token = await this.getInstallationToken(installationId);

			const response = await fetch('https://api.github.com/installation/repositories', {
				headers: {
					Authorization: `token ${token}`,
					Accept: 'application/vnd.github.v3+json',
					'User-Agent': 'MD0-Deployment-Platform'
				}
			});

			if (!response.ok) {
				throw new Error(`Failed to fetch repositories: ${response.status}`);
			}

			const data = await response.json();
			let count = 0;

			for (const repo of data.repositories) {
				await this.executeQuery(
					db`
                        INSERT INTO github_repositories (
                            installation_id, repository_id, name, full_name,
                            clone_url, html_url, default_branch, private, language, description
                        )
                        VALUES (
                            ${installationId}, ${repo.id}, ${repo.name}, ${repo.full_name},
                            ${repo.clone_url}, ${repo.html_url}, ${repo.default_branch},
                            ${repo.private}, ${repo.language}, ${repo.description}
                        )
                        ON CONFLICT (installation_id, repository_id) DO UPDATE SET
                            name = EXCLUDED.name,
                            full_name = EXCLUDED.full_name,
                            clone_url = EXCLUDED.clone_url,
                            html_url = EXCLUDED.html_url,
                            default_branch = EXCLUDED.default_branch,
                            private = EXCLUDED.private,
                            language = EXCLUDED.language,
                            description = EXCLUDED.description,
                            updated_at = CURRENT_TIMESTAMP
                    `
				);
				count++;
			}

			return count;
		} catch (error) {
			console.error('Sync repositories error:', error);
			return 0;
		}
	}

	/**
	 * Find installation for a specific repository
	 */
	async findInstallationForRepository(
		owner: string,
		repo: string
	): Promise<ServiceResponse<GitHubInstallation | null>> {
		try {
			const installations = (await this.executeQuery(
				db`
                    SELECT gai.* 
                    FROM github_app_installations gai
                    JOIN github_repositories gr ON gai.installation_id = gr.installation_id
                    WHERE gr.full_name = ${`${owner}/${repo}`} AND gai.is_active = true
                    ORDER BY gai.created_at DESC
                    LIMIT 1
                `
			)) as GitHubInstallation[];

			const installation = installations.length > 0 ? installations[0] : null;
			return this.createResponse(true, installation);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Get repository by full name
	 */
	async getRepository(fullName: string): Promise<ServiceResponse<GitHubRepository | null>> {
		try {
			const repositories = (await this.executeQuery(
				db`
                    SELECT 
                        id, repository_id, name, full_name, clone_url, html_url,
                        default_branch, private, language, description, installation_id
                    FROM github_repositories 
                    WHERE full_name = ${fullName}
                    LIMIT 1
                `
			)) as GitHubRepository[];

			const repository = repositories.length > 0 ? repositories[0] : null;
			return this.createResponse(true, repository);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Validate GitHub App configuration
	 */
	async validateConfiguration(): Promise<ServiceResponse<{ valid: boolean; details: any }>> {
		try {
			const jwtToken = await this.generateJWT();

			// Test GitHub API access
			const response = await fetch('https://api.github.com/app', {
				headers: {
					Authorization: `Bearer ${jwtToken}`,
					Accept: 'application/vnd.github.v3+json',
					'User-Agent': 'MD0-Deployment-Platform'
				}
			});

			if (!response.ok) {
				return this.createResponse(true, {
					valid: false,
					details: { error: `GitHub API error: ${response.status}` }
				});
			}

			const appInfo = await response.json();

			return this.createResponse(true, {
				valid: true,
				details: {
					app_name: appInfo.name,
					app_slug: appInfo.slug,
					installations_count: await this.getInstallationsCount()
				}
			});
		} catch (error) {
			return this.createResponse(true, {
				valid: false,
				details: { error: error instanceof Error ? error.message : 'Unknown error' }
			});
		}
	}

	/**
	 * Get installations count
	 */
	private async getInstallationsCount(): Promise<number> {
		const result = (await this.executeQuery(
			db`SELECT COUNT(*) as count FROM github_app_installations WHERE is_active = true`
		)) as Array<{ count: number }>;
		return result[0].count;
	}

	/**
	 * Handle webhook from GitHub
	 */
	async handleWebhook(payload: any, signature: string): Promise<ServiceResponse> {
		try {
			// Verify webhook signature
			if (!(await this.verifyWebhookSignature(payload, signature))) {
				return this.createResponse(false, undefined, 'Invalid webhook signature');
			}

			const eventType = payload.action ? `${payload.action}` : 'unknown';

			// Handle different webhook events
			switch (payload.action) {
				case 'installation_created':
				case 'installation_repositories_added':
					await this.handleInstallationEvent(payload);
					break;
				case 'installation_deleted':
				case 'installation_repositories_removed':
					await this.handleInstallationRemoval(payload);
					break;
				case 'push':
					await this.handlePushEvent(payload);
					break;
				default:
					await this.logOperation('info', 'github_webhook_received', { action: payload.action });
			}

			return this.createResponse(true, undefined, undefined, 'Webhook processed successfully');
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Verify webhook signature
	 */
	private async verifyWebhookSignature(payload: any, signature: string): Promise<boolean> {
		try {
			await this.loadConfig();
			if (!this.config?.webhook_secret) return false;

			const crypto = await import('crypto');
			const expectedSignature =
				'sha256=' +
				crypto
					.createHmac('sha256', this.config.webhook_secret)
					.update(JSON.stringify(payload))
					.digest('hex');

			return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
		} catch (error) {
			return false;
		}
	}

	/**
	 * Handle installation events
	 */
	private async handleInstallationEvent(payload: any): Promise<void> {
		if (payload.installation) {
			await this.executeQuery(
				db`
                    INSERT INTO github_app_installations (
                        installation_id, account_id, account_login, account_type,
                        permissions, events, is_active
                    )
                    VALUES (
                        ${payload.installation.id}, ${payload.installation.account.id},
                        ${payload.installation.account.login}, ${payload.installation.account.type},
                        ${JSON.stringify(payload.installation.permissions)}, 
                        ${payload.installation.events}, true
                    )
                    ON CONFLICT (installation_id) DO UPDATE SET
                        permissions = EXCLUDED.permissions,
                        events = EXCLUDED.events,
                        is_active = EXCLUDED.is_active,
                        updated_at = CURRENT_TIMESTAMP
                `
			);

			// Sync repositories if added
			if (payload.repositories_added) {
				await this.syncInstallationRepositories(payload.installation.id);
			}
		}
	}

	/**
	 * Handle installation removal events
	 */
	private async handleInstallationRemoval(payload: any): Promise<void> {
		if (payload.installation) {
			await this.executeQuery(
				db`
                    UPDATE github_app_installations 
                    SET is_active = false, updated_at = CURRENT_TIMESTAMP
                    WHERE installation_id = ${payload.installation.id}
                `
			);
		}
	}

	/**
	 * Handle push events for auto-deployment
	 */
	private async handlePushEvent(payload: any): Promise<void> {
		// Store webhook event
		await this.executeQuery(
			db`
                INSERT INTO webhook_events (
                    repository_full_name, event_type, event_action, source_branch,
                    commit_sha, commit_message, author_name, author_email, payload
                )
                VALUES (
                    ${payload.repository.full_name}, 'push', ${payload.action || 'push'},
                    ${payload.ref?.replace('refs/heads/', '') || 'unknown'},
                    ${payload.head_commit?.id || 'unknown'}, 
                    ${payload.head_commit?.message || 'No message'},
                    ${payload.head_commit?.author?.name || 'Unknown'},
                    ${payload.head_commit?.author?.email || 'unknown@example.com'},
                    ${JSON.stringify(payload)}
                )
            `
		);

		await this.logOperation('info', 'github_push_webhook_received', {
			repository: payload.repository.full_name,
			branch: payload.ref?.replace('refs/heads/', ''),
			commit: payload.head_commit?.id?.substring(0, 7)
		});
	}

	/**
	 * Check if GitHub App is configured
	 */
	async isConfigured(): Promise<boolean> {
		try {
			await this.loadConfig();
			return !!this.config;
		} catch (error) {
			return false;
		}
	}

	/**
	 * Get GitHub App installation URL
	 */
	getInstallationUrl(): string {
		return 'https://github.com/apps/mdo-0/installations/new';
	}

	/**
	 * Get GitHub App status for settings page
	 */
	async getAppStatus(): Promise<ServiceResponse<{ configured: boolean; installUrl: string }>> {
		try {
			const configured = await this.isConfigured();
			return this.createResponse(true, {
				configured,
				installUrl: this.getInstallationUrl()
			});
		} catch (error) {
			return this.handleError(error);
		}
	}
}

export const githubService = new GitHubService();
