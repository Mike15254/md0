<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Plus, GitBranch, Clock, Activity, Settings, Play, Square, RotateCcw, Trash2, ExternalLink, Server, Filter, Search, Zap, RefreshCw } from 'lucide-svelte';
	import { getStatusColor, formatDate } from '$lib/utils';
	import { projectStore } from '$lib/stores/projects.svelte';
	import { dataStore } from '$lib/stores/data.svelte';
	import type { Project } from '$lib/types';
	import { Input } from '$lib/components/ui/input';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';

	let searchQuery = $state('');
	let statusFilter = $state<string>('');
	let runtimeFilter = $state<string>('');
	let showFilters = $state(false);

	// Reactive data from stores
	let projectsData = $state<{ projects: Project[]; pagination: any } | null>(null);
	let projectsState = $derived(dataStore.getState('projects:'));
	let isLoading = $derived(projectsState.loading);
	let error = $derived(projectsState.error);

	// Filtered projects
	let filteredProjects = $derived.by(() => {
		if (!projectsData?.projects) return [];
		
		return projectsData.projects.filter(project => {
			const matchesSearch = !searchQuery || 
				project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
				(project.repository?.name || '').toLowerCase().includes(searchQuery.toLowerCase());
			
			const matchesStatus = !statusFilter || project.status === statusFilter;
			const matchesRuntime = !runtimeFilter || project.runtime === runtimeFilter;

			return matchesSearch && matchesStatus && matchesRuntime;
		});
	});

	// Project stats
	let projectStats = $derived.by(() => {
		if (!projectsData?.projects) return { total: 0, running: 0, stopped: 0, building: 0, failed: 0 };
		
		return projectStore.getProjectsByStatus(projectsData.projects);
	});

	let runtimeStats = $derived.by(() => {
		if (!projectsData?.projects) return {};
		
		return projectStore.getProjectsByRuntime(projectsData.projects);
	});

	onMount(async () => {
		await loadProjects();
	});

	async function loadProjects(refresh = false) {
		try {
			// Apply filters to store
			projectStore.setSearchFilter(searchQuery || undefined);
			projectStore.setStatusFilter(statusFilter || undefined);
			projectStore.setRuntimeFilter(runtimeFilter || undefined);

			projectsData = await projectStore.getProjects({ refresh });
		} catch (err) {
			console.error('Failed to load projects:', err);
		}
	}

	async function handleProjectAction(projectId: string, action: 'deploy' | 'restart' | 'stop' | 'delete') {
		try {
			if (action === 'delete') {
				if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
					return;
				}
			}

			await projectStore.actions[action](projectId);
			
			// Refresh projects list after action
			await loadProjects(true);

			// Show success message based on action
			const messages = {
				deploy: 'Project deployment started',
				restart: 'Project restarted successfully',
				stop: 'Project stopped successfully',
				delete: 'Project deleted successfully'
			};
			
			// You could add a toast notification here
			console.log(messages[action]);
		} catch (err: any) {
			console.error(`Failed to ${action} project:`, err);
			alert(err.message || `Failed to ${action} project`);
		}
	}

	// Debounced search
	let searchTimeout: NodeJS.Timeout;
	function handleSearchInput(event: Event) {
		const target = event.target as HTMLInputElement;
		searchQuery = target.value;
		
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			loadProjects();
		}, 300);
	}

	// Watch for filter changes
	$effect(() => {
		// When filters change, reload projects
		if (statusFilter !== undefined || runtimeFilter !== undefined) {
			loadProjects();
		}
	});

	function clearFilters() {
		searchQuery = '';
		statusFilter = '';
		runtimeFilter = '';
		projectStore.clearFilters();
		loadProjects(true);
	}
</script>

<svelte:head>
	<title>Projects - MD0</title>
</svelte:head>

