<!-- Project Status Grid Component -->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { 
		ExternalLink, 
		Globe, 
		Server, 
		Activity, 
		Clock,
		AlertTriangle,
		CheckCircle,
		Pause,
		Loader2,
		GitBranch,
		Zap
	} from 'lucide-svelte';
	import { formatRelativeTime, getStatusColor, getStatusIcon } from '$lib/utils.js';
	import type { Project } from '$lib/types.js';

	interface Props {
		projects: Project[];
		showDeploymentButtons?: boolean;
		maxProjects?: number;
	}

	const { projects, showDeploymentButtons = true, maxProjects = 6 }: Props = $props();

	let isConnected = $state(false);
	let eventSource: EventSource | null = null;
	let vpsHostname = $state('');

	onMount(() => {
		connectToRealtimeUpdates();
		loadVPSHostname();
		return () => {
			disconnectFromRealtimeUpdates();
		};
	});

	onDestroy(() => {
		disconnectFromRealtimeUpdates();
	});

	async function loadVPSHostname() {
		try {
			const response = await fetch('/api/new/settings?category=vps&key=hostname');
			if (response.ok) {
				const result = await response.json();
				if (result.success && result.data) {
					vpsHostname = result.data.value || '';
				}
			}
		} catch (error) {
			console.error('Failed to load VPS hostname:', error);
		}
	}

	function connectToRealtimeUpdates() {
		try {
			eventSource = new EventSource('/api/new/realtime/events');
			
			eventSource.onopen = () => {
				isConnected = true;
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
				// Auto-reconnect after 3 seconds
				setTimeout(() => {
					connectToRealtimeUpdates();
				}, 3000);
			};
		} catch (error) {
			console.error('Failed to connect to realtime updates:', error);
		}
	}

	function disconnectFromRealtimeUpdates() {
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
		isConnected = false;
	}

	function handleRealtimeMessage(data: any) {
		switch (data.type) {
			case 'project_status_changed':
				updateProjectStatus(data.data.project_id, data.data.status);
				break;
			case 'initial_projects':
				// Optionally update projects with fresh data
				break;
		}
	}

	function updateProjectStatus(projectId: number, status: string) {
		const project = projects.find(p => p.id === projectId);
		if (project) {
			(project as any).status = status; // Type assertion to bypass strict typing
		}
	}

	function openProject(project: Project) {
		goto(`/projects/${encodeURIComponent(project.name)}`);
	}

	function openProjectUrl(project: Project, event: Event) {
		event.stopPropagation();
		if (project.custom_domain) {
			window.open(`https://${project.custom_domain}`, '_blank');
		} else if (project.port && vpsHostname) {
			window.open(`http://${vpsHostname}:${project.port}`, '_blank');
		}
	}

	function getProjectUrl(project: Project): string | null {
		if (project.custom_domain) {
			return `https://${project.custom_domain}`;
		} else if (project.port && vpsHostname) {
			return `http://${vpsHostname}:${project.port}`;
		}
		return null;
	}

	function isProjectAccessible(project: Project): boolean {
		return project.status === 'running' && !!getProjectUrl(project);
	}

	// Reactive derived values
	let displayProjects = $derived(projects.slice(0, maxProjects));
	let runningProjects = $derived(projects.filter(p => p.status === 'running').length);
	let buildingProjects = $derived(projects.filter(p => p.status === 'building').length);
	let failedProjects = $derived(projects.filter(p => p.status === 'failed').length);
</script>

