import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth.js';
import { dbUtils } from '$lib/server/database.js';

interface SystemSettings {
	vps_hostname: string;
	vps_ip: string;
	ssh_port: number;
	ssh_key_path: string;
	nginx_config_path: string;
	docker_enabled: boolean;
	pm2_enabled: boolean;
	auto_ssl: boolean;
	monitoring_enabled: boolean;
	webhook_secret: string;
	max_projects: number;
	disk_quota_gb: number;
	backup_enabled: boolean;
	backup_retention_days: number;
	notification_webhook: string;
}

interface GitHubAppSettings {
	app_id: string;
	client_id: string;
	client_secret: string;
	private_key: string;
	webhook_secret: string;
	auto_deploy: boolean;
	default_branch: string;
	build_timeout: number;
}

interface DatabaseSettings {
	postgres_enabled: boolean;
	postgres_port: number;
	mysql_enabled: boolean;
	mysql_port: number;
	redis_enabled: boolean;
	redis_port: number;
	mongodb_enabled: boolean;
	mongodb_port: number;
	backup_schedule: string;
	max_connections: number;
}

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const user = requireAuth(locals);

		// Get all settings from the database
		const settingsResult = await dbUtils.getSettings();

		// Group settings by category
		const settings = {
			system: {} as any,
			githubApp: {} as any,
			database: {} as any
		};

		for (const row of settingsResult) {
			const { category, key, value, type } = row;
			let parsedValue = value;

			// Parse value based on type
			switch (type) {
				case 'boolean':
					parsedValue = value === 'true';
					break;
				case 'number':
					parsedValue = parseInt(value, 10);
					break;
				case 'json':
					try {
						parsedValue = JSON.parse(value);
					} catch {
						parsedValue = value;
					}
					break;
				default:
					parsedValue = value;
			}

			if (settings[category as keyof typeof settings]) {
				settings[category as keyof typeof settings][key] = parsedValue;
			}
		}

		// Set defaults for missing values
		const defaultSettings = {
			system: {
				vps_hostname: '',
				vps_ip: '',
				ssh_port: 22,
				ssh_key_path: '/root/.ssh/id_rsa',
				nginx_config_path: '/etc/nginx/sites-available',
				docker_enabled: true,
				pm2_enabled: true,
				auto_ssl: true,
				monitoring_enabled: true,
				webhook_secret: '',
				max_projects: 50,
				disk_quota_gb: 100,
				backup_enabled: true,
				backup_retention_days: 30,
				notification_webhook: ''
			},
			githubApp: {
				app_id: '',
				client_id: '',
				client_secret: '',
				private_key: '',
				webhook_secret: '',
				auto_deploy: true,
				default_branch: 'main',
				build_timeout: 600
			},
			database: {
				postgres_enabled: true,
				postgres_port: 5432,
				mysql_enabled: false,
				mysql_port: 3306,
				redis_enabled: true,
				redis_port: 6379,
				mongodb_enabled: false,
				mongodb_port: 27017,
				backup_schedule: '0 2 * * *',
				max_connections: 100
			}
		};

		// Merge defaults with existing settings
		const finalSettings = {
			system: { ...defaultSettings.system, ...settings.system },
			githubApp: { ...defaultSettings.githubApp, ...settings.githubApp },
			database: { ...defaultSettings.database, ...settings.database }
		};

		return json({
			success: true,
			data: finalSettings
		});
	} catch (error) {
		console.error('Get settings error:', error);
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Failed to get settings'
		}, { status: 500 });
	}
};

export const PUT: RequestHandler = async ({ request, locals }) => {
	try {
		const user = requireAuth(locals);
		const { system, githubApp, database } = await request.json();

		// Prepare settings for database storage
		const settingsToStore = [
			// System settings
			...Object.entries(system).map(([key, value]) => ({
				category: 'system',
				key,
				value: String(value),
				type: typeof value
			})),
			// GitHub App settings
			...Object.entries(githubApp).map(([key, value]) => ({
				category: 'githubApp',
				key,
				value: String(value),
				type: typeof value
			})),
			// Database settings
			...Object.entries(database).map(([key, value]) => ({
				category: 'database',
				key,
				value: String(value),
				type: typeof value
			}))
		];

		// Store settings in database using upsert
		for (const setting of settingsToStore) {
			await dbUtils.updateSetting(setting.category, setting.key, setting.value, setting.type);
		}

		return json({
			success: true,
			message: 'Settings saved successfully'
		});
	} catch (error) {
		console.error('Save settings error:', error);
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Failed to save settings'
		}, { status: 500 });
	}
};