<div class="flex flex-1 flex-col gap-6 p-6">
	<!-- Page Header with Stats -->
	<div class="flex flex-col gap-4">
		<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<h1 class="text-3xl font-bold tracking-tight">Projects</h1>
				<p class="text-muted-foreground">
					Manage and deploy your applications
				</p>
			</div>
			<div class="flex gap-2">
				<Button 
					onclick={() => loadProjects(true)} 
					variant="outline" 
					size="sm"
					class="gap-2"
				>
					<RefreshCw class="h-4 w-4" />
					Refresh
				</Button>
				<Button onclick={() => goto('/projects/new')} class="gap-2">
					<Plus class="h-4 w-4" />
					New Project
				</Button>
			</div>
		</div>

		<!-- Quick Stats -->
		{#if projectsData?.projects.length}
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<Card class="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
					<CardContent class="p-4">
						<div class="flex items-center gap-3">
							<div class="p-2 bg-green-100 rounded-lg">
								<Play class="h-5 w-5 text-green-600" />
							</div>
							<div>
								<p class="text-sm font-medium text-green-800">Running</p>
								<p class="text-2xl font-bold text-green-900">{projectStats.running}</p>
							</div>
						</div>
					</CardContent>
				</Card>

				<Card class="bg-gradient-to-r from-red-50 to-rose-50 border-red-200">
					<CardContent class="p-4">
						<div class="flex items-center gap-3">
							<div class="p-2 bg-red-100 rounded-lg">
								<Square class="h-5 w-5 text-red-600" />
							</div>
							<div>
								<p class="text-sm font-medium text-red-800">Stopped</p>
								<p class="text-2xl font-bold text-red-900">{projectStats.stopped}</p>
							</div>
						</div>
					</CardContent>
				</Card>

				<Card class="bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-200">
					<CardContent class="p-4">
						<div class="flex items-center gap-3">
							<div class="p-2 bg-blue-100 rounded-lg">
								<Zap class="h-5 w-5 text-blue-600" />
							</div>
							<div>
								<p class="text-sm font-medium text-blue-800">Building</p>
								<p class="text-2xl font-bold text-blue-900">{projectStats.building}</p>
							</div>
						</div>
					</CardContent>
				</Card>

				<Card class="bg-gradient-to-r from-purple-50 to-violet-50 border-purple-200">
					<CardContent class="p-4">
						<div class="flex items-center gap-3">
							<div class="p-2 bg-purple-100 rounded-lg">
								<Server class="h-5 w-5 text-purple-600" />
							</div>
							<div>
								<p class="text-sm font-medium text-purple-800">Total</p>
								<p class="text-2xl font-bold text-purple-900">{projectsData?.projects.length || 0}</p>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		{/if}

		<!-- Search and Filters -->
		<Card>
			<CardContent class="p-4">
				<div class="flex flex-col gap-4 sm:flex-row sm:items-center">
					<div class="flex-1 relative">
						<Search class="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
						<Input
							type="text"
							placeholder="Search projects..."
							value={searchQuery}
							oninput={handleSearchInput}
							class="pl-10"
						/>
					</div>
					<Button 
						variant="outline" 
						onclick={() => showFilters = !showFilters}
						class="gap-2"
					>
						<Filter class="h-4 w-4" />
						Filters
						{#if statusFilter || runtimeFilter}
							<Badge variant="secondary" class="ml-1">
								{(statusFilter ? 1 : 0) + (runtimeFilter ? 1 : 0)}
							</Badge>
						{/if}
					</Button>
				</div>

				{#if showFilters}
					<div class="flex flex-col gap-4 sm:flex-row sm:items-center pt-4 border-t">
						<div class="flex-1">
							<Select type="single" bind:value={statusFilter}>
								<SelectTrigger class="w-full">
									<span data-slot="select-value">
										{statusFilter || "Filter by status"}
									</span>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="">All Statuses</SelectItem>
									<SelectItem value="running">Running</SelectItem>
									<SelectItem value="stopped">Stopped</SelectItem>
									<SelectItem value="building">Building</SelectItem>
									<SelectItem value="failed">Failed</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div class="flex-1">
							<Select type="single" bind:value={runtimeFilter}>
								<SelectTrigger class="w-full">
									<span data-slot="select-value">
										{runtimeFilter || "Filter by runtime"}
									</span>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="">All Runtimes</SelectItem>
									{#each Object.keys(runtimeStats) as runtime}
										<SelectItem value={runtime}>
											{runtime.toUpperCase()} ({runtimeStats[runtime]})
										</SelectItem>
									{/each}
								</SelectContent>
							</Select>
						</div>
						<Button variant="outline" onclick={clearFilters} size="sm">
							Clear Filters
						</Button>
					</div>
				{/if}
			</CardContent>
		</Card>
	</div>

	{#if isLoading}
		<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
			{#each Array(6) as _}
				<Card class="hover:shadow-md transition-shadow">
					<CardHeader>
						<Skeleton class="h-6 w-3/4" />
						<Skeleton class="h-4 w-1/2" />
					</CardHeader>
					<CardContent>
						<div class="space-y-3">
							<Skeleton class="h-4 w-full" />
							<Skeleton class="h-4 w-2/3" />
							<div class="flex gap-2">
								<Skeleton class="h-8 w-16" />
								<Skeleton class="h-8 w-16" />
								<Skeleton class="h-8 w-16" />
							</div>
						</div>
					</CardContent>
				</Card>
			{/each}
		</div>
	{:else if error}
		<Card class="border-destructive/50 bg-destructive/5">
			<CardContent class="pt-6">
				<div class="flex items-center gap-3">
					<div class="text-destructive">⚠</div>
					<div>
						<p class="text-destructive font-medium">{error}</p>
						<Button onclick={() => loadProjects(true)} variant="outline" size="sm" class="mt-3">
							<RotateCcw class="h-4 w-4 mr-2" />
							Try Again
						</Button>
					</div>
				</div>
			</CardContent>
		</Card>
	{:else if !filteredProjects.length}
		<Card class="border-dashed">
			<CardContent class="py-16 text-center">
				<div class="mx-auto h-16 w-16 text-muted-foreground mb-6">
					{#if searchQuery || statusFilter || runtimeFilter}
						<Search class="h-full w-full" />
					{:else}
						<GitBranch class="h-full w-full" />
					{/if}
				</div>
				<h3 class="text-xl font-semibold mb-3">
					{#if searchQuery || statusFilter || runtimeFilter}
						No projects match your filters
					{:else}
						No projects yet
					{/if}
				</h3>
				<p class="text-muted-foreground mb-8 max-w-md mx-auto">
					{#if searchQuery || statusFilter || runtimeFilter}
						Try adjusting your search terms or filters to find what you're looking for.
					{:else}
						Get started by creating your first project. Deploy applications from GitHub repositories with just a few clicks.
					{/if}
				</p>
				{#if searchQuery || statusFilter || runtimeFilter}
					<Button onclick={clearFilters} variant="outline" size="lg" class="gap-2">
						<Filter class="h-5 w-5" />
						Clear Filters
					</Button>
				{:else}
					<Button onclick={() => goto('/projects/new')} size="lg" class="gap-2">
						<Plus class="h-5 w-5" />
						Create Your First Project
					</Button>
				{/if}
			</CardContent>
		</Card>
	{:else}
		<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
			{#each filteredProjects as project}
				<Card class="group hover:shadow-lg transition-all duration-200 hover:border-primary/30 hover:scale-[1.02]">
					<CardHeader class="pb-3">
						<div class="flex justify-between items-start gap-3">
							<div class="min-w-0 flex-1">
								<CardTitle class="text-lg truncate group-hover:text-primary transition-colors">
									{project.name}
								</CardTitle>
								<CardDescription class="flex items-center gap-1 mt-1">
									<GitBranch class="h-3 w-3 flex-shrink-0" />
									{#if project.repository?.name}
										<a 
											href={project.repository.html_url} 
											target="_blank" 
											class="text-primary hover:underline truncate transition-colors"
										>
											{project.repository.name}
										</a>
									{:else if project.github_url}
										<a 
											href={project.github_url} 
											target="_blank" 
											class="text-primary hover:underline truncate transition-colors"
										>
											{project.github_url.replace('https://github.com/', '')}
										</a>
									{:else}
										<span class="truncate text-muted-foreground">
											No repository linked
										</span>
									{/if}
								</CardDescription>
							</div>
							<div class="flex flex-col gap-1">
								<Badge variant="outline" class={getStatusColor(project.status)}>
									{project.status_display || project.status}
								</Badge>
								{#if project.runtime}
									<Badge variant="secondary" class="text-xs">
										{project.runtime.toUpperCase()}
									</Badge>
								{/if}
							</div>
						</div>
					</CardHeader>
					<CardContent class="space-y-4">
						<div class="space-y-2 text-sm text-muted-foreground">
							<div class="flex items-center gap-2">
								<Clock class="h-3 w-3 flex-shrink-0" />
								<span class="truncate">
									{project.updated_at ? formatDate(project.updated_at) : 'Never deployed'}
								</span>
							</div>
							{#if project.repository?.language}
								<div class="flex items-center gap-2">
									<Activity class="h-3 w-3 flex-shrink-0" />
									<span class="truncate">
										{project.repository.language}
									</span>
								</div>
							{/if}
							{#if project.custom_domain}
								<div class="flex items-center gap-2">
									<ExternalLink class="h-3 w-3 flex-shrink-0" />
									<a 
										href="https://{project.custom_domain}" 
										target="_blank" 
										class="text-primary hover:underline truncate transition-colors"
									>
										{project.custom_domain}
									</a>
								</div>
							{/if}
							{#if project.description}
								<p class="text-xs text-muted-foreground line-clamp-2">
									{project.description}
								</p>
							{/if}
						</div>

						<!-- Action Buttons -->
						<div class="flex flex-wrap gap-2">
							{#if project.status === 'running'}
								<Button 
									size="sm" 
									variant="outline" 
									onclick={() => handleProjectAction(project.name, 'stop')}
									disabled={projectStore.isActionLoading(project.name)}
									class="gap-1"
								>
									{#if projectStore.isActionLoading(project.name, 'stop')}
										<RefreshCw class="h-3 w-3 animate-spin" />
									{:else}
										<Square class="h-3 w-3" />
									{/if}
									Stop
								</Button>
								<Button 
									size="sm" 
									variant="outline" 
									onclick={() => handleProjectAction(project.name, 'restart')}
									disabled={projectStore.isActionLoading(project.name)}
									class="gap-1"
								>
									{#if projectStore.isActionLoading(project.name, 'restart')}
										<RefreshCw class="h-3 w-3 animate-spin" />
									{:else}
										<RotateCcw class="h-3 w-3" />
									{/if}
									Restart
								</Button>
							{:else if project.status === 'stopped' || project.status === 'failed'}
								<Button 
									size="sm" 
									variant="outline" 
									onclick={() => handleProjectAction(project.name, 'deploy')}
									disabled={projectStore.isActionLoading(project.name)}
									class="gap-1"
								>
									{#if projectStore.isActionLoading(project.name, 'deploy')}
										<RefreshCw class="h-3 w-3 animate-spin" />
									{:else}
										<Play class="h-3 w-3" />
									{/if}
									{project.status === 'failed' ? 'Retry' : 'Start'}
								</Button>
							{:else if project.status === 'building'}
								<Button 
									size="sm" 
									variant="outline" 
									disabled
									class="gap-1"
								>
									<RefreshCw class="h-3 w-3 animate-spin" />
									Building...
								</Button>
							{/if}
							
							<Button 
								size="sm" 
								variant="outline" 
								onclick={() => goto(`/projects/${encodeURIComponent(project.name)}`)}
								class="gap-1 flex-1 sm:flex-none"
							>
								<Settings class="h-3 w-3" />
								Manage
							</Button>
							
							<Button 
								size="sm" 
								variant="outline" 
								onclick={() => handleProjectAction(project.name, 'delete')}
								disabled={projectStore.isActionLoading(project.name)}
								class="gap-1 text-destructive hover:text-destructive"
							>
								{#if projectStore.isActionLoading(project.name, 'delete')}
									<RefreshCw class="h-3 w-3 animate-spin" />
								{:else}
									<Trash2 class="h-3 w-3" />
								{/if}
							</Button>
						</div>
					</CardContent>
				</Card>
			{/each}
		</div>
	{/if}
</div>
