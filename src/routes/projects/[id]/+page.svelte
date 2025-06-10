<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Separator } from '$lib/components/ui/separator';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import {
		ArrowLeft,
		Play,
		Square,
		RotateCcw,
		Trash2,
		ExternalLink,
		GitBranch,
		Clock,
		Activity,
		Terminal,
		Settings,
		Plus,
		X,
		Save,
		AlertCircle,
		CheckCircle,
		XCircle,
		Loader2,
		Info,
		Webhook,
		Bug
	} from 'lucide-svelte';
	import { getStatusColor, formatRelativeTime, getLogLevelColor } from '$lib/utils.js';
	import type { Project, DeploymentLog } from '$lib/types';

	export let data: PageData;

	let project: Project = data.project as unknown as Project;
	let deploymentLogs: DeploymentLog[] = data.logs as unknown as DeploymentLog[];
	let activeTab = 'overview';
	let loading = false;
	let error = '';
	let success = '';

	// Environment variables state
	let envVars = project.environment_variables
		? typeof project.environment_variables === 'string'
			? JSON.parse(project.environment_variables)
			: project.environment_variables
		: [];
	let newEnvVar = { key: '', value: '' };

	// Logs state
	let logsAutoRefresh = false;
	let logsInterval: NodeJS.Timeout;

	// Project settings state
	let projectSettings = {
		name: project.name,
		description: project.description || '',
		build_command: project.build_command || '',
		start_command: project.start_command || '',
		port: project.port || 3000,
		custom_domain: project.custom_domain || '',
		runtime: project.runtime || 'node',
		auto_deploy: project.auto_deploy !== false
	};

	onMount(() => {
		// Start auto-refresh for logs if enabled
		if (logsAutoRefresh) {
			startLogsRefresh();
		}

		return () => {
			if (logsInterval) clearInterval(logsInterval);
		};
	});

	function startLogsRefresh() {
		if (logsInterval) clearInterval(logsInterval);
		logsInterval = setInterval(async () => {
			await refreshLogs();
		}, 5000); // Refresh every 5 seconds
	}

	function stopLogsRefresh() {
		if (logsInterval) clearInterval(logsInterval);
	}

	async function refreshProject() {
		try {
			const response = await fetch(`/api/projects/${project.id}`);
			if (response.ok) {
				project = await response.json();
			}
		} catch (err) {
			console.error('Failed to refresh project:', err);
		}
	}

	async function refreshLogs() {
		try {
			const response = await fetch(`/api/projects/${project.id}/logs`);
			if (response.ok) {
				deploymentLogs = await response.json();
			}
		} catch (err) {
			console.error('Failed to refresh logs:', err);
		}
	}

	async function performAction(action: string) {
		loading = true;
		error = '';
		success = '';

		try {
			const response = await fetch(`/api/projects/${project.id}/${action}`, {
				method: 'POST'
			});

			if (response.ok) {
				success = `Project ${action} successful`;
				await refreshProject();
				await refreshLogs();
			} else {
				const result = await response.json();
				error = result.error || `Failed to ${action} project`;
			}
		} catch (err) {
			error = `Failed to ${action} project`;
			console.error(err);
		} finally {
			loading = false;
		}
	}

	async function deleteProject() {
		if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
			return;
		}

		loading = true;
		error = '';

		try {
			const response = await fetch(`/api/projects/${project.id}`, {
				method: 'DELETE'
			});

			if (response.ok) {
				goto('/projects');
			} else {
				const result = await response.json();
				error = result.error || 'Failed to delete project';
			}
		} catch (err) {
			error = 'Failed to delete project';
			console.error(err);
		} finally {
			loading = false;
		}
	}

	function addEnvVar() {
		if (newEnvVar.key && newEnvVar.value) {
			envVars = [...envVars, { ...newEnvVar }];
			newEnvVar = { key: '', value: '' };
		}
	}

	function removeEnvVar(index: number) {
		envVars = envVars.filter((_: any, i: number) => i !== index);
	}

	async function saveEnvVars() {
		loading = true;
		error = '';
		success = '';

		try {
			const response = await fetch(`/api/projects/${project.id}`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					environment_variables: JSON.stringify(envVars)
				})
			});

			if (response.ok) {
				success = 'Environment variables saved successfully';
				if (typeof project.environment_variables === 'string') {
					// Use type assertion to avoid type error
					(project.environment_variables as any) = JSON.stringify(envVars);
				} else {
					project.environment_variables = envVars;
				}
			} else {
				const result = await response.json();
				error = result.error || 'Failed to save environment variables';
			}
		} catch (err) {
			error = 'Failed to save environment variables';
			console.error(err);
		} finally {
			loading = false;
		}
	}

	async function saveProjectSettings() {
		loading = true;
		error = '';
		success = '';

		try {
			const response = await fetch(`/api/projects/${encodeURIComponent(project.name)}`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(projectSettings)
			});

			if (response.ok) {
				success = 'Project settings saved successfully';
				// Update the project object
				Object.assign(project, projectSettings);
			} else {
				const result = await response.json();
				error = result.error || 'Failed to save project settings';
			}
		} catch (err) {
			error = 'Failed to save project settings';
			console.error(err);
		} finally {
			loading = false;
		}
	}


	function getLogLevelIcon(level: string) {
		switch (level) {
			case 'success':
				return CheckCircle;
			case 'error':
				return XCircle;
			case 'warning':
				return AlertCircle;
			case 'info':
				return Activity;
			case 'build':
				return Settings;
			default:
				return Activity;
		}
	}

	function formatDate(date: string | Date) {
		return new Date(date).toLocaleString();
	}

	$: {
		if (logsAutoRefresh) {
			startLogsRefresh();
		} else {
			stopLogsRefresh();
		}
	}
