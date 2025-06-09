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
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { getStatusColor, getStatusIcon, formatUptime, formatRelativeTime } from '$lib/utils.js';
	import {
		Plus,
		Server,
		Database,
		Activity,
		BarChart3,
		GitBranch,
		ExternalLink
	} from 'lucide-svelte';
	import type { Project, SystemMetrics } from '$lib/types.js';

	let { data } = $props();

	let projects: Project[] = $state([]);
	let systemMetrics: SystemMetrics | null = $state(null);
	let loading = $state(true);
	let error = $state('');

	// Redirect to login if not authenticated
	$effect(() => {
		if (!data.user) {
			goto('/login');
		}
	});

	onMount(() => {
		loadDashboardData();
		// Refresh data every 30 seconds
		const interval = setInterval(loadDashboardData, 30000);
		return () => clearInterval(interval);
	});

	async function loadDashboardData() {
		try {
			// Load projects
			const projectsResponse = await fetch('/api/projects');
			if (projectsResponse.ok) {
				const projectsResult = await projectsResponse.json();
				projects = projectsResult.data || [];
			}

			// Load system metrics
			const metricsResponse = await fetch('/api/system/metrics');
			if (metricsResponse.ok) {
				const metricsResult = await metricsResponse.json();
				systemMetrics = metricsResult.data?.current_metrics;
			}
		} catch (err) {
			error = 'Failed to load dashboard data';
			console.error('Dashboard load error:', err);
		} finally {
			loading = false;
		}
	}

	let runningProjects = $derived(projects.filter((p) => p.status === 'running').length);
	let failedProjects = $derived(projects.filter((p) => p.status === 'failed').length);
</script>