<div class="space-y-4">
	<!-- Quick Stats -->
	<div class="grid grid-cols-2 md:grid-cols-4 gap-3">
		<Card class="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border-green-200 dark:border-green-800">
			<CardContent class="p-4">
				<div class="flex items-center gap-3">
					<div class="p-2 bg-green-100 dark:bg-green-900/50 rounded-lg">
						<CheckCircle class="h-4 w-4 text-green-600 dark:text-green-400" />
					</div>
					<div>
						<p class="text-sm font-medium text-green-800 dark:text-green-200">Running</p>
						<p class="text-xl font-bold text-green-900 dark:text-green-100">{runningProjects}</p>
					</div>
				</div>
			</CardContent>
		</Card>

		<Card class="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20 border-blue-200 dark:border-blue-800">
			<CardContent class="p-4">
				<div class="flex items-center gap-3">
					<div class="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
						<Loader2 class="h-4 w-4 text-blue-600 dark:text-blue-400 {buildingProjects > 0 ? 'animate-spin' : ''}" />
					</div>
					<div>
						<p class="text-sm font-medium text-blue-800 dark:text-blue-200">Building</p>
						<p class="text-xl font-bold text-blue-900 dark:text-blue-100">{buildingProjects}</p>
					</div>
				</div>
			</CardContent>
		</Card>

		<Card class="bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/20 dark:to-rose-950/20 border-red-200 dark:border-red-800">
			<CardContent class="p-4">
				<div class="flex items-center gap-3">
					<div class="p-2 bg-red-100 dark:bg-red-900/50 rounded-lg">
						<AlertTriangle class="h-4 w-4 text-red-600 dark:text-red-400" />
					</div>
					<div>
						<p class="text-sm font-medium text-red-800 dark:text-red-200">Failed</p>
						<p class="text-xl font-bold text-red-900 dark:text-red-100">{failedProjects}</p>
					</div>
				</div>
			</CardContent>
		</Card>

		<Card class="bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/20 dark:to-violet-950/20 border-purple-200 dark:border-purple-800">
			<CardContent class="p-4">
				<div class="flex items-center gap-3">
					<div class="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
						<Server class="h-4 w-4 text-purple-600 dark:text-purple-400" />
					</div>
					<div>
						<p class="text-sm font-medium text-purple-800 dark:text-purple-200">Total</p>
						<p class="text-xl font-bold text-purple-900 dark:text-purple-100">{projects.length}</p>
					</div>
				</div>
			</CardContent>
		</Card>
	</div>

	<!-- Project Grid -->
	<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
		{#each displayProjects as project}
			<Card class="group hover:shadow-lg transition-all duration-300 cursor-pointer border-2 hover:border-primary/20" onclick={() => openProject(project)}>
				<CardHeader class="pb-3">
					<div class="flex items-start justify-between">
						<div class="flex items-center gap-2 min-w-0 flex-1">
							<span class="text-lg">
								{getStatusIcon(project.status)}
							</span>
							<div class="min-w-0 flex-1">
								<CardTitle class="text-base truncate">{project.name}</CardTitle>
								<div class="flex items-center gap-2 mt-1">
									<Badge variant="outline" class={getStatusColor(project.status)}>
										{project.status}
									</Badge>
									{#if isConnected}
										<div class="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" title="Live updates active"></div>
									{/if}
								</div>
							</div>
						</div>
						
						{#if isProjectAccessible(project)}
							<Button
								variant="ghost"
								size="sm"
								onclick={(e) => openProjectUrl(project, e)}
								class="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
								title="Open application"
							>
								<ExternalLink class="h-4 w-4" />
							</Button>
						{/if}
					</div>
				</CardHeader>

				<CardContent class="pt-0 space-y-3">
					<!-- Repository info -->
					{#if project.github_url}
						<div class="flex items-center gap-2 text-sm text-muted-foreground">
							<GitBranch class="h-3 w-3" />
							<span class="truncate">
								{project.github_url.split('/').slice(-2).join('/')}
							</span>
						</div>
					{/if}

					<!-- Runtime and language -->
					<div class="flex items-center gap-4 text-sm">
						{#if project.runtime}
							<div class="flex items-center gap-1">
								<Zap class="h-3 w-3 text-muted-foreground" />
								<span class="text-muted-foreground capitalize">{project.runtime}</span>
							</div>
						{/if}
						{#if project.repository?.language}
							<div class="flex items-center gap-1">
								<div class="w-2 h-2 rounded-full bg-blue-500"></div>
								<span class="text-muted-foreground">{project.repository.language}</span>
							</div>
						{/if}
					</div>

					<!-- URL info -->
					{#if getProjectUrl(project)}
						<div class="flex items-center gap-2 text-sm">
							<Globe class="h-3 w-3 text-muted-foreground" />
							{#if project.custom_domain}
								<span class="text-blue-600 dark:text-blue-400 truncate">
									{project.custom_domain}
								</span>
							{:else if project.port}
								<span class="text-muted-foreground truncate">
									Port {project.port}
								</span>
							{/if}
						</div>
					{/if}

					<!-- Last deployed -->
					{#if project.updated_at}
						<div class="flex items-center gap-2 text-sm text-muted-foreground">
							<Clock class="h-3 w-3" />
							<span>Deployed {formatRelativeTime(project.updated_at)}</span>
						</div>
					{/if}

					<!-- Project description -->
					{#if project.description}
						<p class="text-sm text-muted-foreground line-clamp-2">
							{project.description}
						</p>
					{/if}
				</CardContent>
			</Card>
		{/each}

		<!-- Show more projects card -->
		{#if projects.length > maxProjects}
			<Card class="border-dashed border-2 hover:border-primary/50 transition-colors">
				<CardContent class="flex flex-col items-center justify-center h-full text-center p-6">
					<Server class="h-8 w-8 text-muted-foreground mb-3" />
					<p class="text-sm font-medium text-muted-foreground mb-1">
						{projects.length - maxProjects} more projects
					</p>
					<Button variant="outline" size="sm" onclick={() => goto('/projects')}>
						View All Projects
					</Button>
				</CardContent>
			</Card>
		{/if}
	</div>
</div>

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
