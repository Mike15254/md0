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
	import LiveLogsPanel from '$lib/components/live-logs-panel.svelte';
	import ProjectStatusGrid from '$lib/components/project-status-grid.svelte';
	import {
		Plus,
		Server,
		Database,
		Activity,
		BarChart3,
		GitBranch,
		ExternalLink,
		AlertCircle,
		Terminal,
		Zap
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
		// Refresh data every 30 seconds for non-realtime data
		const interval = setInterval(() => {
			loadDashboardData(false); // Don't show loading on refresh
		}, 30000);
		return () => clearInterval(interval);
	});

	async function loadDashboardData(showLoading = true) {
		try {
			if (showLoading) loading = true;
			error = '';

			// Load projects using data store
			const projectsData = await api.getProjects({ limit: 20 }); // Increased for better overview
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
			if (showLoading) loading = false;
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
			<p class="text-muted-foreground">Real-time overview of your projects and deployments</p>
		</div>

		<!-- Enhanced Project Status Grid with Live Updates -->
		<ProjectStatusGrid {projects} maxProjects={6} />

		<!-- Two Column Layout: System Resources + Live Logs -->
		<div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
			<!-- System Resources (1/3 width on xl screens) -->
			<div class="xl:col-span-1">
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
							<div class="grid grid-cols-1 gap-6">
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
							<div class="grid grid-cols-1 gap-6">
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

								<!-- Additional system info -->
								<div class="pt-4 border-t space-y-2">
									<div class="flex justify-between text-sm">
										<span class="text-muted-foreground">Uptime</span>
										<span class="font-medium">
											{systemMetrics.uptime ? formatUptime(systemMetrics.uptime) : 'N/A'}
										</span>
									</div>
									<div class="flex justify-between text-sm">
										<span class="text-muted-foreground">Load Average</span>
										<span class="font-medium font-mono">
											{systemMetrics.load_average ? (Array.isArray(systemMetrics.load_average) ? (systemMetrics.load_average[0] as number)?.toFixed(2) : (systemMetrics.load_average as number)?.toFixed(2)) : 'N/A'}
										</span>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>
				{/if}

				<!-- Quick Actions -->
				<Card class="mt-6">
					<CardHeader>
						<CardTitle class="flex items-center gap-2 text-lg">
							<Zap class="h-5 w-5" />
							Quick Actions
						</CardTitle>
					</CardHeader>
					<CardContent class="space-y-3">
						<Button onclick={() => goto('/projects/new')} class="w-full gap-2">
							<Plus class="h-4 w-4" />
							Deploy New Project
						</Button>
						<Button variant="outline" onclick={() => goto('/projects')} class="w-full gap-2">
							<GitBranch class="h-4 w-4" />
							Manage Projects
						</Button>
						<Button variant="outline" onclick={() => goto('/settings')} class="w-full gap-2">
							<Server class="h-4 w-4" />
							Server Settings
						</Button>
					</CardContent>
				</Card>
			</div>

			<!-- Live Logs Panel (2/3 width on xl screens) -->
			<div class="xl:col-span-2">
				<div class="h-[600px]">
					<LiveLogsPanel {projects} maxLogs={100} />
				</div>
			</div>
		</div>
	{/if}
</div>
