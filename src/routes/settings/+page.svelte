<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs/index.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import { AlertTriangle, CheckCircle, RefreshCw, Save, Settings, Server } from 'lucide-svelte';

	let { data } = $props();

	interface GitHubAppSettings {
		app_id: string;
		client_id: string;
		client_secret: string;
		private_key: string;
		webhook_secret: string;
	}

	interface VPSSettings {
		hostname: string;
		ip: string;
		ssh_port: number;
		ssh_key_path: string;
	}

	let githubSettings: GitHubAppSettings = $state({
		app_id: '',
		client_id: '',
		client_secret: '',
		private_key: '',
		webhook_secret: ''
	});

	let vpsSettings: VPSSettings = $state({
		hostname: '',
		ip: '',
		ssh_port: 22,
		ssh_key_path: ''
	});

	let loading = $state(true);
	let saving = $state(false);
	let testing = $state(false);
	let error = $state('');
	let success = $state('');
	let githubStatus = $state<'unknown' | 'connected' | 'error'>('unknown');

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
			error = '';
			
			const response = await fetch('/api/new/settings');
			if (response.ok) {
				const result = await response.json();
				if (result.success) {
					// Load GitHub settings
					if (result.data.github) {
						githubSettings = { ...githubSettings, ...result.data.github };
					}
					// Load VPS settings
					if (result.data.vps) {
						vpsSettings = { ...vpsSettings, ...result.data.vps };
					}
					
					// Check GitHub status
					await checkGitHubStatus();
				} else {
					error = result.error || 'Failed to load settings';
				}
			} else {
				error = 'Failed to fetch settings';
			}
		} catch (err) {
			console.error('Load settings error:', err);
			error = 'Failed to load settings';
		} finally {
			loading = false;
		}
	}

	async function saveGitHubSettings() {
		try {
			saving = true;
			error = '';
			success = '';

			// Save each setting individually
			const settings = [
				{ category: 'github', key: 'app_id', value: githubSettings.app_id },
				{ category: 'github', key: 'client_id', value: githubSettings.client_id },
				{ category: 'github', key: 'client_secret', value: githubSettings.client_secret },
				{ category: 'github', key: 'private_key', value: githubSettings.private_key },
				{ category: 'github', key: 'webhook_secret', value: githubSettings.webhook_secret }
			];

			for (const setting of settings) {
				const response = await fetch('/api/new/settings', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(setting)
				});

				if (!response.ok) {
					const result = await response.json();
					throw new Error(result.error || 'Failed to save setting');
				}
			}

			success = 'GitHub settings saved successfully';
			await checkGitHubStatus();
		} catch (err) {
			console.error('Save GitHub settings error:', err);
			error = err instanceof Error ? err.message : 'Failed to save GitHub settings';
		} finally {
			saving = false;
		}
	}

	async function saveVPSSettings() {
		try {
			saving = true;
			error = '';
			success = '';

			const settings = [
				{ category: 'vps', key: 'hostname', value: vpsSettings.hostname },
				{ category: 'vps', key: 'ip', value: vpsSettings.ip },
				{ category: 'vps', key: 'ssh_port', value: vpsSettings.ssh_port.toString() },
				{ category: 'vps', key: 'ssh_key_path', value: vpsSettings.ssh_key_path }
			];

			for (const setting of settings) {
				const response = await fetch('/api/new/settings', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(setting)
				});

				if (!response.ok) {
					const result = await response.json();
					throw new Error(result.error || 'Failed to save setting');
				}
			}

			success = 'VPS settings saved successfully';
		} catch (err) {
			console.error('Save VPS settings error:', err);
			error = err instanceof Error ? err.message : 'Failed to save VPS settings';
		} finally {
			saving = false;
		}
	}

	async function checkGitHubStatus() {
		try {
			const response = await fetch('/api/new/github/status');
			if (response.ok) {
				const result = await response.json();
				githubStatus = result.success && result.data.configured ? 'connected' : 'error';
			} else {
				githubStatus = 'error';
			}
		} catch (err) {
			console.error('GitHub status check error:', err);
			githubStatus = 'error';
		}
	}

	async function testGitHubConnection() {
		try {
			testing = true;
			error = '';
			success = '';

			const response = await fetch('/api/new/github/sync', {
				method: 'POST'
			});

			if (response.ok) {
				const result = await response.json();
				if (result.success) {
					success = `GitHub connection successful! Synced ${result.data.installations} installations and ${result.data.repositories} repositories.`;
					githubStatus = 'connected';
				} else {
					// Handle the specific error message
					const errorMsg = result.error || 'GitHub connection failed';
					if (errorMsg.includes('GitHub App not configured')) {
						error = 'GitHub App not configured. Please fill in all required fields and save settings first.';
					} else if (errorMsg.includes('GitHub API error: 404')) {
						error = 'GitHub App not found or not installed. Please check your App ID and install the GitHub App.';
					} else {
						error = errorMsg;
					}
					githubStatus = 'error';
				}
			} else {
				const result = await response.json();
				const errorMsg = result.error || 'GitHub connection test failed';
				if (errorMsg.includes('GitHub App not configured')) {
					error = 'GitHub App not configured. Please fill in all required fields and save settings first.';
				} else if (errorMsg.includes('GitHub API error: 404')) {
					error = 'GitHub App not found or not installed. Please check your App ID and install the GitHub App.';
				} else {
					error = errorMsg;
				}
				githubStatus = 'error';
			}
		} catch (err) {
			console.error('Test GitHub connection error:', err);
			error = 'GitHub connection test failed';
			githubStatus = 'error';
		} finally {
			testing = false;
		}
	}

	function installGitHubApp() {
		// Open GitHub App installation page
		window.open('https://github.com/apps/mdo-0/installations/new', '_blank');
	}
