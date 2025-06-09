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
		Loader2
	} from 'lucide-svelte';
	import { getStatusColor, formatRelativeTime } from '$lib/utils.js';
	import type { Project, DeploymentLog } from '$lib/types';

	export let data: PageData;

	let project: Project = data.project as Project;
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

	function getLogLevelColor(level: string) {
		switch (level) {
			case 'success':
				return 'text-green-600 dark:text-green-400';
			case 'error':
				return 'text-red-600 dark:text-red-400';
			case 'warning':
				return 'text-yellow-600 dark:text-yellow-400';
			default:
				return 'text-muted-foreground';
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

<div class="flex flex-1 flex-col gap-4 p-4 pt-0">
	<!-- Page Header -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-4">
			<Button variant="ghost" size="sm" onclick={() => goto('/projects')}>
				<ArrowLeft class="h-4 w-4 mr-2" />
				Back to Projects
			</Button>
			<div>
				<div class="flex items-center gap-3">
					<h1 class="text-2xl font-bold tracking-tight">{project.name}</h1>
					<Badge class={getStatusColor(project.status)} variant="outline">
						{project.status}
					</Badge>
				</div>
				<p class="text-muted-foreground">
					{project.description || 'No description provided'}
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
								{project.repository_url?.split('/').slice(-2).join('/') || 'No repository'}
								<ExternalLink class="h-3 w-3" />
							</a>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">Branch:</span>
							<span>{project.branch}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">Runtime:</span>
							<span class="capitalize">{project.runtime}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">Port:</span>
							<span>{project.port}</span>
						</div>
						{#if project.domain}
							<div class="flex justify-between">
								<span class="text-muted-foreground">Domain:</span>
								<a
									href="https://{project.domain}"
									target="_blank"
									class="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
								>
									{project.domain}
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
								>{project.last_deployed_at ? formatDate(project.last_deployed_at) : 'Never'}</span
							>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">Created:</span>
							<span>{formatDate(project.created_at)}</span>
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
							<div class="flex gap-3 border-l-2 border-l-gray-200 dark:border-l-gray-700 p-2 text-sm">
								<LogIcon class="mt-0.5 h-4 w-4 {getLogLevelColor(log.level ?? 'info')}" />
								<div class="flex-1">
									<div class="flex items-start justify-between">
										<p class="font-mono whitespace-pre-wrap">{log.message}</p>
										<span class="text-muted-foreground ml-2 text-xs">
											{formatDate(log.created_at)}
										</span>
									</div>
								</div>
							</div>
						{:else}
							<p class="text-muted-foreground text-center py-8">No logs available</p>
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
