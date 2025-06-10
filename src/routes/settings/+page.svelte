<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import GitHubAppStatus from '$lib/components/GitHubAppStatus.svelte';
	import {
		Settings,
		Server,
		Database,
		Key,
		Globe,
		Shield,
		Save,
		RefreshCw,
		AlertTriangle,
		CheckCircle,
		GitBranch
	} from 'lucide-svelte';

	let { data } = $props();

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

	let systemSettings: SystemSettings = $state({
		vps_hostname: '',
		vps_ip: '',
		ssh_port: 22,
		ssh_key_path: '/root/.ssh/id_rsa',
		nginx_config_path: '/etc/nginx/sites-available',
		docker_enabled: true,
		pm2_enabled: true,
		auto_ssl: true,
		monitoring_enabled: true,
		max_projects: 50,
		disk_quota_gb: 100,
		backup_enabled: true,
		backup_retention_days: 30,
		notification_webhook: ''
	});

	let githubAppSettings: GitHubAppSettings = $state({
		app_id: '',
		client_id: '',
		client_secret: '',
		private_key: '',
		webhook_secret: '',
		auto_deploy: true,
		default_branch: 'main',
		build_timeout: 600
	});

	let databaseSettings: DatabaseSettings = $state({
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
	});

	let loading = $state(true);
	let saving = $state(false);
	let error = $state('');
	let success = $state('');
	let activeTab = $state('system');

	// Redirect to login if not authenticated
	$effect(() => {
		if (!data.user) {
			goto('/login');
		}
	});

	onMount(() => {
		loadSettings();
	});

	async function loadSettings() {
		try {
			loading = true;
			const response = await fetch('/api/settings');
			if (response.ok) {
				const result = await response.json();
				if (result.success) {
					systemSettings = { ...systemSettings, ...result.data.system };
					githubAppSettings = { ...githubAppSettings, ...result.data.githubApp };
					databaseSettings = { ...databaseSettings, ...result.data.database };
				} else {
					error = result.error || 'Failed to load settings';
				}
			} else {
				error = 'Failed to fetch settings';
			}
		} catch (err) {
			error = 'Failed to load settings';
			console.error('Settings load error:', err);
		} finally {
			loading = false;
		}
	}

	async function saveSettings() {
		try {
			saving = true;
			error = '';
			success = '';

			const response = await fetch('/api/settings', {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					system: systemSettings,
					githubApp: githubAppSettings,
					database: databaseSettings
				})
			});

			const result = await response.json();
			if (result.success) {
				success = 'Settings saved successfully';
			} else {
				error = result.error || 'Failed to save settings';
			}
		} catch (err) {
			error = 'Failed to save settings';
			console.error('Settings save error:', err);
		} finally {
			saving = false;
		}
	}

	async function testConnection() {
		try {
			const response = await fetch('/api/settings/test-connection', {
				method: 'POST'
			});
			const result = await response.json();
			if (result.success) {
				success = 'VPS connection successful';
			} else {
				error = result.error || 'Connection test failed';
			}
		} catch (err) {
			error = 'Connection test failed';
			console.error('Connection test error:', err);
		}
	}

	async function generateGitHubAppWebhookSecret() {
		const secret = crypto.randomUUID().replace(/-/g, '');
		githubAppSettings.webhook_secret = secret;
	}
</script>

<svelte:head>
	<title>MD0 - Settings</title>
</svelte:head>

