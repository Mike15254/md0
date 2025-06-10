<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import { Separator } from '$lib/components/ui/separator';
	import { Badge } from '$lib/components/ui/badge';
	import { Switch } from '$lib/components/ui/switch';
	import { AlertCircle, ArrowLeft, Plus, X, Github, Key, Globe } from 'lucide-svelte';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { onMount } from 'svelte';

	let formData = {
		name: '',
		description: '',
		repository_url: '',
		branch: 'main',
		build_command: '',
		start_command: '',
		port: 3000,
		custom_domain: '',
		runtime: 'node',
		auto_deploy: true,
		environment_variables: [] as { key: string; value: string }[]
	};

	let loading = false;
	let error = '';
	let validationErrors: Record<string, string> = {};
	let githubRepositories: any[] = [];
	let loadingRepositories = false;

	onMount(() => {
		loadGitHubRepositories();
	});

	async function loadGitHubRepositories() {
		loadingRepositories = true;
		try {
			const response = await fetch('/api/github/app/repositories');
			if (response.ok) {
				const result = await response.json();
				githubRepositories = result.data?.repositories || [];
			}
		} catch (err) {
			console.error('Failed to load GitHub repositories:', err);
		} finally {
			loadingRepositories = false;
		}
	}

	function addEnvironmentVariable() {
		formData.environment_variables = [...formData.environment_variables, { key: '', value: '' }];
	}

	function removeEnvironmentVariable(index: number) {
		formData.environment_variables = formData.environment_variables.filter((_, i) => i !== index);
	}

	function validateForm() {
		validationErrors = {};

		if (!formData.name.trim()) {
			validationErrors.name = 'Project name is required';
		}

		if (!formData.repository_url.trim()) {
			validationErrors.repository_url = 'Repository URL is required';
		} else if (!formData.repository_url.includes('github.com')) {
			validationErrors.repository_url = 'Only GitHub repositories are supported';
		}

		if (!formData.start_command.trim()) {
			validationErrors.start_command = 'Start command is required';
		}

		if (formData.port < 1 || formData.port > 65535) {
			validationErrors.port = 'Port must be between 1 and 65535';
		}

		if (formData.custom_domain && !/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.[a-zA-Z]{2,}$/.test(formData.custom_domain)) {
			validationErrors.custom_domain = 'Please enter a valid domain name';
		}

		return Object.keys(validationErrors).length === 0;
	}

	async function handleSubmit() {
		if (!validateForm()) {
			return;
		}

		loading = true;
		error = '';

		try {
			const response = await fetch('/api/projects', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(formData)
			});

			if (response.ok) {
				const result = await response.json();
				goto(`/projects/${result.data.id}`);
			} else {
				const result = await response.json();
				error = result.error || 'Failed to create project';
			}
		} catch (err) {
			error = 'Failed to create project';
			console.error(err);
		} finally {
			loading = false;
		}
	}

	function handleRepositoryUrlChange() {
		// Auto-fill project name from repository URL
		if (formData.repository_url && !formData.name) {
			// Find the selected repository and extract the name
			const selectedRepo = githubRepositories.find(r => r.clone_url === formData.repository_url);
			if (selectedRepo) {
				formData.name = selectedRepo.name;
			}
		}
	}

	function handleRuntimeChange(runtime: string) {
		// Set default commands based on runtime
		switch (runtime) {
			case 'node':
				if (!formData.build_command) formData.build_command = 'npm install';
				if (!formData.start_command) formData.start_command = 'npm start';
				break;
			case 'python':
				if (!formData.build_command) formData.build_command = 'pip install -r requirements.txt';
				if (!formData.start_command) formData.start_command = 'python app.py';
				break;
			case 'static':
				if (!formData.build_command) formData.build_command = 'npm run build';
				if (!formData.start_command) formData.start_command = 'serve -s build';
				break;
		}
	}

	// React to repository selection changes
	$: if (formData.repository_url) {
		handleRepositoryUrlChange();
	}

	// React to runtime changes
	$: if (formData.runtime) {
		handleRuntimeChange(formData.runtime);
	}
</script>

<svelte:head>
	<title>New Project - MD0</title>
</svelte:head>

