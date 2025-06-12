<!-- Live Logs Panel Component -->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { 
		Activity, 
		AlertCircle, 
		AlertTriangle,
		CheckCircle, 
		XCircle, 
		Info, 
		Settings,
		RefreshCw,
		Play,
		Pause,
		ExternalLink,
		Terminal,
		Loader2,
		Clock
	} from 'lucide-svelte';
	import { formatRelativeTime, getStatusColor } from '$lib/utils.js';
	import type { Project, DeploymentLog } from '$lib/types.js';

	interface Props {
		projects: Project[];
		maxLogs?: number;
		showProjectFilter?: boolean;
	}

	const { projects, maxLogs = 50, showProjectFilter = true }: Props = $props();

	let logs: (DeploymentLog & { project_name: string })[] = $state([]);
	let filteredLogs: (DeploymentLog & { project_name: string })[] = $state([]);
	let selectedProject: string | null = $state(null);
	let isLive = $state(true);
	let isConnected = $state(false);
	let connectionError = $state('');
	let eventSource: EventSource | null = null;

	// Auto-scroll settings
	let logContainer: HTMLElement;
	let shouldAutoScroll = $state(true);

	onMount(() => {
		connectToLiveLogs();
		return () => {
			disconnectFromLiveLogs();
		};
	});

	onDestroy(() => {
		disconnectFromLiveLogs();
	});

	function connectToLiveLogs() {
		try {
			eventSource = new EventSource('/api/new/realtime/events');
			
			eventSource.onopen = () => {
				isConnected = true;
				connectionError = '';
			};

			eventSource.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data);
					handleRealtimeMessage(data);
				} catch (error) {
					console.error('Failed to parse SSE message:', error);
				}
			};

			eventSource.onerror = () => {
				isConnected = false;
				connectionError = 'Connection lost. Attempting to reconnect...';
				
				// Auto-reconnect after 3 seconds
				setTimeout(() => {
					if (isLive) {
						connectToLiveLogs();
					}
				}, 3000);
			};
		} catch (error) {
			console.error('Failed to connect to live logs:', error);
			connectionError = 'Failed to establish connection';
		}
	}

	function disconnectFromLiveLogs() {
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
		isConnected = false;
	}

	function handleRealtimeMessage(data: any) {
		switch (data.type) {
			case 'initial_logs':
				logs = data.data.slice(0, maxLogs);
				break;
			case 'deployment_log':
				if (logs.length >= maxLogs) {
					logs = logs.slice(0, maxLogs - 1);
				}
				logs = [data.data, ...logs];
				if (shouldAutoScroll) {
					scrollToBottom();
				}
				break;
			case 'project_status_changed':
				// Update project status in the UI if needed
				updateProjectStatus(data.data.project_id, data.data.status);
				break;
		}
		
		// Update filtered logs
		updateFilteredLogs();
	}

	function updateProjectStatus(projectId: number, status: string) {
		const project = projects.find(p => p.id === projectId);
		if (project) {
			(project as any).status = status; // Type assertion to bypass strict typing
		}
	}

	function updateFilteredLogs() {
		if (selectedProject) {
			filteredLogs = logs.filter(log => log.project_name === selectedProject);
		} else {
			filteredLogs = logs;
		}
	}

	function toggleLive() {
		isLive = !isLive;
		if (isLive) {
			connectToLiveLogs();
		} else {
			disconnectFromLiveLogs();
		}
	}

	function scrollToBottom() {
		if (logContainer) {
			setTimeout(() => {
				logContainer.scrollTop = logContainer.scrollHeight;
			}, 50);
		}
	}

	function clearLogs() {
		logs = [];
		filteredLogs = [];
	}

	function selectProject(projectName: string | null) {
		selectedProject = projectName;
		updateFilteredLogs();
	}

	function getLogIcon(level: string) {
		switch (level) {
			case 'success': return CheckCircle;
			case 'error': return XCircle;
			case 'warning': return AlertTriangle;
			case 'info': return Info;
			case 'build': return Settings;
			default: return Activity;
		}
	}

	function getLogColor(level: string) {
		switch (level) {
			case 'success': return 'text-green-600';
			case 'error': return 'text-red-600';
			case 'warning': return 'text-yellow-600';
			case 'info': return 'text-blue-600';
			case 'build': return 'text-purple-600';
			default: return 'text-gray-600';
		}
	}

	function getLogBorderColor(level: string) {
		switch (level) {
			case 'success': return 'border-l-green-500 bg-green-50/30 dark:bg-green-950/20';
			case 'error': return 'border-l-red-500 bg-red-50/30 dark:bg-red-950/20';
			case 'warning': return 'border-l-yellow-500 bg-yellow-50/30 dark:bg-yellow-950/20';
			case 'info': return 'border-l-blue-500 bg-blue-50/30 dark:bg-blue-950/20';
			case 'build': return 'border-l-purple-500 bg-purple-50/30 dark:bg-purple-950/20';
			default: return 'border-l-gray-300 bg-gray-50/30 dark:bg-gray-900/20';
		}
	}

	function openProject(projectName: string) {
		window.open(`/projects/${encodeURIComponent(projectName)}`, '_blank');
	}

	// Reactive updates
	$effect(() => {
		updateFilteredLogs();
	});
