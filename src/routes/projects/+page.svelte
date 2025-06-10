<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Plus, GitBranch, Clock, Activity, Settings, Play, Square, RotateCcw } from 'lucide-svelte';
	import { getStatusColor, formatDate } from '$lib/utils';
	import type { Project } from '$lib/types';

	let projects: Project[] = [];
	let loading = true;
	let error = '';

	onMount(async () => {
		await loadProjects();
	});

	async function loadProjects() {
		try {
			loading = true;
			const response = await fetch('/api/projects');
			if (response.ok) {
				const result = await response.json();
				projects = result.success ? result.data : [];
			} else {
				error = 'Failed to load projects';
			}
		} catch (err) {
			error = 'Failed to load projects';
			console.error(err);
		} finally {
			loading = false;
		}
	}

	async function toggleProject(projectName: string, action: 'start' | 'stop' | 'restart') {
		try {
			const response = await fetch(`/api/projects/${projectName}/${action}`, {
				method: 'POST'
			});
			
			if (response.ok) {
				await loadProjects(); // Refresh the list
			} else {
				alert(`Failed to ${action} project`);
			}
		} catch (err) {
			alert(`Failed to ${action} project`);
			console.error(err);
		}
	}
</script>

<svelte:head>
	<title>Projects - MD0</title>
</svelte:head>

<div class="flex flex-1 flex-col gap-6 p-6">
	<!-- Page Header -->
	<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Projects</h1>
			<p class="text-muted-foreground">
				Manage and deploy your applications
			</p>
		</div>
		<Button onclick={() => goto('/projects/new')} class="gap-2 self-start sm:self-auto">
			<Plus class="h-4 w-4" />
			New Project
		</Button>
	</div>

	{#if loading}
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
						<Button onclick={loadProjects} variant="outline" size="sm" class="mt-3">
							<RotateCcw class="h-4 w-4 mr-2" />
							Try Again
						</Button>
					</div>
				</div>
			</CardContent>
		</Card>
	{:else if projects.length === 0}
		<Card class="border-dashed">
			<CardContent class="py-16 text-center">
				<div class="mx-auto h-16 w-16 text-muted-foreground mb-6">
					<GitBranch class="h-full w-full" />
				</div>
				<h3 class="text-xl font-semibold mb-3">No projects yet</h3>
				<p class="text-muted-foreground mb-8 max-w-md mx-auto">
					Get started by creating your first project. Deploy applications from GitHub repositories with just a few clicks.
				</p>
				<Button onclick={() => goto('/projects/new')} size="lg" class="gap-2">
					<Plus class="h-5 w-5" />
					Create Your First Project
				</Button>
			</CardContent>
		</Card>
	{:else}
		<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
			{#each projects as project}
				<Card class="group hover:shadow-md transition-all duration-200 hover:border-primary/20">
					<CardHeader class="pb-3">
						<div class="flex justify-between items-start gap-3">
							<div class="min-w-0 flex-1">
								<CardTitle class="text-lg truncate group-hover:text-primary transition-colors">
									{project.name}
								</CardTitle>
								<CardDescription class="flex items-center gap-1 mt-1">
									<GitBranch class="h-3 w-3 flex-shrink-0" />
									{#if project.repository_name}
										<a 
											href={project.repository_url} 
											target="_blank" 
											class="text-primary hover:underline truncate transition-colors"
										>
											{project.repository_name}
										</a>
									{:else}
										<span class="truncate text-muted-foreground">
											No repository linked
										</span>
									{/if}
								</CardDescription>
							</div>
							<Badge variant="outline" class={getStatusColor(project.status)}>
								{project.status}
							</Badge>
						</div>
					</CardHeader>
					<CardContent class="space-y-4">
						<div class="space-y-2 text-sm text-muted-foreground">
							<div class="flex items-center gap-2">
								<Clock class="h-3 w-3 flex-shrink-0" />
								<span class="truncate">
									Last deploy: {project.updated_at ? formatDate(project.updated_at) : 'Never'}
								</span>
							</div>
							{#if project.repository_language}
								<div class="flex items-center gap-2">
									<Activity class="h-3 w-3 flex-shrink-0" />
									<span class="truncate">
										{project.repository_language}
									</span>
								</div>
							{/if}
							{#if project.custom_domain}
								<div class="flex items-center gap-2">
									<Activity class="h-3 w-3 flex-shrink-0" />
									<a 
										href="https://{project.custom_domain}" 
										target="_blank" 
										class="text-primary hover:underline truncate transition-colors"
									>
										{project.custom_domain}
									</a>
								</div>
							{/if}
						</div>

						<div class="flex flex-wrap gap-2">
							{#if project.status === 'running'}
								<Button 
									size="sm" 
									variant="outline" 
									onclick={() => toggleProject(project.name, 'stop')}
									class="gap-1"
								>
									<Square class="h-3 w-3" />
									Stop
								</Button>
								<Button 
									size="sm" 
									variant="outline" 
									onclick={() => toggleProject(project.name, 'restart')}
									class="gap-1"
								>
									<RotateCcw class="h-3 w-3" />
									Restart
								</Button>
							{:else if project.status === 'stopped'}
								<Button 
									size="sm" 
									variant="outline" 
									onclick={() => toggleProject(project.name, 'start')}
									class="gap-1"
								>
									<Play class="h-3 w-3" />
									Start
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
						</div>
					</CardContent>
				</Card>
			{/each}
		</div>
	{/if}
</div>
