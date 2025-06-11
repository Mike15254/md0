import { db } from '../server/database.js';
import { BaseService } from './database.js';
import type { ServiceResponse, AppConfig } from './types.js';

/**
 * Configuration service for managing application settings
 */
export class ConfigService extends BaseService {
	/**
	 * Get all settings grouped by category
	 */
	async getSettings(): Promise<ServiceResponse<AppConfig>> {
		try {
			type SettingRecord = {
				category: string;
				key: string;
				value: string;
				type: string;
			};

			const settings = await this.executeQuery(
				db`SELECT category, key, value, type FROM settings ORDER BY category, key`
			);

			const config: any = {
				github: {},
				vps: {},
				database: {},
				deployment: {}
			};

			for (const setting of settings) {
				const { category, key, value, type } = setting as SettingRecord;
				let parsedValue: any = value;

				// Parse value based on type
				switch (type) {
					case 'boolean':
						parsedValue = value === 'true';
						break;
					case 'number':
						parsedValue = parseInt(value) || 0;
						break;
					case 'json':
						try {
							parsedValue = JSON.parse(value);
						} catch {
							parsedValue = {};
						}
						break;
				}

				// Map category names to config structure
				const configCategory = this.mapCategoryToConfig(category);
				if (configCategory && config[configCategory]) {
					config[configCategory][key] = parsedValue;
				}
			}

			return this.createResponse(true, config);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Get settings for a specific category
	 */
	async getCategorySettings(category: string): Promise<ServiceResponse<Record<string, any>>> {
		try {
			type SettingRecord = {
				key: string;
				value: string;
				type: string;
			};

			const settings = await this.executeQuery(
				db`SELECT key, value, type FROM settings WHERE category = ${category} ORDER BY key`
			);

			const config: Record<string, any> = {};

			for (const setting of settings) {
				const { key, value, type } = setting as SettingRecord;
				let parsedValue: any = value;

				switch (type) {
					case 'boolean':
						parsedValue = value === 'true';
						break;
					case 'number':
						parsedValue = parseInt(value) || 0;
						break;
					case 'json':
						try {
							parsedValue = JSON.parse(value);
						} catch {
							parsedValue = {};
						}
						break;
				}

				config[key] = parsedValue;
			}

			return this.createResponse(true, config);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Update a setting
	 */
	async updateSetting(
		category: string,
		key: string,
		value: any,
		type: 'string' | 'number' | 'boolean' | 'json' = 'string'
	): Promise<ServiceResponse> {
		try {
			// Convert value to string based on type
			let stringValue: string;
			switch (type) {
				case 'boolean':
					stringValue = value ? 'true' : 'false';
					break;
				case 'number':
					stringValue = value.toString();
					break;
				case 'json':
					stringValue = JSON.stringify(value);
					break;
				default:
					stringValue = value.toString();
			}

			await this.executeQuery(
				db`
                    INSERT INTO settings (category, key, value, type)
                    VALUES (${category}, ${key}, ${stringValue}, ${type})
                    ON CONFLICT (category, key) DO UPDATE SET
                        value = EXCLUDED.value,
                        type = EXCLUDED.type,
                        updated_at = CURRENT_TIMESTAMP
                `
			);

			await this.logOperation('info', 'setting_updated', { category, key, type });

			return this.createResponse(true, undefined, undefined, 'Setting updated successfully');
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Update multiple settings in a category
	 */
	async updateCategorySettings(
		category: string,
		settings: Record<string, { value: any; type?: 'string' | 'number' | 'boolean' | 'json' }>
	): Promise<ServiceResponse<{ updated: number }>> {
		try {
			let updated = 0;

			for (const [key, config] of Object.entries(settings)) {
				const result = await this.updateSetting(
					category,
					key,
					config.value,
					config.type || 'string'
				);

				if (result.success) {
					updated++;
				}
			}

			await this.logOperation('info', 'category_settings_updated', { category, count: updated });

			return this.createResponse(
				true,
				{ updated },
				undefined,
				`${updated} settings updated successfully`
			);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Get a specific setting value
	 */
	async getSetting(category: string, key: string): Promise<ServiceResponse<any>> {
		try {
			const settings = await this.executeQuery(
				db`SELECT value, type FROM settings WHERE category = ${category} AND key = ${key}`
			);

			if (settings.length === 0) {
				return this.createResponse(false, undefined, 'Setting not found');
			}

			const { value, type } = settings[0] as { value: string; type: string };
			let parsedValue: any = value;

			switch (type) {
				case 'boolean':
					parsedValue = value === 'true';
					break;
				case 'number':
					parsedValue = parseInt(value) || 0;
					break;
				case 'json':
					try {
						parsedValue = JSON.parse(value);
					} catch {
						parsedValue = {};
					}
					break;
			}

			return this.createResponse(true, parsedValue);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Validate configuration completeness
	 */
	async validateConfiguration(): Promise<
		ServiceResponse<{
			github_app: { configured: boolean; missing: string[] };
			vps: { configured: boolean; missing: string[] };
			overall: boolean;
		}>
	> {
		try {
			const githubAppSettings = await this.getCategorySettings('github_app');
			const vpsSettings = await this.getCategorySettings('vps');

			const requiredGitHubAppKeys = [
				'app_id',
				'client_id',
				'client_secret',
				'private_key',
				'webhook_secret'
			];
			const requiredVpsKeys = ['hostname', 'ip_address'];

			const missingGitHubApp = requiredGitHubAppKeys.filter(
				(key) => !githubAppSettings.data?.[key] || githubAppSettings.data[key] === ''
			);

			const missingVps = requiredVpsKeys.filter(
				(key) => !vpsSettings.data?.[key] || vpsSettings.data[key] === ''
			);

			const githubConfigured = missingGitHubApp.length === 0;
			const vpsConfigured = missingVps.length === 0;

			return this.createResponse(true, {
				github_app: {
					configured: githubConfigured,
					missing: missingGitHubApp
				},
				vps: {
					configured: vpsConfigured,
					missing: missingVps
				},
				overall: githubConfigured && vpsConfigured
			});
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Initialize default settings if they don't exist
	 */
	async initializeDefaultSettings(): Promise<ServiceResponse> {
		try {
			const defaultSettings = [
				// GitHub App settings
				{ category: 'github_app', key: 'app_id', value: '', type: 'string' },
				{ category: 'github_app', key: 'client_id', value: '', type: 'string' },
				{ category: 'github_app', key: 'client_secret', value: '', type: 'string' },
				{ category: 'github_app', key: 'private_key', value: '', type: 'string' },
				{ category: 'github_app', key: 'webhook_secret', value: '', type: 'string' },

				// VPS settings
				{ category: 'vps', key: 'hostname', value: '', type: 'string' },
				{ category: 'vps', key: 'ip_address', value: '', type: 'string' },
				{ category: 'vps', key: 'ssh_port', value: '22', type: 'number' },
				{
					category: 'vps',
					key: 'nginx_config_path',
					value: '/etc/nginx/sites-available',
					type: 'string'
				},
				{ category: 'vps', key: 'docker_enabled', value: 'true', type: 'boolean' },
				{ category: 'vps', key: 'monitoring_enabled', value: 'true', type: 'boolean' },
				{ category: 'vps', key: 'max_projects', value: '50', type: 'number' },
				{ category: 'vps', key: 'disk_quota_gb', value: '100', type: 'number' },

				// Database settings
				{ category: 'database', key: 'postgres_enabled', value: 'true', type: 'boolean' },
				{ category: 'database', key: 'postgres_port', value: '5432', type: 'number' },
				{ category: 'database', key: 'pocketbase_enabled', value: 'true', type: 'boolean' },
				{ category: 'database', key: 'pocketbase_port', value: '8090', type: 'number' },
				{ category: 'database', key: 'backup_enabled', value: 'true', type: 'boolean' },
				{ category: 'database', key: 'backup_schedule', value: '0 2 * * *', type: 'string' },
				{ category: 'database', key: 'backup_retention_days', value: '30', type: 'number' },

				// Deployment settings
				{ category: 'deployment', key: 'build_timeout', value: '600', type: 'number' },
				{ category: 'deployment', key: 'default_memory_limit', value: '512', type: 'number' },
				{ category: 'deployment', key: 'default_cpu_limit', value: '1', type: 'number' },
				{ category: 'deployment', key: 'auto_deploy_enabled', value: 'true', type: 'boolean' }
			];

			let initialized = 0;

			for (const setting of defaultSettings) {
				try {
					await this.executeQuery(
						db`
                            INSERT INTO settings (category, key, value, type)
                            VALUES (${setting.category}, ${setting.key}, ${setting.value}, ${setting.type})
                            ON CONFLICT (category, key) DO NOTHING
                        `
					);
					initialized++;
				} catch (error) {
					console.warn(`Failed to initialize setting ${setting.category}.${setting.key}:`, error);
				}
			}

			return this.createResponse(
				true,
				undefined,
				undefined,
				`Initialized ${initialized} default settings`
			);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Export configuration for backup
	 */
	async exportConfiguration(): Promise<ServiceResponse<{ settings: any[]; export_date: string }>> {
		try {
			const settings = await this.executeQuery(
				db`SELECT category, key, value, type FROM settings ORDER BY category, key`
			);

			return this.createResponse(true, {
				settings,
				export_date: new Date().toISOString()
			});
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Import configuration from backup
	 */
	async importConfiguration(
		settings: any[]
	): Promise<ServiceResponse<{ imported: number; skipped: number }>> {
		try {
			let imported = 0;
			let skipped = 0;

			for (const setting of settings) {
				try {
					await this.executeQuery(
						db`
                            INSERT INTO settings (category, key, value, type)
                            VALUES (${setting.category}, ${setting.key}, ${setting.value}, ${setting.type})
                            ON CONFLICT (category, key) DO UPDATE SET
                                value = EXCLUDED.value,
                                type = EXCLUDED.type,
                                updated_at = CURRENT_TIMESTAMP
                        `
					);
					imported++;
				} catch (error) {
					console.warn(`Failed to import setting ${setting.category}.${setting.key}:`, error);
					skipped++;
				}
			}

			await this.logOperation('info', 'configuration_imported', { imported, skipped });

			return this.createResponse(
				true,
				{ imported, skipped },
				undefined,
				`Configuration imported: ${imported} settings imported, ${skipped} skipped`
			);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Map database category names to config structure
	 */
	private mapCategoryToConfig(category: string): string | null {
		const mapping: Record<string, string> = {
			github_app: 'github',
			vps: 'vps',
			database: 'database',
			deployment: 'deployment'
		};

		return mapping[category] || null;
	}
}

export const configService = new ConfigService();