<div class="flex flex-1 flex-col gap-4 p-4 pt-0">
	<!-- Page Header -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-4">
			<Button variant="ghost" size="sm" onclick={() => goto('/projects')}>
				<ArrowLeft class="w-4 h-4 mr-2" />
				Back to Projects
			</Button>
			<div>
				<h1 class="text-2xl font-bold tracking-tight">Create New Project</h1>
				
			</div>
		</div>
	</div>

	<!-- Alerts -->
	{#if error}
		<Alert variant="destructive">
			<AlertCircle class="h-4 w-4" />
			<AlertDescription>{error}</AlertDescription>
		</Alert>
	{/if}

	<!-- Project Form -->
	<form on:submit|preventDefault={handleSubmit} class="space-y-4 max-w-6xl mx-auto">
		<!-- Basic Information -->
		<Card>
			<CardHeader>
				<CardTitle class="flex items-center gap-2">
					<div class="h-2 w-2 rounded-full bg-blue-500"></div>
					Basic Information
				</CardTitle>
				<CardDescription>
					Basic details about your project
				</CardDescription>
			</CardHeader>
			<CardContent class="space-y-4">
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div class="space-y-2">
						<Label for="name" class="text-sm font-medium">Project Name *</Label>
						<Input
							id="name"
							bind:value={formData.name}
							placeholder="my-awesome-app"
							class={validationErrors.name ? 'border-destructive focus-visible:ring-destructive' : ''}
						/>
						{#if validationErrors.name}
							<p class="text-sm text-destructive mt-1 flex items-center gap-1">
								<AlertCircle class="h-3 w-3" />
								{validationErrors.name}
							</p>
						{/if}
					</div>
					<div class="space-y-2">
						<Label for="custom_domain" class="text-sm font-medium">Custom Domain</Label>
						<Input
							id="custom_domain"
							bind:value={formData.custom_domain}
							placeholder="example.com"
							class={validationErrors.custom_domain ? 'border-destructive focus-visible:ring-destructive' : ''}
						/>
						{#if validationErrors.custom_domain}
							<p class="text-sm text-destructive mt-1 flex items-center gap-1">
								<AlertCircle class="h-3 w-3" />
								{validationErrors.custom_domain}
							</p>
						{/if}
					</div>
				</div>

				<div class="space-y-2">
					<Label for="description" class="text-sm font-medium">Description</Label>
					<Textarea
						id="description"
						bind:value={formData.description}
						placeholder="A brief description of your project"
						rows={3}
						class="resize-none"
					/>
				</div>
			</CardContent>
		</Card>

		<!-- Repository Configuration -->
		<Card>
			<CardHeader>
				<CardTitle class="flex items-center gap-2">
					<div class="h-2 w-2 rounded-full bg-green-500"></div>
					Repository
				</CardTitle>			<CardDescription>
				Select a repository from your GitHub App installations
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			{#if loadingRepositories}
				<div class="flex items-center justify-center py-8">
					<div class="flex items-center gap-2 text-muted-foreground">
						<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
						Loading GitHub repositories...
					</div>
				</div>
			{:else if githubRepositories.length === 0}
				<div class="text-center py-8">
					<div class="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
						<Github class="w-8 h-8 text-muted-foreground" />
					</div>
					<h3 class="text-lg font-medium mb-2">No GitHub App Installation Found</h3>
					<p class="text-muted-foreground text-sm mb-4 max-w-md mx-auto">
						Install the GitHub App to access your repositories for deployment.
					</p>
					<Button onclick={() => window.open('https://github.com/apps/mdo-0/installations/new', '_blank')}>
						<Github class="w-4 h-4 mr-2" />
						Install GitHub App
					</Button>
				</div>
			{:else}
				<div class="space-y-2">
					<Label for="repository_select" class="text-sm font-medium">GitHub Repository *</Label>
					<Select type="single" bind:value={formData.repository_url}>
						<SelectTrigger class={validationErrors.repository_url ? 'border-destructive focus-visible:ring-destructive' : ''}>
							{formData.repository_url ? 
								githubRepositories.find(r => r.clone_url === formData.repository_url)?.full_name || 'Select repository'
								: 'Select a repository'
							}
						</SelectTrigger>
						<SelectContent>
							{#each githubRepositories as repo}
								<SelectItem value={repo.clone_url}>
									<div class="flex items-center gap-2">
										<Github class="w-4 h-4" />
										<span>{repo.full_name}</span>
										{#if repo.private}
											<Badge variant="secondary" class="text-xs">Private</Badge>
										{/if}
									</div>
								</SelectItem>
							{/each}
						</SelectContent>
					</Select>
					{#if validationErrors.repository_url}
						<p class="text-sm text-destructive mt-1 flex items-center gap-1">
							<AlertCircle class="h-3 w-3" />
							{validationErrors.repository_url}
						</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="branch" class="text-sm font-medium">Branch</Label>
					<Input
						id="branch"
						bind:value={formData.branch}
						placeholder="main"
					/>
					<p class="text-xs text-muted-foreground">The branch to deploy from your repository</p>
				</div>
			{/if}
			</CardContent>
		</Card>

		<!-- Build Configuration -->
		<Card>
			<CardHeader>
				<CardTitle class="flex items-center gap-2">
					<div class="h-2 w-2 rounded-full bg-yellow-500"></div>
					Build Configuration
				</CardTitle>
				<CardDescription>
					Configure how your application is built and deployed
				</CardDescription>
			</CardHeader>
			<CardContent class="space-y-4">
				<div class="space-y-2">
					<Label for="runtime" class="text-sm font-medium">Runtime</Label>
					<Select type="single" bind:value={formData.runtime}>
						<SelectTrigger class="w-full">
							<span data-slot="select-value">
								{formData.runtime === 'node' ? 'Node.js' : 
								 formData.runtime === 'python' ? 'Python' : 
								 formData.runtime === 'static' ? 'Static Site' : 'Select runtime'}
							</span>
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="node">Node.js</SelectItem>
							<SelectItem value="python">Python</SelectItem>
							<SelectItem value="static">Static Site</SelectItem>
						</SelectContent>
					</Select>
				</div>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div class="space-y-2">
						<Label for="build_command" class="text-sm font-medium">Build Command</Label>
						<Input
							id="build_command"
							bind:value={formData.build_command}
							placeholder="npm install"
							class="font-mono text-sm"
						/>
						<p class="text-xs text-muted-foreground">Command to install dependencies</p>
					</div>
					<div class="space-y-2">
						<Label for="start_command" class="text-sm font-medium">Start Command *</Label>
						<Input
							id="start_command"
							bind:value={formData.start_command}
							placeholder="npm start"
							class={`font-mono text-sm ${validationErrors.start_command ? 'border-destructive focus-visible:ring-destructive' : ''}`}
						/>
						{#if validationErrors.start_command}
							<p class="text-sm text-destructive mt-1 flex items-center gap-1">
								<AlertCircle class="h-3 w-3" />
								{validationErrors.start_command}
							</p>
						{:else}
							<p class="text-xs text-muted-foreground">Command to start your application</p>
						{/if}
					</div>
				</div>

				<div class="space-y-2">
					<Label for="port" class="text-sm font-medium">Port</Label>
					<div class="flex items-center gap-2">
						<Input
							id="port"
							type="number"
							bind:value={formData.port}
							min="1"
							max="65535"
							class={`w-32 ${validationErrors.port ? 'border-destructive focus-visible:ring-destructive' : ''}`}
						/>
						<span class="text-sm text-muted-foreground">Port your application listens on</span>
					</div>
					{#if validationErrors.port}
						<p class="text-sm text-destructive mt-1 flex items-center gap-1">
							<AlertCircle class="h-3 w-3" />
							{validationErrors.port}
						</p>
					{/if}
				</div>
			</CardContent>
		</Card>

		<!-- Environment Variables -->
		<Card>
			<CardHeader>
				<CardTitle class="flex items-center gap-2">
					<div class="h-2 w-2 rounded-full bg-purple-500"></div>
					Environment Variables
					<Badge variant="secondary" class="ml-2">Optional</Badge>
				</CardTitle>
				<CardDescription>
					Set environment variables for your application
				</CardDescription>
			</CardHeader>
			<CardContent class="space-y-4">
				<div class="space-y-3">
					{#each formData.environment_variables as envVar, index}
						<div class="flex gap-2 items-start p-3 bg-muted/30 rounded-lg border">
							<div class="flex-1 space-y-2">
								<Input
									bind:value={envVar.key}
									placeholder="VARIABLE_NAME"
									class="font-mono text-sm"
								/>
							</div>
							<div class="flex-1 space-y-2">
								<Input
									bind:value={envVar.value}
									placeholder="variable_value"
									class="font-mono text-sm"
								/>
							</div>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								class="mt-0 h-9 w-9 text-muted-foreground hover:text-destructive"
								onclick={() => removeEnvironmentVariable(index)}
							>
								<X class="w-4 h-4" />
							</Button>
						</div>
					{:else}
						<div class="text-center py-8 text-muted-foreground">
							<p class="text-sm">No environment variables added yet</p>
							<p class="text-xs mt-1">Click the button below to add your first variable</p>
						</div>
					{/each}
				</div>

				<Button
					type="button"
					variant="outline"
					onclick={addEnvironmentVariable}
					class="w-full"
				>
					<Plus class="w-4 h-4 mr-2" />
					Add Environment Variable
				</Button>
			</CardContent>
		</Card>

		<!-- Action Buttons -->
		<div class="flex justify-end gap-3 pt-6 border-t">
			<Button variant="outline" onclick={() => goto('/projects')} type="button">
				Cancel
			</Button>
			<Button type="submit" disabled={loading} class="min-w-[140px]">
				{#if loading}
					<div class="flex items-center gap-2">
						<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
						Creating...
					</div>
				{:else}
					Create Project
				{/if}
			</Button>
		</div>
	</form>
</div>