</script>

<div class="max-w-4xl mx-auto p-4 space-y-6">
	<div class="flex items-center gap-2 mb-6">
		<Settings class="w-5 h-5" />
		<h1 class="text-xl font-semibold">Settings</h1>
	</div>

	{#if error}
		<Alert variant="destructive">
			<AlertTriangle class="w-4 h-4" />
			<AlertDescription>{error}</AlertDescription>
		</Alert>
	{/if}

	{#if success}
		<Alert>
			<CheckCircle class="w-4 h-4" />
			<AlertDescription>{success}</AlertDescription>
		</Alert>
	{/if}

	{#if loading}
		<div class="flex items-center justify-center py-8">
			<RefreshCw class="w-5 h-5 animate-spin mr-2" />
			<span>Loading settings...</span>
		</div>
	{:else}
		<Tabs value="github" class="space-y-4">
			<TabsList class="grid w-full grid-cols-2">
				<TabsTrigger value="github">GitHub App</TabsTrigger>
				<TabsTrigger value="vps">VPS Configuration</TabsTrigger>
			</TabsList>

			<TabsContent value="github" class="space-y-4">
				<Card>
					<CardHeader>
						<CardTitle class="text-lg flex items-center gap-2">
							GitHub App Configuration
							{#if githubStatus === 'connected'}
								<CheckCircle class="w-4 h-4 text-green-600" />
							{:else if githubStatus === 'error'}
								<AlertTriangle class="w-4 h-4 text-red-600" />
							{/if}
						</CardTitle>
						<CardDescription>
							Configure GitHub App credentials for repository access and deployments.
							<br />
							<strong>Setup Steps:</strong> 1) Fill in the fields below and save, 2) Install the GitHub App, 3) Test connection.
						</CardDescription>
					</CardHeader>
					<CardContent class="space-y-4">
						{#if githubStatus === 'error'}
							<Alert variant="destructive" class="mb-4">
								<AlertTriangle class="w-4 h-4" />
								<AlertDescription>
									GitHub App not configured or not installed. Please configure the app settings below and install the GitHub App.
								</AlertDescription>
							</Alert>
						{/if}

						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div class="space-y-2">
								<Label for="app_id">App ID</Label>
								<Input
									id="app_id"
									bind:value={githubSettings.app_id}
									placeholder="GitHub App ID"
								/>
							</div>
							<div class="space-y-2">
								<Label for="client_id">Client ID</Label>
								<Input
									id="client_id"
									bind:value={githubSettings.client_id}
									placeholder="GitHub App Client ID"
								/>
							</div>
						</div>

						<div class="space-y-2">
							<Label for="client_secret">Client Secret</Label>
							<Input
								id="client_secret"
								type="password"
								bind:value={githubSettings.client_secret}
								placeholder="GitHub App Client Secret"
							/>
						</div>

						<div class="space-y-2">
							<Label for="webhook_secret">Webhook Secret</Label>
							<Input
								id="webhook_secret"
								type="password"
								bind:value={githubSettings.webhook_secret}
								placeholder="GitHub App Webhook Secret"
							/>
						</div>

						<div class="space-y-2">
							<Label for="private_key">Private Key</Label>
							<Textarea
								id="private_key"
								bind:value={githubSettings.private_key}
								placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;...&#10;-----END RSA PRIVATE KEY-----"
								rows={8}
							/>
						</div>

						<div class="flex gap-2 flex-wrap">
							<Button
								onclick={saveGitHubSettings}
								disabled={saving}
								size="sm"
							>
								{#if saving}
									<RefreshCw class="w-4 h-4 animate-spin mr-2" />
								{:else}
									<Save class="w-4 h-4 mr-2" />
								{/if}
								Save GitHub Settings
							</Button>

							<Button
								variant="outline"
								onclick={testGitHubConnection}
								disabled={testing}
								size="sm"
							>
								{#if testing}
									<RefreshCw class="w-4 h-4 animate-spin mr-2" />
								{:else}
									<RefreshCw class="w-4 h-4 mr-2" />
								{/if}
								Test Connection
							</Button>

							<Button
								variant="secondary"
								onclick={installGitHubApp}
								size="sm"
							>
								Install GitHub App
							</Button>
						</div>
					</CardContent>
				</Card>
			</TabsContent>

			<TabsContent value="vps" class="space-y-4">
				<Card>
					<CardHeader>
						<CardTitle class="text-lg flex items-center gap-2">
							<Server class="w-4 h-4" />
							VPS Configuration
						</CardTitle>
						<CardDescription>
							Configure VPS connection settings for deployments
						</CardDescription>
					</CardHeader>
					<CardContent class="space-y-4">
						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div class="space-y-2">
								<Label for="hostname">Hostname</Label>
								<Input
									id="hostname"
									bind:value={vpsSettings.hostname}
									placeholder="example.com"
								/>
							</div>
							<div class="space-y-2">
								<Label for="ip">IP Address</Label>
								<Input
									id="ip"
									bind:value={vpsSettings.ip}
									placeholder="192.168.1.100"
								/>
							</div>
						</div>

						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div class="space-y-2">
								<Label for="ssh_port">SSH Port</Label>
								<Input
									id="ssh_port"
									type="number"
									bind:value={vpsSettings.ssh_port}
									placeholder="22"
								/>
							</div>
							<div class="space-y-2">
								<Label for="ssh_key_path">SSH Key Path</Label>
								<Input
									id="ssh_key_path"
									bind:value={vpsSettings.ssh_key_path}
									placeholder="/path/to/ssh/key"
								/>
							</div>
						</div>

						<div class="flex gap-2">
							<Button
								onclick={saveVPSSettings}
								disabled={saving}
								size="sm"
							>
								{#if saving}
									<RefreshCw class="w-4 h-4 animate-spin mr-2" />
								{:else}
									<Save class="w-4 h-4 mr-2" />
								{/if}
								Save VPS Settings
							</Button>
						</div>
					</CardContent>
				</Card>
			</TabsContent>
		</Tabs>
	{/if}
</div>