<div class="flex flex-1 flex-col gap-4 p-4 pt-0">
	<!-- Page Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Settings</h1>
			<p class="text-muted-foreground">Manage your deployment platform configuration</p>
		</div>
		<Button onclick={saveSettings} disabled={saving} size="sm">
			{#if saving}
				<RefreshCw class="mr-2 h-4 w-4 animate-spin" />
			{:else}
				<Save class="mr-2 h-4 w-4" />
			{/if}
			Save Settings
		</Button>
	</div>
	<!-- Alerts -->
	{#if error}
		<Alert variant="destructive">
			<AlertTriangle class="h-4 w-4" />
			<AlertDescription>{error}</AlertDescription>
		</Alert>
	{/if}

	{#if success}
		<Alert>
			<CheckCircle class="h-4 w-4" />
			<AlertDescription>{success}</AlertDescription>
		</Alert>
	{/if}

	{#if loading}
		<div class="flex items-center justify-center py-12">
			<RefreshCw class="mr-2 h-6 w-6 animate-spin" />
			<span>Loading settings...</span>
		</div>
	{:else}
		<!-- Settings Content -->
		<Tabs bind:value={activeTab} class="w-full">
			<TabsList class="grid w-full grid-cols-3">
				<TabsTrigger value="system">
					<Server class="mr-2 h-4 w-4" />
					System
				</TabsTrigger>
				<TabsTrigger value="github">
					<GitBranch class="mr-2 h-4 w-4" />
					GitHub App
				</TabsTrigger>
				<TabsTrigger value="database">
					<Database class="mr-2 h-4 w-4" />
					Database
				</TabsTrigger>
			</TabsList>

			<!-- System Settings -->
			<TabsContent value="system" class="space-y-6">
				<!-- VPS Configuration -->
				<Card>
					<CardHeader>
						<CardTitle class="flex items-center">
							<Server class="mr-2 h-5 w-5" />
							VPS Configuration
						</CardTitle>
						<CardDescription>Configure your VPS connection and server settings</CardDescription>
					</CardHeader>
					<CardContent class="space-y-4">
						<div class="grid grid-cols-2 gap-4">
							<div class="space-y-2">
								<Label for="vps_hostname">VPS Hostname</Label>
								<Input
									id="vps_hostname"
									bind:value={systemSettings.vps_hostname}
									placeholder="your-vps.example.com"
								/>
							</div>
							<div class="space-y-2">
								<Label for="vps_ip">VPS IP Address</Label>
								<Input id="vps_ip" bind:value={systemSettings.vps_ip} placeholder="192.168.1.100" />
							</div>
						</div>

						<div class="grid grid-cols-2 gap-4">
							<div class="space-y-2">
								<Label for="ssh_port">SSH Port</Label>
								<Input
									id="ssh_port"
									type="number"
									bind:value={systemSettings.ssh_port}
									placeholder="22"
								/>
							</div>
							<div class="space-y-2">
								<Label for="ssh_key_path">SSH Key Path</Label>
								<Input
									id="ssh_key_path"
									bind:value={systemSettings.ssh_key_path}
									placeholder="/root/.ssh/id_rsa"
								/>
							</div>
						</div>

						<div class="space-y-2">
							<Label for="nginx_config_path">Nginx Config Path</Label>
							<Input
								id="nginx_config_path"
								bind:value={systemSettings.nginx_config_path}
								placeholder="/etc/nginx/sites-available"
							/>
						</div>

						<div class="flex justify-end">
							<Button variant="outline" onclick={testConnection}>
								<Globe class="mr-2 h-4 w-4" />
								Test Connection
							</Button>
						</div>
					</CardContent>
				</Card>

				<!-- Deployment Options -->
				<Card>
					<CardHeader>
						<CardTitle>Deployment Options</CardTitle>
						<CardDescription>Configure deployment methods and settings</CardDescription>
					</CardHeader>
					<CardContent class="space-y-4">
						<div class="flex items-center justify-between">
							<div class="space-y-0.5">
								<Label>Docker Support</Label>
								<p class="text-muted-foreground text-sm">Enable Docker-based deployments</p>
							</div>
							<Switch bind:checked={systemSettings.docker_enabled} />
						</div>

						<div class="flex items-center justify-between">
							<div class="space-y-0.5">
								<Label>PM2 Support</Label>
								<p class="text-muted-foreground text-sm">Enable PM2 process manager deployments</p>
							</div>
							<Switch bind:checked={systemSettings.pm2_enabled} />
						</div>

						<div class="flex items-center justify-between">
							<div class="space-y-0.5">
								<Label>Auto SSL</Label>
								<p class="text-muted-foreground text-sm">Automatically generate SSL certificates</p>
							</div>
							<Switch bind:checked={systemSettings.auto_ssl} />
						</div>

						<div class="flex items-center justify-between">
							<div class="space-y-0.5">
								<Label>System Monitoring</Label>
								<p class="text-muted-foreground text-sm">Enable system resource monitoring</p>
							</div>
							<Switch bind:checked={systemSettings.monitoring_enabled} />
						</div>
					</CardContent>
				</Card>

				<!-- Resource Limits -->
				<Card>
					<CardHeader>
						<CardTitle>Resource Limits</CardTitle>
						<CardDescription>Configure system resource limits and quotas</CardDescription>
					</CardHeader>
					<CardContent class="space-y-4">
						<div class="grid grid-cols-2 gap-4">
							<div class="space-y-2">
								<Label for="max_projects">Max Projects</Label>
								<Input
									id="max_projects"
									type="number"
									bind:value={systemSettings.max_projects}
									placeholder="50"
								/>
							</div>
							<div class="space-y-2">
								<Label for="disk_quota_gb">Disk Quota (GB)</Label>
								<Input
									id="disk_quota_gb"
									type="number"
									bind:value={systemSettings.disk_quota_gb}
									placeholder="100"
								/>
							</div>
						</div>
					</CardContent>
				</Card>

				<!-- Webhooks & Security -->
				<Card>
					<CardHeader>
						<CardTitle class="flex items-center">
							<Shield class="mr-2 h-5 w-5" />
							Notifications
						</CardTitle>
						<CardDescription>Configure notification settings</CardDescription>
					</CardHeader>
					<CardContent class="space-y-4">
						<div class="space-y-2">
							<Label for="notification_webhook">Notification Webhook URL</Label>
							<Input
								id="notification_webhook"
								bind:value={systemSettings.notification_webhook}
								placeholder="https://discord.com/api/webhooks/..."
							/>
							<p class="text-xs text-muted-foreground">
								Optional webhook URL for deployment notifications (Discord, Slack, etc.)
							</p>
						</div>
					</CardContent>
				</Card>
			</TabsContent>

			<!-- GitHub App Settings -->
			<TabsContent value="github" class="space-y-6">

				<!-- GitHub App Status -->
				<Card>
					<CardHeader>
						<CardTitle class="flex items-center">
							<Shield class="mr-2 h-5 w-5" />
							GitHub App Status
						</CardTitle>
						<CardDescription>View GitHub App installation status and manage repositories</CardDescription>
					</CardHeader>
					<CardContent class="space-y-4">
						<GitHubAppStatus />
					</CardContent>
				</Card>
			</TabsContent>

			<!-- Database Settings -->
			<TabsContent value="database" class="space-y-6">
				<Card>
					<CardHeader>
						<CardTitle class="flex items-center">
							<Database class="mr-2 h-5 w-5" />
							Database Services
						</CardTitle>
						<CardDescription>
							Configure available database services and their settings
						</CardDescription>
					</CardHeader>
					<CardContent class="space-y-6">
						<!-- PostgreSQL -->
						<div class="space-y-4">
							<div class="flex items-center justify-between">
								<div class="space-y-0.5">
									<Label class="flex items-center">
										<Badge variant="secondary" class="mr-2">PostgreSQL</Badge>
									</Label>
									<p class="text-muted-foreground text-sm">Enable PostgreSQL database service</p>
								</div>
								<Switch bind:checked={databaseSettings.postgres_enabled} />
							</div>
							{#if databaseSettings.postgres_enabled}
								<div class="ml-4 space-y-2">
									<Label for="postgres_port">PostgreSQL Port</Label>
									<Input
										id="postgres_port"
										type="number"
										bind:value={databaseSettings.postgres_port}
										placeholder="5432"
									/>
								</div>
							{/if}
						</div>

						<Separator />

						<!-- MySQL -->
						<div class="space-y-4">
							<div class="flex items-center justify-between">
								<div class="space-y-0.5">
									<Label class="flex items-center">
										<Badge variant="secondary" class="mr-2">MySQL</Badge>
									</Label>
									<p class="text-muted-foreground text-sm">Enable MySQL database service</p>
								</div>
								<Switch bind:checked={databaseSettings.mysql_enabled} />
							</div>
							{#if databaseSettings.mysql_enabled}
								<div class="ml-4 space-y-2">
									<Label for="mysql_port">MySQL Port</Label>
									<Input
										id="mysql_port"
										type="number"
										bind:value={databaseSettings.mysql_port}
										placeholder="3306"
									/>
								</div>
							{/if}
						</div>

						<Separator />

						<!-- Redis -->
						<div class="space-y-4">
							<div class="flex items-center justify-between">
								<div class="space-y-0.5">
									<Label class="flex items-center">
										<Badge variant="secondary" class="mr-2">Redis</Badge>
									</Label>
									<p class="text-muted-foreground text-sm">Enable Redis cache service</p>
								</div>
								<Switch bind:checked={databaseSettings.redis_enabled} />
							</div>
							{#if databaseSettings.redis_enabled}
								<div class="ml-4 space-y-2">
									<Label for="redis_port">Redis Port</Label>
									<Input
										id="redis_port"
										type="number"
										bind:value={databaseSettings.redis_port}
										placeholder="6379"
									/>
								</div>
							{/if}
						</div>

						<Separator />

						<!-- MongoDB -->
						<div class="space-y-4">
							<div class="flex items-center justify-between">
								<div class="space-y-0.5">
									<Label class="flex items-center">
										<Badge variant="secondary" class="mr-2">MongoDB</Badge>
									</Label>
									<p class="text-muted-foreground text-sm">Enable MongoDB database service</p>
								</div>
								<Switch bind:checked={databaseSettings.mongodb_enabled} />
							</div>
							{#if databaseSettings.mongodb_enabled}
								<div class="ml-4 space-y-2">
									<Label for="mongodb_port">MongoDB Port</Label>
									<Input
										id="mongodb_port"
										type="number"
										bind:value={databaseSettings.mongodb_port}
										placeholder="27017"
									/>
								</div>
							{/if}
						</div>
					</CardContent>
				</Card>

				<!-- Backup Settings -->
				<Card>
					<CardHeader>
						<CardTitle>Backup Settings</CardTitle>
						<CardDescription>Configure database backup and retention policies</CardDescription>
					</CardHeader>
					<CardContent class="space-y-4">
						<div class="flex items-center justify-between">
							<div class="space-y-0.5">
								<Label>Enable Backups</Label>
								<p class="text-muted-foreground text-sm">Automatically backup databases</p>
							</div>
							<Switch bind:checked={systemSettings.backup_enabled} />
						</div>

						{#if systemSettings.backup_enabled}
							<div class="grid grid-cols-2 gap-4">
								<div class="space-y-2">
									<Label for="backup_schedule">Backup Schedule (Cron)</Label>
									<Input
										id="backup_schedule"
										bind:value={databaseSettings.backup_schedule}
										placeholder="0 2 * * *"
									/>
								</div>
								<div class="space-y-2">
									<Label for="backup_retention_days">Retention (Days)</Label>
									<Input
										id="backup_retention_days"
										type="number"
										bind:value={systemSettings.backup_retention_days}
										placeholder="30"
									/>
								</div>
							</div>

							<div class="space-y-2">
								<Label for="max_connections">Max Connections</Label>
								<Input
									id="max_connections"
									type="number"
									bind:value={databaseSettings.max_connections}
									placeholder="100"
								/>
							</div>
						{/if}
					</CardContent>
				</Card>
			</TabsContent>
		</Tabs>
	{/if}
</div>
