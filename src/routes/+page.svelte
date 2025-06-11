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
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { getStatusColor, getStatusIcon, formatUptime, formatRelativeTime } from '$lib/utils.js';
	import {
		Plus,
		Server,
		Database,
		Activity,
		BarChart3,
		GitBranch,
		ExternalLink,
		AlertCircle
	} from 'lucide-svelte';
	import { authStore } from '$lib/stores/auth.svelte.js';
	import { api } from '$lib/stores/data.svelte.js';
	import type { Project, SystemMetrics } from '$lib/types.js';

	let { data } = $props();

	let projects: Project[] = $state([]);
	let systemMetrics: SystemMetrics | null = $state(null);
	let projectStats = $state({ total: 0, running: 0, stopped: 0, error: 0 });
	let loading = $state(true);
	let error = $state('');

	// Redirect to login if not authenticated
	$effect(() => {
		if (authStore.initialized && !authStore.isAuthenticated) {
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
			loading = true;
			error = '';

			// Load projects using data store
			const projectsData = await api.getProjects({ limit: 10 });
			projects = projectsData || [];

			// Load project stats
			const stats = await api.getProjectStats();
			projectStats = stats || { total: 0, running: 0, stopped: 0, error: 0 };

			// Load system metrics
			const metrics = await api.getVPSInfo();
			systemMetrics = metrics;
		} catch (err) {
			console.error('Dashboard load error:', err);
			error = 'Failed to load dashboard data';
		} finally {
			loading = false;
		}
	}

	// Reactive calculations
	let runningProjects = $derived(projects.filter((p) => p.status === 'running').length);
	let failedProjects = $derived(projects.filter((p) => p.status === 'failed').length);
</script>

<div class="flex flex-1 flex-col gap-6 p-6">
	{#if loading}
		<div class="flex h-[50vh] items-center justify-center">
			<div class="flex flex-col items-center gap-2">
				<div
					class="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
				></div>
				<div class="text-muted-foreground text-sm">Loading dashboard...</div>
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
			<p class="text-muted-foreground">Overview of your projects and system resources</p>
		</div>

		<!-- System Overview Cards -->
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<Card class="transition-shadow hover:shadow-md">
				<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle class="text-sm font-medium">Total Projects</CardTitle>
					<div class="text-muted-foreground h-4 w-4">📦</div>
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold">{projectStats.total}</div>
					<p class="text-muted-foreground mt-1 text-xs">Deployed applications</p>
				</CardContent>
			</Card>

			<Card class="transition-shadow hover:shadow-md">
				<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle class="text-sm font-medium">Running</CardTitle>
					<div class="h-4 w-4 text-green-600">●</div>
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold text-green-600">{projectStats.running}</div>
					<p class="text-muted-foreground mt-1 text-xs">Active services</p>
				</CardContent>
			</Card>

			<Card class="transition-shadow hover:shadow-md">
				<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle class="text-sm font-medium">Stopped</CardTitle>
					<div class="h-4 w-4 text-yellow-600">⏸</div>
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold text-yellow-600">{projectStats.stopped}</div>
					<p class="text-muted-foreground mt-1 text-xs">Inactive services</p>
				</CardContent>
			</Card>

			<Card class="transition-shadow hover:shadow-md">
				<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle class="text-sm font-medium">Errors</CardTitle>
					<div class="h-4 w-4 text-red-600">✕</div>
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold text-red-600">{projectStats.error}</div>
					<p class="text-muted-foreground mt-1 text-xs">Need attention</p>
				</CardContent>
			</Card>
		</div>

		<!-- System Resources -->
		{#if loading}
			<Card class="transition-shadow hover:shadow-md">
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
							<Skeleton class="h-4 w-20" />
							<Skeleton class="h-2 w-full" />
						</div>
						<div class="space-y-2">
							<Skeleton class="h-4 w-24" />
							<Skeleton class="h-2 w-full" />
						</div>
						<div class="space-y-2">
							<Skeleton class="h-4 w-20" />
							<Skeleton class="h-2 w-full" />
						</div>
					</div>
				</CardContent>
			</Card>
		{:else if systemMetrics}
			<Card class="transition-shadow hover:shadow-md">
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
								<span class="font-medium">{systemMetrics.cpu_usage?.toFixed(1) ?? 'N/A'}%</span>
							</div>
							<div class="bg-secondary h-2 w-full overflow-hidden rounded-full">
								<div
									class="h-full rounded-full bg-blue-500 transition-all duration-500"
									style="width: {Math.min(systemMetrics.cpu_usage ?? 0, 100)}%"
								></div>
							</div>
						</div>

						<div class="space-y-2">
							<div class="flex justify-between text-sm">
								<span class="flex items-center gap-2">
									<div class="h-2 w-2 rounded-full bg-green-500"></div>
									Memory Usage
								</span>
								<span class="font-medium"
									>{systemMetrics.memory_usage_percent?.toFixed(1) ?? 'N/A'}%</span
								>
							</div>
							<div class="bg-secondary h-2 w-full overflow-hidden rounded-full">
								<div
									class="h-full rounded-full bg-green-500 transition-all duration-500"
									style="width: {Math.min(systemMetrics.memory_usage_percent ?? 0, 100)}%"
								></div>
							</div>
						</div>

						<div class="space-y-2">
							<div class="flex justify-between text-sm">
								<span class="flex items-center gap-2">
									<div class="h-2 w-2 rounded-full bg-orange-500"></div>
									Disk Usage
								</span>
								<span class="font-medium"
									>{systemMetrics.disk_usage_percent?.toFixed(1) ?? 'N/A'}%</span
								>
							</div>
							<div class="bg-secondary h-2 w-full overflow-hidden rounded-full">
								<div
									class="h-full rounded-full bg-orange-500 transition-all duration-500"
									style="width: {Math.min(systemMetrics.disk_usage_percent ?? 0, 100)}%"
								></div>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>
		{/if}

		<!-- Recent Projects -->
		<Card class="transition-shadow hover:shadow-md">
			<CardHeader class="flex flex-row items-center justify-between">
				<div>
					<CardTitle class="flex items-center gap-2">
						<GitBranch class="h-5 w-5" />
						Recent Projects
					</CardTitle>
					<CardDescription>Your deployed applications</CardDescription>
				</div>
				<div class="flex items-center gap-2">
					<Button onclick={loadDashboardData} variant="outline" size="sm" disabled={loading}>
						<Activity class="mr-2 h-4 w-4 {loading ? 'animate-spin' : ''}" />
						Refresh
					</Button>
					<Button onclick={() => goto('/projects')} variant="outline">
						<ExternalLink class="mr-2 h-4 w-4" />
						View All
					</Button>
				</div>
			</CardHeader>
			<CardContent>
				{#if loading}
					<div class="space-y-4">
						{#each Array(3) as _}
							<div class="flex items-center justify-between rounded-lg border p-4">
								<div class="flex items-center space-x-4">
									<Skeleton class="h-6 w-6 rounded-full" />
									<div class="space-y-2">
										<Skeleton class="h-4 w-32" />
										<Skeleton class="h-3 w-48" />
									</div>
								</div>
								<div class="flex items-center space-x-4">
									<Skeleton class="h-6 w-16" />
									<Skeleton class="h-3 w-20" />
									<Skeleton class="h-8 w-8" />
								</div>
							</div>
						{/each}
					</div>
				{:else if projects.length === 0}
					<div class="py-12 text-center">
						<div class="text-muted-foreground mx-auto mb-4 h-12 w-12">
							<GitBranch class="h-full w-full" />
						</div>
						<h3 class="mb-2 text-lg font-semibold">No projects yet</h3>
						<p class="text-muted-foreground mx-auto mb-6 max-w-sm">
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
							<div
								class="group hover:bg-accent/50 flex items-center justify-between rounded-lg border p-4 transition-colors"
							>
								<div class="flex items-center space-x-4">
									<div class="flex items-center space-x-3">
										<span class="text-lg">{getStatusIcon(project.status)}</span>
										<div class="min-w-0 flex-1">
											<h3 class="truncate font-medium">{project.name}</h3>
											<p class="text-muted-foreground truncate text-sm">
												{project.github_url
													? project.github_url.split('/').slice(-2).join('/')
													: 'No repository'}
											</p>
										</div>
									</div>
								</div>
								<div class="flex flex-shrink-0 items-center space-x-4">
									<Badge variant="outline" class={getStatusColor(project.status)}>
										{project.status}
									</Badge>
									{#if project.last_deployed_at}
										<span class="text-muted-foreground text-xs">
											{formatRelativeTime(project.last_deployed_at)}
										</span>
									{/if}
									<Button
										onclick={() => goto(`/projects/${project.name}`)}
										variant="ghost"
										size="sm"
										class="opacity-0 transition-opacity group-hover:opacity-100"
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
