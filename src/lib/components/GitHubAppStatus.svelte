<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { Separator } from '$lib/components/ui/separator';
	import { 
		CheckCircle, 
		XCircle, 
		RefreshCw, 
		ExternalLink, 
		GitBranch, 
		Users, 
		Settings,
		AlertTriangle
	} from 'lucide-svelte';

	let installations: any[] = $state([]);
	let repositories: any[] = $state([]);
	let loading = $state(true);
	let refreshing = $state(false);
	let error = $state('');

	onMount(() => {
		loadGitHubAppStatus();
	});

	async function loadGitHubAppStatus() {
		try {
			loading = true;
			error = '';

			// Load installations and repositories
			const [installationsResponse, repositoriesResponse] = await Promise.all([
				fetch('/api/github/app/installations'),
				fetch('/api/github/app/repositories')
			]);

			if (installationsResponse.ok) {
				const installationsResult = await installationsResponse.json();
				installations = installationsResult.data || [];
			} else {
				console.error('Failed to load installations:', installationsResponse.status);
			}

			if (repositoriesResponse.ok) {
				const repositoriesResult = await repositoriesResponse.json();
				repositories = repositoriesResult.data?.repositories || [];
			} else {
				console.error('Failed to load repositories:', repositoriesResponse.status);
			}
		} catch (err) {
			error = 'Failed to load GitHub App status';
			console.error('GitHub App status error:', err);
		} finally {
			loading = false;
		}
	}

	async function refreshStatus() {
		refreshing = true;
		await loadGitHubAppStatus();
		refreshing = false;
	}

	async function syncInstallations() {
		try {
			refreshing = true;
			error = '';
			
			const response = await fetch('/api/github/app/sync', {
				method: 'POST'
			});
			
			if (response.ok) {
				const result = await response.json();
				console.log('Sync result:', result);
				// Reload status after sync
				await loadGitHubAppStatus();
			} else {
				const result = await response.json();
				error = result.error || 'Failed to sync installations';
			}
		} catch (err) {
			error = 'Failed to sync installations';
			console.error('Sync error:', err);
		} finally {
			refreshing = false;
		}
	}

	function getInstallUrl() {
		// Using the user's GitHub App: mdo-0
		return 'https://github.com/apps/mdo-0/installations/new';
	}

	function getConfigureUrl(installationId: number) {
		return `https://github.com/settings/installations/${installationId}`;
	}
</script>

{#if loading}
	<div class="flex items-center justify-center py-8">
		<div class="flex items-center gap-2 text-muted-foreground">
			<RefreshCw class="h-4 w-4 animate-spin" />
			Loading GitHub App status...
		</div>
	</div>
{:else if error}
	<Alert variant="destructive">
		<AlertTriangle class="h-4 w-4" />
		<AlertDescription>{error}</AlertDescription>
	</Alert>
{:else}
	<div class="space-y-4">
		<!-- Installation Status -->
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<h3 class="text-lg font-medium">Installation Status</h3>
				{#if installations.length > 0}
					<Badge variant="outline" class="bg-green-100 text-green-800">
						<CheckCircle class="w-3 h-3 mr-1" />
						Connected
					</Badge>
				{:else}
					<Badge variant="destructive">
						<XCircle class="w-3 h-3 mr-1" />
						Not Installed
					</Badge>
				{/if}
			</div>
			<div class="flex gap-2">
				<Button variant="outline" size="sm" onclick={refreshStatus} disabled={refreshing}>
					<RefreshCw class="w-4 h-4 mr-2 {refreshing ? 'animate-spin' : ''}" />
					Refresh
				</Button>
				<Button variant="outline" size="sm" onclick={syncInstallations} disabled={refreshing}>
					<RefreshCw class="w-4 h-4 mr-2 {refreshing ? 'animate-spin' : ''}" />
					Sync Installations
				</Button>
				{#if installations.length === 0}
					<Button size="sm" onclick={() => window.open(getInstallUrl(), '_blank')}>
						<ExternalLink class="w-4 h-4 mr-2" />
						Install GitHub App
					</Button>
				{/if}
			</div>
		</div>

		<Separator />

		{#if installations.length > 0}
			<!-- Installations List -->
			<div class="space-y-3">
				<h4 class="font-medium text-sm text-muted-foreground uppercase tracking-wide">
					Installations ({installations.length})
				</h4>
				{#each installations as installation}
					<Card>
						<CardContent class="p-4">
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-3">
									<div class="flex items-center gap-2">
										{#if installation.account_type === 'Organization'}
											<Users class="w-4 h-4 text-blue-600" />
										{:else}
											<GitBranch class="w-4 h-4 text-green-600" />
										{/if}
										<span class="font-medium">{installation.account_login}</span>
									</div>
									<Badge variant="secondary" class="text-xs">
										{installation.account_type}
									</Badge>
								</div>
								<div class="flex items-center gap-2 text-xs text-muted-foreground">
									<span>ID: {installation.installation_id}</span>
									<Button variant="ghost" size="sm" onclick={() => window.open(`https://github.com/settings/installations/${installation.installation_id}`, '_blank')}>
										<Settings class="w-3 h-3" />
									</Button>
								</div>
							</div>
						</CardContent>
					</Card>
				{/each}
			</div>

			<Separator />

			<!-- Repositories List -->
			<div class="space-y-3">
				<div class="flex items-center justify-between">
					<h4 class="font-medium text-sm text-muted-foreground uppercase tracking-wide">
						Accessible Repositories ({repositories.length})
					</h4>
					{#if repositories.length > 10}
						<Badge variant="outline">{repositories.length} total</Badge>
					{/if}
				</div>
				
				{#if repositories.length > 0}
					<div class="grid gap-2 max-h-64 overflow-y-auto">
						{#each repositories.slice(0, 10) as repo}
							<div class="flex items-center justify-between p-2 rounded-lg border bg-card">
								<div class="flex items-center gap-2">
									<GitBranch class="w-4 h-4 text-muted-foreground" />
									<span class="text-sm font-medium">{repo.full_name}</span>
									{#if repo.private}
										<Badge variant="secondary" class="text-xs">Private</Badge>
									{/if}
								</div>
								<Button 
									variant="ghost" 
									size="sm" 
									onclick={() => window.open(repo.html_url, '_blank')}
								>
									<ExternalLink class="w-3 h-3" />
								</Button>
							</div>
						{/each}
						{#if repositories.length > 10}
							<div class="text-center text-xs text-muted-foreground py-2">
								... and {repositories.length - 10} more repositories
							</div>
						{/if}
					</div>
				{:else}
					<div class="text-center py-8 text-muted-foreground">
						<GitBranch class="w-8 h-8 mx-auto mb-2 opacity-50" />
						<p class="text-sm">No repositories accessible</p>
						<p class="text-xs">Grant repository access in your GitHub App settings</p>
					</div>
				{/if}
			</div>
		{:else}
			<!-- No Installation -->
			<div class="text-center py-8">
				<div class="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
					<Settings class="w-8 h-8 text-muted-foreground" />
				</div>
				<h3 class="text-lg font-medium mb-2">GitHub App Not Installed</h3>
				<p class="text-muted-foreground text-sm mb-4 max-w-md mx-auto">
					Install the GitHub App to enable automatic repository access and deployments.
					This eliminates the need for personal access tokens.
				</p>
				<Button onclick={() => window.open(getInstallUrl(), '_blank')}>
					<ExternalLink class="w-4 h-4 mr-2" />
					Install GitHub App
				</Button>
			</div>
		{/if}
	</div>
{/if}
