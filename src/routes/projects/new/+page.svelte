<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import { Badge } from '$lib/components/ui/badge';
	import { Switch } from '$lib/components/ui/switch';
	import { AlertCircle, ArrowLeft, Plus, X, Github, CheckCircle, Loader2, Rocket, Settings } from 'lucide-svelte';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { Progress } from '$lib/components/ui/progress';
	import { onMount } from 'svelte';
	import { dataStore } from '$lib/stores/data.svelte';

	// Enhanced form data for new API structure
	let formData = {
		name: '',
		description: '',
		repository_url: '',
		branch: 'main',
		build_command: '',
		start_command: '',
		port: 3000,
		custom_domain: '',
		runtime: 'bun' as 'bun' | 'node' | 'python' | 'deno' | 'go' | 'static',
		project_type: 'api' as 'api' | 'web' | 'static',
		template: '',
		auto_deploy: true,
		environment_variables: {} as Record<string, string>,
		github_repository_id: null as number | null
	};

	// Enhanced state management with deployment tracking
	let currentStep = 1;
	let totalSteps = 4;
	let loading = false;
	let creating = false;
	let deploymentStatus = '';
	let deploymentProgress = 0;
	let error = '';
	let successMessage = '';
	let validationErrors: Record<string, string> = {};
	let projectCreated: any = null;
	
	// Template and repository data
	interface ProjectTemplate {
		name: string;
		description: string;
		runtime: string;
		projectType: string;
		buildCommand?: string;
		startCommand?: string;
		defaultPort?: number;
	}
	
	let templates: { templates: Record<string, ProjectTemplate> } | null = null;
	let githubRepositories: any[] = [];
	let loadingRepositories = false;
	let loadingTemplates = false;
	let selectedTemplate: ProjectTemplate | null = null;
	let autoDetectedTemplate: ProjectTemplate | null = null;
	
	// Environment variables as array for easier manipulation
	let envVarArray: { key: string; value: string }[] = [];

	onMount(async () => {
		await Promise.all([
			loadProjectTemplates(),
			loadGitHubRepositories()
		]);
	});

	async function loadProjectTemplates() {
		loadingTemplates = true;
		try {
			// Use new API endpoint for templates
			const response = await fetch('/api/new/projects?templates=true');
			if (response.ok) {
				const result = await response.json();
				templates = result.data;
				
				// Auto-select default template
				if (result.data.templates && result.data.templates['bun-api']) {
					selectedTemplate = result.data.templates['bun-api'];
					formData.template = 'bun-api';
					formData.runtime = 'bun';
					formData.project_type = 'api';
					updateCommandsFromTemplate();
				}
			}
		} catch (err) {
			console.error('Failed to load templates:', err);
			error = 'Failed to load project templates';
		} finally {
			loadingTemplates = false;
		}
	}

	async function loadGitHubRepositories() {
		loadingRepositories = true;
		try {
			const response = await fetch('/api/new/github/repositories');
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

	function updateCommandsFromTemplate() {
		if (selectedTemplate) {
			if (!formData.build_command) {
				formData.build_command = selectedTemplate.buildCommand || '';
			}
			if (!formData.start_command) {
				formData.start_command = selectedTemplate.startCommand || '';
			}
			if (!formData.port || formData.port === 3000) {
				formData.port = selectedTemplate.defaultPort || 3000;
			}
		}
	}

	function handleTemplateChange(templateKey: string) {
		if (templates?.templates[templateKey]) {
			selectedTemplate = templates.templates[templateKey];
			formData.template = templateKey;
			formData.runtime = selectedTemplate.runtime as 'bun' | 'node' | 'python' | 'deno' | 'go' | 'static';
			formData.project_type = selectedTemplate.projectType as 'api' | 'web' | 'static';
			updateCommandsFromTemplate();
		}
	}

	// Auto-detect template from repository URL
	async function autoDetectTemplate() {
		if (!formData.repository_url) return;
		
		try {
			// This could be enhanced to actually fetch and analyze the repository
			const repoPath = formData.repository_url.replace('https://github.com/', '');
			console.log('Auto-detecting template for:', repoPath);
			
			// For now, use basic heuristics
			if (repoPath.includes('api') || repoPath.includes('server')) {
				handleTemplateChange('bun-api');
			} else if (repoPath.includes('web') || repoPath.includes('app')) {
				handleTemplateChange('bun-web');
			}
		} catch (err) {
			console.error('Auto-detection failed:', err);
		}
	}

	function addEnvironmentVariable() {
		envVarArray = [...envVarArray, { key: '', value: '' }];
	}

	function removeEnvironmentVariable(index: number) {
		envVarArray = envVarArray.filter((_, i) => i !== index);
		syncEnvironmentVariables();
	}

	function syncEnvironmentVariables() {
		formData.environment_variables = {};
		envVarArray.forEach(env => {
			if (env.key.trim()) {
				formData.environment_variables[env.key] = env.value;
			}
		});
	}

	function validateStep(step: number): boolean {
		validationErrors = {};
		
		switch (step) {
			case 1: // Basic Info
				if (!formData.name.trim()) {
					validationErrors.name = 'Project name is required';
				} else if (!/^[a-zA-Z0-9-_]+$/.test(formData.name)) {
					validationErrors.name = 'Project name can only contain letters, numbers, hyphens, and underscores';
				}
				break;
				
			case 2: // Repository
				if (!formData.repository_url.trim()) {
					validationErrors.repository_url = 'Repository URL is required';
				}
				break;
				
			case 3: // Configuration
				if (!formData.start_command.trim()) {
					validationErrors.start_command = 'Start command is required';
				}
				if (formData.port < 1 || formData.port > 65535) {
					validationErrors.port = 'Port must be between 1 and 65535';
				}
				if (formData.custom_domain && !/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.[a-zA-Z]{2,}$/.test(formData.custom_domain)) {
					validationErrors.custom_domain = 'Please enter a valid domain name';
				}
				break;
		}
		
		return Object.keys(validationErrors).length === 0;
	}

	function nextStep() {
		if (validateStep(currentStep)) {
			currentStep = Math.min(currentStep + 1, totalSteps);
		}
	}

	function previousStep() {
		currentStep = Math.max(currentStep - 1, 1);
	}

	async function handleSubmit() {
		if (!validateStep(3)) return;
		
		currentStep = 4; // Move to deployment step
		creating = true;
		loading = true;
		error = '';
		successMessage = '';
		deploymentStatus = 'Preparing deployment...';
		deploymentProgress = 10;

		try {
			// Sync environment variables
			syncEnvironmentVariables();
			
			// Enhanced project creation with new API
			deploymentStatus = 'Validating project configuration...';
			deploymentProgress = 25;
			
			// Create project using new API endpoint
			const response = await fetch('/api/new/projects', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					...formData,
					// Ensure proper field mapping for new API
					repository_url: formData.repository_url,
					github_repository_id: formData.github_repository_id
				})
			});

			deploymentStatus = 'Creating project...';
			deploymentProgress = 50;

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || 'Failed to create project');
			}

			const result = await response.json();
			projectCreated = result.data;
			
			deploymentStatus = 'Project created successfully!';
			deploymentProgress = 75;
			
			// Check if auto-deployment is enabled
			if (formData.auto_deploy) {
				deploymentStatus = 'Starting automatic deployment...';
				deploymentProgress = 85;
				
				// Trigger deployment
				try {
					const deployResponse = await fetch(`/api/new/projects/${projectCreated.id}/deploy`, {
						method: 'POST'
					});
					
					if (deployResponse.ok) {
						deploymentStatus = 'Deployment started successfully!';
						deploymentProgress = 100;
						successMessage = `Project "${projectCreated.name}" created and deployment started!`;
					} else {
						deploymentStatus = 'Project created, but deployment failed to start.';
						deploymentProgress = 90;
						successMessage = `Project "${projectCreated.name}" created successfully!`;
					}
				} catch (deployError) {
					console.error('Deployment start failed:', deployError);
					deploymentStatus = 'Project created, but auto-deployment failed.';
					deploymentProgress = 90;
					successMessage = `Project "${projectCreated.name}" created successfully!`;
				}
			} else {
				deploymentStatus = 'Project created successfully!';
				deploymentProgress = 100;
				successMessage = `Project "${projectCreated.name}" created successfully!`;
			}
			
			// Invalidate projects cache
			dataStore.invalidateAll();
			
			// Auto-redirect after a short delay
			setTimeout(() => {
				goto(`/projects/${encodeURIComponent(projectCreated.name)}`);
			}, 2500);
			
		} catch (err: any) {
			console.error('Failed to create project:', err);
			error = err.message || 'Failed to create project';
			deploymentStatus = 'Project creation failed';
			deploymentProgress = 0;
		} finally {
			creating = false;
			loading = false;
		}
	}

	function handleRepositoryUrlChange() {
		if (formData.repository_url && !formData.name) {
			const selectedRepo = githubRepositories.find(r => 
				r.clone_url === formData.repository_url || r.html_url === formData.repository_url
			);
			if (selectedRepo) {
				formData.name = selectedRepo.name;
				formData.github_repository_id = selectedRepo.id;
				
				// Auto-detect template when repository is selected
				autoDetectTemplate();
			}
		}
	}

	// Reactive statements with enhanced template detection
	$: if (formData.repository_url) {
		handleRepositoryUrlChange();
	}

	$: if (envVarArray) {
		syncEnvironmentVariables();
	}

	// Progress calculation with deployment phases
	$: progress = currentStep < 4 ? (currentStep / totalSteps) * 100 : deploymentProgress;

	// Enhanced deployment status messages
	$: deploymentStatusIcon = (() => {
		if (creating) return Loader2;
		if (error) return AlertCircle;
		if (successMessage) return CheckCircle;
		if (deploymentProgress === 100) return Rocket;
		return Settings;
	})();

	$: statusColor = (() => {
		if (error) return 'text-destructive';
		if (successMessage || deploymentProgress === 100) return 'text-green-600';
		if (creating) return 'text-blue-600';
		return 'text-muted-foreground';
	})();