</script>

<Card class="h-full flex flex-col">
	<CardHeader class="pb-3">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<Terminal class="w-5 h-5" />
				<CardTitle class="text-lg">Live Deployment Logs</CardTitle>
				<div class="flex items-center gap-1">
					{#if isConnected}
						<div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
						<span class="text-xs text-green-600 font-medium">Live</span>
					{:else}
						<div class="w-2 h-2 bg-red-500 rounded-full"></div>
						<span class="text-xs text-red-600 font-medium">Disconnected</span>
					{/if}
				</div>
			</div>
			<div class="flex items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					onclick={toggleLive}
					class="gap-1"
				>
					{#if isLive}
						<Pause class="w-3 h-3" />
						Pause
					{:else}
						<Play class="w-3 h-3" />
						Resume
					{/if}
				</Button>
				<Button
					variant="outline"
					size="sm"
					onclick={clearLogs}
					class="gap-1"
				>
					<RefreshCw class="w-3 h-3" />
					Clear
				</Button>
			</div>
		</div>
		
		{#if connectionError}
			<div class="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-950/20 p-2 rounded-md">
				<AlertCircle class="w-4 h-4" />
				{connectionError}
			</div>
		{/if}

		{#if showProjectFilter && projects.length > 0}
			<div class="flex items-center gap-2 pt-2">
				<span class="text-sm text-muted-foreground">Filter:</span>
				<div class="flex gap-1 flex-wrap">
					<Button
						variant={selectedProject === null ? "default" : "outline"}
						size="sm"
						onclick={() => selectProject(null)}
						class="h-7 px-3 text-xs"
					>
						All Projects ({logs.length})
					</Button>
					{#each projects.slice(0, 5) as project}
						{@const projectLogs = logs.filter(log => log.project_name === project.name)}
						<Button
							variant={selectedProject === project.name ? "default" : "outline"}
							size="sm"
							onclick={() => selectProject(project.name)}
							class="h-7 px-3 text-xs gap-1"
						>
							<div class="w-2 h-2 rounded-full {getStatusColor(project.status).replace('text-', 'bg-')}"></div>
							{project.name} ({projectLogs.length})
						</Button>
					{/each}
				</div>
			</div>
		{/if}
	</CardHeader>

	<CardContent class="flex-1 overflow-hidden p-0">
		<div 
			bind:this={logContainer}
			class="h-full overflow-y-auto px-4 pb-4"
			onscroll={(e) => {
				const element = e.target as HTMLElement;
				const isAtBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 10;
				shouldAutoScroll = isAtBottom;
			}}
		>
			{#if filteredLogs.length === 0}
				<div class="flex flex-col items-center justify-center h-full text-center py-12">
					{#if !isConnected}
						<Loader2 class="w-8 h-8 animate-spin text-muted-foreground mb-3" />
						<p class="text-muted-foreground text-sm">Connecting to live logs...</p>
					{:else}
						<Terminal class="w-8 h-8 text-muted-foreground mb-3" />
						<p class="text-muted-foreground text-sm">No deployment logs yet</p>
						<p class="text-muted-foreground text-xs mt-1">
							{selectedProject ? `No logs for ${selectedProject}` : 'Deploy a project to see live logs'}
						</p>
					{/if}
				</div>
			{:else}
				<div class="space-y-2">
					{#each filteredLogs as log, index}
						{@const LogIcon = getLogIcon(log.level ?? 'info')}
						{@const logLevel = log.level ?? 'info'}
						<div class="flex gap-3 border-l-2 p-3 text-sm rounded-r-md transition-colors {getLogBorderColor(logLevel)}">
							<LogIcon class="mt-0.5 w-4 h-4 flex-shrink-0 {getLogColor(logLevel)}" />
							<div class="flex-1 min-w-0">
								<div class="flex items-start justify-between gap-2 mb-1">
									<div class="flex items-center gap-2 text-xs text-muted-foreground">
										{#if log.project_name}
											<button
												onclick={() => openProject(log.project_name)}
												class="hover:text-primary underline decoration-dotted transition-colors"
											>
												{log.project_name}
											</button>
											<span>•</span>
										{/if}
										<span class="capitalize">{logLevel}</span>
										<span>•</span>
										<Clock class="w-3 h-3" />
										<span>{formatRelativeTime(log.created_at)}</span>
									</div>
								</div>
								<p class="font-mono text-sm whitespace-pre-wrap break-words">
									{log.message}
								</p>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</CardContent>
</Card>

<style>
	:global(.dark) .bg-green-50\/30 {
		background-color: rgb(34 197 94 / 0.1);
	}
	:global(.dark) .bg-red-50\/30 {
		background-color: rgb(239 68 68 / 0.1);
	}
	:global(.dark) .bg-yellow-50\/30 {
		background-color: rgb(234 179 8 / 0.1);
	}
	:global(.dark) .bg-blue-50\/30 {
		background-color: rgb(59 130 246 / 0.1);
	}
	:global(.dark) .bg-purple-50\/30 {
		background-color: rgb(147 51 234 / 0.1);
	}
	:global(.dark) .bg-gray-50\/30 {
		background-color: rgb(156 163 175 / 0.1);
	}
</style>