</script>

<svelte:head>
	<title>{project.name} - MD0</title>
</svelte:head>

<div class="flex flex-1 flex-col gap-4 p-4 pt-8">
	<!-- Page Header -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-4">
			<Button variant="ghost" size="sm" onclick={() => goto('/projects')}>
				<ArrowLeft class="h-4 w-4 mr-2" />
			</Button>
			<div>
				<div class="flex items-center gap-3">
					<h1 class="text-2xl font-bold tracking-tight">{project.name}</h1>
					<Badge class={getStatusColor(project.status)} variant="outline">
						{project.status}
					</Badge>
				</div>
				<p class="text-muted-foreground">
					{#if project.latest_commit}
						Latest commit: {project.latest_commit.message}
					
					{/if}
				</p>
			</div>
		</div>
		<div class="flex gap-2">
			{#if project.status === 'running'}
				<Button variant="outline" size="sm" onclick={() => performAction('stop')} disabled={loading}>
					<Square class="mr-2 h-4 w-4" />
					Stop
				</Button>
				<Button variant="outline" size="sm" onclick={() => performAction('restart')} disabled={loading}>
					<RotateCcw class="mr-2 h-4 w-4" />
					Restart
				</Button>
			{:else if project.status === 'stopped'}
				<Button variant="outline" size="sm" onclick={() => performAction('start')} disabled={loading}>
					<Play class="mr-2 h-4 w-4" />
					Start
				</Button>
			{/if}
			<Button size="sm" onclick={() => performAction('deploy')} disabled={loading}>
				{#if loading}
					<Loader2 class="mr-2 h-4 w-4 animate-spin" />
				{:else}
					<Activity class="mr-2 h-4 w-4" />
				{/if}
				Deploy
			</Button>
		</div>
	</div>

	<!-- Alerts -->
	{#if error}
		<Alert variant="destructive">
			<AlertCircle class="h-4 w-4" />
			<AlertDescription>{error}</AlertDescription>
		</Alert>
	{/if}

	{#if success}
		<Alert>
			<CheckCircle class="h-4 w-4" />
			<AlertDescription>{success}</AlertDescription>
		</Alert>
	{/if}

	<!-- Project Management Content -->
	<Tabs bind:value={activeTab} class="w-full">
		<TabsList class="grid w-full grid-cols-4">
			<TabsTrigger value="overview">Overview</TabsTrigger>
			<TabsTrigger value="logs">Logs</TabsTrigger>
			<TabsTrigger value="environment">Environment</TabsTrigger>
			<TabsTrigger value="settings">Settings</TabsTrigger>
		</TabsList>

		<!-- Overview Tab -->
		<TabsContent value="overview" class="space-y-6">
			<div class="grid gap-6 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Project Info</CardTitle>
					</CardHeader>
					<CardContent class="space-y-3">
						<div class="flex justify-between">
							<span class="text-muted-foreground">Repository:</span>
							<a
								href={project.repository_url}
								target="_blank"
								class="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
							>
								<GitBranch class="h-3 w-3" />
								{project.repository_name || project.repository_url?.split('/').slice(-2).join('/') || 'No repository'}
								<ExternalLink class="h-3 w-3" />
							</a>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">Branch:</span>
							<span>{project.github_branch || 'main'}</span>
						</div>
						{#if project.latest_commit}
							<div class="flex justify-between items-start">
								<span class="text-muted-foreground">Latest Commit:</span>
								<div class="text-right max-w-xs">
									<a
										href={project.latest_commit.url}
										target="_blank"
										class="text-blue-600 dark:text-blue-400 hover:underline text-sm"
									>
										{project.latest_commit.sha.substring(0, 7)}
									</a>
									<p class="text-xs text-muted-foreground mt-1">
										{project.latest_commit.message.substring(0, 50)}{project.latest_commit.message.length > 50 ? '...' : ''}
									</p>
									<p class="text-xs text-muted-foreground">
										by {project.latest_commit.author}
									</p>
								</div>
							</div>
						{/if}
						<div class="flex justify-between">
							<span class="text-muted-foreground">Runtime:</span>
							<span class="capitalize">{project.runtime}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">Port:</span>
							<span>{project.port}</span>
						</div>
						{#if project.custom_domain}
							<div class="flex justify-between">
								<span class="text-muted-foreground">Domain:</span>
								<a
									href="https://{project.custom_domain}"
									target="_blank"
									class="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
								>
									{project.custom_domain}
									<ExternalLink class="h-3 w-3" />
								</a>
							</div>
						{/if}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Deployment Status</CardTitle>
					</CardHeader>
					<CardContent class="space-y-3">
						<div class="flex justify-between">
							<span class="text-muted-foreground">Status:</span>
							<Badge class={getStatusColor(project.status)} variant="outline">
								{project.status}
							</Badge>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">Last Deployed:</span>
							<span
								>{project.updated_at ? formatRelativeTime(project.updated_at) : 'Never'}</span
							>
						</div>
						{#if project.repository_language}
							<div class="flex justify-between">
								<span class="text-muted-foreground">Language:</span>
								<span>{project.repository_language}</span>
							</div>
						{/if}
						<div class="flex justify-between">
							<span class="text-muted-foreground">Created:</span>
							<span>{formatRelativeTime(project.created_at)}</span>
						</div>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Build Configuration</CardTitle>
				</CardHeader>
				<CardContent class="space-y-3">
					<div>
						<Label class="text-muted-foreground">Build Command:</Label>
						<p class="bg-muted rounded p-2 font-mono text-sm">
							{project.build_command || 'No build command'}
						</p>
					</div>
					<div>
						<Label class="text-muted-foreground">Start Command:</Label>
						<p class="bg-muted rounded p-2 font-mono text-sm">
							{project.start_command}
						</p>
					</div>
				</CardContent>
			</Card>
		</TabsContent>

		<!-- Logs Tab -->
		<TabsContent value="logs" class="space-y-4">
			<Card>
				<CardHeader>
					<div class="flex items-center justify-between">
						<CardTitle>Deployment Logs</CardTitle>
						<div class="flex gap-2">
							<Button
								variant="outline"
								size="sm"
								onclick={() => (logsAutoRefresh = !logsAutoRefresh)}
							>
								{logsAutoRefresh ? 'Stop' : 'Start'} Auto-refresh
							</Button>
							<Button variant="outline" size="sm" onclick={refreshLogs}>Refresh</Button>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					<div class="max-h-96 space-y-2 overflow-y-auto">
						{#each deploymentLogs as log}
							{@const LogIcon = getLogLevelIcon(log.level ?? 'info')}
							{@const logLevel = log.level ?? 'info'}
							<div class="flex gap-3 border-l-2 p-3 text-sm rounded-r-md transition-colors
								{logLevel === 'success' ? 'border-l-green-500 bg-green-50/50 dark:bg-green-950/20' :
								 logLevel === 'error' ? 'border-l-red-500 bg-red-50/50 dark:bg-red-950/20' :
								 logLevel === 'warning' ? 'border-l-yellow-500 bg-yellow-50/50 dark:bg-yellow-950/20' :
								 logLevel === 'info' ? 'border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20' :
								 logLevel === 'build' ? 'border-l-purple-500 bg-purple-50/50 dark:bg-purple-950/20' :
								 'border-l-gray-300 bg-gray-50/50 dark:bg-gray-900/20'}">
								<LogIcon class="mt-0.5 h-4 w-4 flex-shrink-0 {getLogLevelColor(logLevel)}" />
								<div class="flex-1 min-w-0">
									<div class="flex items-start justify-between gap-2">
										<p class="font-mono text-sm whitespace-pre-wrap break-words flex-1">{log.message}</p>
										<span class="text-muted-foreground text-xs whitespace-nowrap">
											{formatDate(log.created_at)}
										</span>
									</div>
								</div>
							</div>
						{:else}
							<div class="text-center py-12">
								<Activity class="h-8 w-8 text-muted-foreground mx-auto mb-3" />
								<p class="text-muted-foreground text-sm">No deployment logs available</p>
								<p class="text-muted-foreground text-xs mt-1">Logs will appear here during deployment</p>
							</div>
						{/each}
					</div>
				</CardContent>
			</Card>
		</TabsContent>

		<!-- Environment Tab -->
		<TabsContent value="environment" class="space-y-4">
			<Card>
				<CardHeader>
					<CardTitle>Environment Variables</CardTitle>
					<CardDescription>Manage environment variables for your application</CardDescription>
				</CardHeader>
				<CardContent class="space-y-4">
					{#each envVars as envVar, index}
						<div class="flex items-center gap-2">
							<Input bind:value={envVar.key} placeholder="Variable name" class="flex-1" />
							<Input bind:value={envVar.value} placeholder="Variable value" class="flex-1" />
							<Button variant="outline" size="icon" onclick={() => removeEnvVar(index)}>
								<X class="h-4 w-4" />
							</Button>
						</div>
					{/each}

					<div class="flex items-center gap-2">
						<Input bind:value={newEnvVar.key} placeholder="Variable name" class="flex-1" />
						<Input bind:value={newEnvVar.value} placeholder="Variable value" class="flex-1" />
						<Button variant="outline" size="icon" onclick={addEnvVar}>
							<Plus class="h-4 w-4" />
						</Button>
					</div>

					<div class="flex justify-end">
						<Button onclick={saveEnvVars} disabled={loading}>
							{#if loading}
								<Loader2 class="mr-2 h-4 w-4 animate-spin" />
							{:else}
								<Save class="mr-2 h-4 w-4" />
							{/if}
							Save Variables
						</Button>
					</div>
				</CardContent>
			</Card>
		</TabsContent>

		<!-- Settings Tab -->
		<TabsContent value="settings" class="space-y-4">
			<!-- General Settings -->
			<Card>
				<CardHeader>
					<CardTitle>General Settings</CardTitle>
					<CardDescription>Basic project configuration</CardDescription>
				</CardHeader>
				<CardContent class="space-y-4">
					<div class="grid gap-4 md:grid-cols-2">
						<div class="space-y-2">
							<Label for="project-name">Project Name</Label>
							<Input 
								id="project-name"
								bind:value={projectSettings.name} 
								placeholder="Enter project name" 
							/>
						</div>
						<div class="space-y-2">
							<Label for="runtime">Runtime</Label>
							<select 
								id="runtime"
								bind:value={projectSettings.runtime}
								class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
							>
								<option value="node">Node.js</option>
								<option value="python">Python</option>
								<option value="static">Static</option>
							</select>
						</div>
					</div>
					<div class="space-y-2">
						<Label for="description">Description</Label>
						<Textarea 
							id="description"
							bind:value={projectSettings.description} 
							placeholder="Enter project description" 
						/>
					</div>
				</CardContent>
			</Card>

			<!-- Build & Deployment Settings -->
			<Card>
				<CardHeader>
					<CardTitle>Build & Deployment</CardTitle>
					<CardDescription>Configure how your project is built and deployed</CardDescription>
				</CardHeader>
				<CardContent class="space-y-4">
					<div class="space-y-2">
						<Label for="build-command">Build Command</Label>
						<Input 
							id="build-command"
							bind:value={projectSettings.build_command} 
							placeholder="e.g., bun install && bun run build" 
						/>
						<p class="text-sm text-muted-foreground">
							Command to build your application. Leave empty for no build step.
						</p>
					</div>
					<div class="space-y-2">
						<Label for="start-command">Start Command</Label>
						<Input 
							id="start-command"
							bind:value={projectSettings.start_command} 
							placeholder="e.g., bun start or bun ./build/index.js" 
						/>
						<p class="text-sm text-muted-foreground">
							Command to start your application after building.
						</p>
					</div>
					<div class="grid gap-4 md:grid-cols-2">
						<div class="space-y-2">
							<Label for="port">Port</Label>
							<Input 
								id="port"
								type="number"
								bind:value={projectSettings.port} 
								placeholder="3000" 
							/>
						</div>
						<div class="flex items-center space-x-2">
							<input 
								type="checkbox" 
								id="auto-deploy"
								bind:checked={projectSettings.auto_deploy}
								class="rounded border-gray-300"
							/>
							<Label for="auto-deploy">Auto-deploy on push</Label>
						</div>
					</div>
				</CardContent>
			</Card>

			<!-- Domain Settings -->
			<Card>
				<CardHeader>
					<CardTitle>Domain & SSL</CardTitle>
					<CardDescription>Configure custom domain and SSL settings</CardDescription>
				</CardHeader>
				<CardContent class="space-y-4">
					<div class="space-y-2">
						<Label for="custom-domain">Custom Domain</Label>
						<Input 
							id="custom-domain"
							bind:value={projectSettings.custom_domain} 
							placeholder="e.g., myapp.example.com" 
						/>
						<p class="text-sm text-muted-foreground">
							Your custom domain. Make sure to point your DNS to our servers.
						</p>
					</div>
					{#if projectSettings.custom_domain}
						<div class="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 p-4">
							<h4 class="font-semibold text-blue-800 dark:text-blue-400 mb-2">DNS Configuration</h4>
							<p class="text-sm text-blue-600 dark:text-blue-300 mb-2">
								Point your domain to our servers by adding these DNS records:
							</p>
							<div class="font-mono text-xs bg-white dark:bg-gray-900 p-2 rounded border">
								<div>Type: A</div>
								<div>Name: @ (or your subdomain)</div>
								<div>Value: {data.settings?.system?.vps_ip || 'YOUR_VPS_IP'}</div>
							</div>
						</div>
					{/if}
				</CardContent>
			</Card>

			<!-- Save Settings -->
			<div class="flex justify-end">
				<Button onclick={saveProjectSettings} disabled={loading}>
					{#if loading}
						<Loader2 class="mr-2 h-4 w-4 animate-spin" />
					{:else}
						<Save class="mr-2 h-4 w-4" />
					{/if}
					Save Settings
				</Button>
			</div>

			<!-- Danger Zone -->
			<Card>
				<CardHeader>
					<CardTitle>Danger Zone</CardTitle>
					<CardDescription>Irreversible and destructive actions</CardDescription>
				</CardHeader>
				<CardContent>
					<div class="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 p-4">
						<div class="flex items-center justify-between">
							<div>
								<h4 class="font-semibold text-red-800 dark:text-red-400">Delete Project</h4>
								<p class="text-sm text-red-600 dark:text-red-300">
									This will permanently delete the project and all its data. This action cannot be
									undone.
								</p>
							</div>
							<Button variant="destructive" onclick={deleteProject} disabled={loading}>
								<Trash2 class="mr-2 h-4 w-4" />
								Delete Project
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>
		</TabsContent>
	</Tabs>
</div>