</script>

<svelte:head>
	<title>New Project - MD0</title>
</svelte:head>

<div class="flex flex-1 flex-col gap-4 p-4">
	<!-- Page Header -->
	<div class="flex items-center gap-3">
		<Button variant="ghost" size="sm" onclick={() => goto('/projects')}>
			<ArrowLeft class="w-4 h-4 mr-1" />
			Back
		</Button>
		<div>
			<h1 class="text-xl font-semibold">Create New Project</h1>
			<p class="text-sm text-muted-foreground">Deploy your application</p>
		</div>
	</div>

	<!-- Progress Bar -->
	<div class="border rounded-lg p-4">
		<div class="flex items-center justify-between mb-3">
			<div class="flex items-center gap-3">
				{#each Array(totalSteps) as _, i}
					<div class="flex items-center gap-2">
						<div class={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
							i + 1 < currentStep ? 'bg-green-500 text-white' :
							i + 1 === currentStep ? 'bg-primary text-primary-foreground' :
							'bg-muted text-muted-foreground'
						}`}>
							{i + 1 < currentStep ? '✓' : i + 1}
						</div>
						{#if i < totalSteps - 1}
							<div class={`h-px w-8 transition-colors ${
								i + 1 < currentStep ? 'bg-green-500' : 'bg-muted'
							}`}></div>
						{/if}
					</div>
				{/each}
			</div>
			<div class="text-xs text-muted-foreground">
				Step {currentStep} of {totalSteps}
			</div>
		</div>
		<Progress value={progress} class="h-1" />
	</div>

	<!-- Alerts -->
	{#if error}
		<Alert variant="destructive">
			<AlertCircle class="h-4 w-4" />
			<AlertDescription>{error}</AlertDescription>
		</Alert>
	{/if}

	{#if successMessage}
		<Alert>
			<CheckCircle class="h-4 w-4" />
			<AlertDescription>{successMessage}</AlertDescription>
		</Alert>
	{/if}

	<!-- Step Content -->
	<div class="max-w-2xl mx-auto w-full">
		<!-- Step 1: Template & Basic Info -->
		{#if currentStep === 1}
			<div class="space-y-4">
				<!-- Template Selection -->
				<div class="border rounded-lg p-4">
					<h3 class="font-medium mb-2">Template</h3>
					{#if loadingTemplates}
						<div class="flex items-center justify-center py-6">
							<Loader2 class="w-4 h-4 animate-spin mr-2" />
							<span class="text-sm">Loading...</span>
						</div>
					{:else if templates?.templates}
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
							{#each Object.entries(templates.templates) as [key, template]}
								<button 
									type="button"
									class={`p-3 border rounded transition-colors hover:bg-muted/50 text-left w-full ${
										formData.template === key ? 'border-primary bg-primary/5' : ''
									}`} 
									onclick={() => handleTemplateChange(key)}
									aria-pressed={formData.template === key}
								>
									<div class="text-sm font-medium">{template.name}</div>
									<div class="text-xs text-muted-foreground mt-1">{template.description}</div>
									<div class="flex gap-1 mt-2">
										<Badge variant="secondary" class="text-xs px-1.5 py-0.5">{template.runtime?.toUpperCase()}</Badge>
										<Badge variant="outline" class="text-xs px-1.5 py-0.5">{template.projectType?.toUpperCase()}</Badge>
									</div>
								</button>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Basic Information -->
				<div class="border rounded-lg p-4">
					<h3 class="font-medium mb-3">Basic Information</h3>
					<div class="space-y-3">
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
							<div class="space-y-1">
								<Label for="name" class="text-sm">Project Name *</Label>
								<Input
									id="name"
									bind:value={formData.name}
									placeholder="my-awesome-app"
									class={`text-sm ${validationErrors.name ? 'border-destructive' : ''}`}
								/>
								{#if validationErrors.name}
									<p class="text-xs text-destructive flex items-center gap-1">
										<AlertCircle class="h-3 w-3" />
										{validationErrors.name}
									</p>
								{/if}
							</div>
							<div class="space-y-1">
								<Label for="custom_domain" class="text-sm">Custom Domain</Label>
								<Input
									id="custom_domain"
									bind:value={formData.custom_domain}
									placeholder="example.com"
									class={`text-sm ${validationErrors.custom_domain ? 'border-destructive' : ''}`}
								/>
								{#if validationErrors.custom_domain}
									<p class="text-xs text-destructive flex items-center gap-1">
										<AlertCircle class="h-3 w-3" />
										{validationErrors.custom_domain}
									</p>
								{/if}
							</div>
						</div>
						<div class="space-y-1">
							<Label for="description" class="text-sm">Description</Label>
							<Textarea
								id="description"
								bind:value={formData.description}
								placeholder="Brief description of your project"
								rows={2}
								class="text-sm"
							/>
						</div>
					</div>
				</div>
			</div>
		{/if}

		<!-- Step 2: Repository Selection -->
		{#if currentStep === 2}
			<div class="border rounded-lg p-4">
				<h3 class="font-medium mb-3">Repository</h3>
				{#if loadingRepositories}
					<div class="flex items-center justify-center py-6">
						<Loader2 class="w-4 h-4 animate-spin mr-2" />
						<span class="text-sm">Loading...</span>
					</div>
				{:else if githubRepositories.length === 0}
					<div class="text-center py-8">
						<Github class="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
						<h4 class="font-medium mb-1">No GitHub App Installation</h4>
						<p class="text-sm text-muted-foreground mb-4">Install the GitHub App to access your repositories.</p>
						<Button size="sm" onclick={() => window.open('https://github.com/apps/mdo-0/installations/new', '_blank')}>
							<Github class="w-4 h-4 mr-1" />
							Install GitHub App
						</Button>
					</div>
				{:else}
					<div class="space-y-3">
						<div class="space-y-1">
							<Label for="repository" class="text-sm">GitHub Repository *</Label>
							<Select type="single" bind:value={formData.repository_url}>
								<SelectTrigger class={`text-sm ${validationErrors.repository_url ? 'border-destructive' : ''}`}>
									<span data-slot="select-value">
										{formData.repository_url ? 
											githubRepositories.find(r => r.clone_url === formData.repository_url)?.full_name || 'Select repository'
											: 'Select a repository'
										}
									</span>
								</SelectTrigger>
								<SelectContent>
									{#each githubRepositories as repo}
										<SelectItem value={repo.clone_url}>
											<div class="flex items-center gap-2">
												<Github class="w-3 h-3" />
												<span class="text-sm">{repo.full_name}</span>
												{#if repo.private}
													<Badge variant="secondary" class="text-xs">Private</Badge>
												{/if}
												{#if repo.language}
													<Badge variant="outline" class="text-xs">{repo.language}</Badge>
												{/if}
											</div>
										</SelectItem>
									{/each}
								</SelectContent>
							</Select>
							{#if validationErrors.repository_url}
								<p class="text-xs text-destructive flex items-center gap-1">
									<AlertCircle class="h-3 w-3" />
									{validationErrors.repository_url}
								</p>
							{/if}
						</div>
						<div class="space-y-1">
							<Label for="branch" class="text-sm">Branch</Label>
							<Input
								id="branch"
								bind:value={formData.branch}
								placeholder="main"
								class="text-sm"
							/>
							<p class="text-xs text-muted-foreground">The branch to deploy from your repository</p>
						</div>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Step 3: Configuration -->
		{#if currentStep === 3}
			<div class="space-y-4">
				<!-- Build Configuration -->
				<div class="border rounded-lg p-4">
					<h3 class="font-medium mb-3">Configuration</h3>
					<div class="space-y-3">
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
							<div class="space-y-1">
								<Label for="runtime" class="text-sm">Runtime</Label>
								<Select type="single" bind:value={formData.runtime}>
									<SelectTrigger class="text-sm">
										<span data-slot="select-value">
											{formData.runtime ? formData.runtime.toUpperCase() : 'Select runtime'}
										</span>
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="bun">Bun</SelectItem>
										<SelectItem value="node">Node.js</SelectItem>
										<SelectItem value="python">Python</SelectItem>
										<SelectItem value="deno">Deno</SelectItem>
										<SelectItem value="go">Go</SelectItem>
										<SelectItem value="static">Static</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div class="space-y-1">
								<Label for="port" class="text-sm">Port</Label>
								<Input
									id="port"
									type="number"
									bind:value={formData.port}
									min="1"
									max="65535"
									class={`text-sm ${validationErrors.port ? 'border-destructive' : ''}`}
								/>
								{#if validationErrors.port}
									<p class="text-xs text-destructive flex items-center gap-1">
										<AlertCircle class="h-3 w-3" />
										{validationErrors.port}
									</p>
								{/if}
							</div>
						</div>

						<div class="space-y-1">
							<Label for="build_command" class="text-sm">Build Command</Label>
							<Input
								id="build_command"
								bind:value={formData.build_command}
								placeholder="bun install"
								class="font-mono text-sm"
							/>
						</div>

						<div class="space-y-1">
							<Label for="start_command" class="text-sm">Start Command *</Label>
							<Input
								id="start_command"
								bind:value={formData.start_command}
								placeholder="bun start"
								class={`font-mono text-sm ${validationErrors.start_command ? 'border-destructive' : ''}`}
							/>
							{#if validationErrors.start_command}
								<p class="text-xs text-destructive flex items-center gap-1">
									<AlertCircle class="h-3 w-3" />
									{validationErrors.start_command}
								</p>
							{/if}
						</div>

						<div class="flex items-center space-x-2">
							<Switch bind:checked={formData.auto_deploy} />
							<Label for="auto_deploy" class="text-sm">Auto-deploy on git push</Label>
						</div>
					</div>
				</div>

				<!-- Environment Variables -->
				<div class="border rounded-lg p-4">
					<h3 class="font-medium mb-3">Environment Variables <Badge variant="secondary" class="ml-2 text-xs">Optional</Badge></h3>
					<div class="space-y-3">
						{#each envVarArray as envVar, index}
							<div class="flex gap-2 items-start">
								<div class="flex-1">
									<Input
										bind:value={envVar.key}
										placeholder="VARIABLE_NAME"
										class="font-mono text-sm"
									/>
								</div>
								<div class="flex-1">
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
									class="text-muted-foreground hover:text-destructive"
									onclick={() => removeEnvironmentVariable(index)}
								>
									<X class="w-4 h-4" />
								</Button>
							</div>
						{:else}
							<div class="text-center py-4 text-muted-foreground">
								<p class="text-sm">No environment variables added yet</p>
							</div>
						{/each}
					</div>

					<Button
						type="button"
						variant="outline"
						size="sm"
						onclick={addEnvironmentVariable}
						class="w-full mt-3"
					>
						<Plus class="w-4 h-4 mr-1" />
						Add Variable
					</Button>
				</div>
			</div>
		{/if}

		<!-- Step 4: Deployment -->
		{#if currentStep === 4}
			<div class="border rounded-lg p-4">
				<div class="mb-3">
					<h3 class="font-medium flex items-center gap-2">
						<svelte:component this={deploymentStatusIcon} class={`w-4 h-4 ${creating ? 'animate-spin' : ''} ${statusColor}`} />
						Deployment Status
					</h3>
					<p class="text-sm text-muted-foreground">
						{creating ? 'Creating and deploying your project...' : 'Deployment process completed!'}
					</p>
				</div>
				<div class="space-y-4">
					{#if creating}
						<div class="space-y-3">
							<div class="text-center">
								<Loader2 class="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
								<p class="text-sm font-medium">{deploymentStatus}</p>
								<p class="text-xs text-muted-foreground">This may take a few minutes...</p>
							</div>
							<Progress value={deploymentProgress} class="h-1" />
						</div>
					{:else if successMessage}
						<div class="text-center space-y-3">
							<CheckCircle class="w-10 h-10 mx-auto text-green-500" />
							<div>
								<h4 class="font-medium text-green-600">Project Created Successfully!</h4>
								<p class="text-sm text-muted-foreground mt-1">{deploymentStatus}</p>
								{#if projectCreated}
									<p class="text-xs text-muted-foreground mt-1">
										Redirecting to your project dashboard...
									</p>
								{/if}
							</div>
							<div class="flex gap-2 justify-center">
								<Button size="sm" onclick={() => goto('/projects')} variant="outline">
									View All Projects
								</Button>
								{#if projectCreated}
									<Button size="sm" onclick={() => goto(`/projects/${encodeURIComponent(projectCreated.name)}`)}>
										View Project
									</Button>
								{/if}
							</div>
						</div>
					{:else if error}
						<div class="text-center space-y-3">
							<AlertCircle class="w-10 h-10 mx-auto text-destructive" />
							<div>
								<h4 class="font-medium text-destructive">Deployment Failed</h4>
								<p class="text-sm text-muted-foreground mt-1">{error}</p>
							</div>
							<div class="flex gap-2 justify-center">
								<Button size="sm" onclick={() => { currentStep = 3; error = ''; }} variant="outline">
									Try Again
								</Button>
								<Button size="sm" onclick={() => goto('/projects')}>
									Back to Projects
								</Button>
							</div>
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Navigation Buttons -->
		{#if currentStep < 4}
			<div class="flex justify-between pt-4">
				<Button 
					variant="outline" 
					size="sm"
					onclick={previousStep} 
					disabled={currentStep === 1}
				>
					Previous
				</Button>
				
				<div class="flex gap-2">
					<Button variant="outline" size="sm" onclick={() => goto('/projects')}>
						Cancel
					</Button>
					
					{#if currentStep === 3}
						<Button size="sm" onclick={handleSubmit} disabled={loading}>
							{#if loading}
								<Loader2 class="w-4 h-4 animate-spin mr-1" />
								Creating...
							{:else}
								<Rocket class="w-4 h-4 mr-1" />
								Create & Deploy
							{/if}
						</Button>
					{:else}
						<Button size="sm" onclick={nextStep} disabled={currentStep === 2 && githubRepositories.length === 0}>
							Next
						</Button>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>