<div class="flex flex-1 flex-col gap-6 p-6">
	{#if loading}
		<div class="flex h-[50vh] items-center justify-center">
			<div class="flex flex-col items-center gap-2">
				<div class="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
				<div class="text-sm text-muted-foreground">Loading dashboard...</div>
			</div>
		</div>
	{:else if error}
		<Card class="border-destructive/50 bg-destructive/5">
			<CardContent class="pt-6">
				<div class="flex items-center gap-2">
					<div class="text-destructive">⚠</div>
					<div class="text-destructive font-medium">{error}</div>
				</div>
			</CardContent>
		</Card>
	{:else}
		<!-- Page Header -->
		<div class="flex flex-col gap-2">
			<h1 class="text-3xl font-bold tracking-tight">Dashboard</h1>
			<p class="text-muted-foreground">
				Overview of your projects and system resources
			</p>
		</div>

		<!-- System Overview Cards -->
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<Card class="hover:shadow-md transition-shadow">
				<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle class="text-sm font-medium">Total Projects</CardTitle>
					<div class="h-4 w-4 text-muted-foreground">📦</div>
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold">{projects.length}</div>
					<p class="text-xs text-muted-foreground mt-1">
						Deployed applications
					</p>
				</CardContent>
			</Card>

			<Card class="hover:shadow-md transition-shadow">
				<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle class="text-sm font-medium">Running</CardTitle>
					<div class="h-4 w-4 text-green-600">●</div>
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold text-green-600">{runningProjects}</div>
					<p class="text-xs text-muted-foreground mt-1">
						Active services
					</p>
				</CardContent>
			</Card>

			<Card class="hover:shadow-md transition-shadow">
				<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle class="text-sm font-medium">Failed</CardTitle>
					<div class="h-4 w-4 text-red-600">✕</div>
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold text-red-600">{failedProjects}</div>
					<p class="text-xs text-muted-foreground mt-1">
						Need attention
					</p>
				</CardContent>
			</Card>

			<Card class="hover:shadow-md transition-shadow">
				<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle class="text-sm font-medium">System Uptime</CardTitle>
					<div class="h-4 w-4 text-muted-foreground">⏱️</div>
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold">
						{systemMetrics?.uptime_seconds ? formatUptime(systemMetrics.uptime_seconds) : 'N/A'}
					</div>
					<p class="text-xs text-muted-foreground mt-1">
						Server runtime
					</p>
				</CardContent>
			</Card>
		</div>

		<!-- System Resources -->
		{#if systemMetrics}
			<Card class="hover:shadow-md transition-shadow">
				<CardHeader>
					<CardTitle class="flex items-center gap-2">
						<Server class="h-5 w-5" />
						System Resources
					</CardTitle>
					<CardDescription>Current server resource usage</CardDescription>
				</CardHeader>
				<CardContent>
					<div class="grid grid-cols-1 gap-6 md:grid-cols-3">
						<div class="space-y-2">
							<div class="flex justify-between text-sm">
								<span class="flex items-center gap-2">
									<div class="h-2 w-2 rounded-full bg-blue-500"></div>
									CPU Usage
								</span>
								<span class="font-medium">{systemMetrics.cpu_usage.toFixed(1)}%</span>
							</div>
							<div class="h-2 w-full rounded-full bg-secondary overflow-hidden">
								<div
									class="h-full rounded-full bg-blue-500 transition-all duration-500"
									style="width: {Math.min(systemMetrics.cpu_usage, 100)}%"
								></div>
							</div>
						</div>

						<div class="space-y-2">
							<div class="flex justify-between text-sm">
								<span class="flex items-center gap-2">
									<div class="h-2 w-2 rounded-full bg-green-500"></div>
									Memory Usage
								</span>
								<span class="font-medium">{systemMetrics.memory_usage.toFixed(1)}%</span>
							</div>
							<div class="h-2 w-full rounded-full bg-secondary overflow-hidden">
								<div
									class="h-full rounded-full bg-green-500 transition-all duration-500"
									style="width: {Math.min(systemMetrics.memory_usage, 100)}%"
								></div>
							</div>
						</div>

						<div class="space-y-2">
							<div class="flex justify-between text-sm">
								<span class="flex items-center gap-2">
									<div class="h-2 w-2 rounded-full bg-orange-500"></div>
									Disk Usage
								</span>
								<span class="font-medium">{systemMetrics.disk_usage.toFixed(1)}%</span>
							</div>
							<div class="h-2 w-full rounded-full bg-secondary overflow-hidden">
								<div
									class="h-full rounded-full bg-orange-500 transition-all duration-500"
									style="width: {Math.min(systemMetrics.disk_usage, 100)}%"
								></div>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>
		{/if}

		<!-- Recent Projects -->
		<Card class="hover:shadow-md transition-shadow">
			<CardHeader class="flex flex-row items-center justify-between">
				<div>
					<CardTitle class="flex items-center gap-2">
						<GitBranch class="h-5 w-5" />
						Recent Projects
					</CardTitle>
					<CardDescription>Your deployed applications</CardDescription>
				</div>
				<Button onclick={() => goto('/projects')} variant="outline">
					<ExternalLink class="h-4 w-4 mr-2" />
					View All
				</Button>
			</CardHeader>
			<CardContent>
				{#if projects.length === 0}
					<div class="py-12 text-center">
						<div class="mx-auto h-12 w-12 text-muted-foreground mb-4">
							<GitBranch class="h-full w-full" />
						</div>
						<h3 class="text-lg font-semibold mb-2">No projects yet</h3>
						<p class="text-muted-foreground mb-6 max-w-sm mx-auto">
							Deploy your first project to start building and managing applications on your server.
						</p>
						<Button onclick={() => goto('/projects/new')} class="gap-2">
							<Plus class="h-4 w-4" />
							Deploy Your First Project
						</Button>
					</div>
				{:else}
					<div class="space-y-4">
						{#each projects.slice(0, 5) as project}
							<div class="group flex items-center justify-between rounded-lg border p-4 hover:bg-accent/50 transition-colors">
								<div class="flex items-center space-x-4">
									<div class="flex items-center space-x-3">
										<span class="text-lg">{getStatusIcon(project.status)}</span>
										<div class="min-w-0 flex-1">
											<h3 class="font-medium truncate">{project.name}</h3>
											<p class="text-sm text-muted-foreground truncate">
												{project.github_url ? project.github_url.split('/').slice(-2).join('/') : 'No repository'}
											</p>
										</div>
									</div>
								</div>
								<div class="flex items-center space-x-4 flex-shrink-0">
									<Badge variant="outline" class={getStatusColor(project.status)}>
										{project.status}
									</Badge>
									{#if project.last_deployed_at}
										<span class="text-muted-foreground text-sm hidden sm:inline">
											{formatRelativeTime(project.last_deployed_at)}
										</span>
									{/if}
									<Button 
										variant="ghost" 
										size="sm"
										onclick={() => goto(`/projects/${project.id}`)}
										class="opacity-0 group-hover:opacity-100 transition-opacity"
									>
										<ExternalLink class="h-4 w-4" />
									</Button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</CardContent>
		</Card>
	{/if}
</div>
