<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { 
		Database, 
		Plus, 
		Play, 
		Square, 
		Trash2, 
		RefreshCw,
		AlertCircle,
		CheckCircle,
		Settings,
		Download,
		Upload
	} from 'lucide-svelte';
	import type { DatabaseInstance } from '$lib/types';

	let databases: DatabaseInstance[] = [];
	let loading = false;
	let error = '';
	let success = '';

	// New database form
	let newDatabase = {
		name: '',
		type: 'postgresql',
		version: '15',
		port: 5432,
		memory_limit: 512,
		storage_limit: 10
	};

	onMount(async () => {
		await loadDatabases();
	});

	async function loadDatabases() {
		try {
			loading = true;
			const response = await fetch('/api/databases');
			if (response.ok) {
				databases = await response.json();
			} else {
				error = 'Failed to load databases';
			}
		} catch (err) {
			error = 'Failed to load databases';
			console.error(err);
		} finally {
			loading = false;
		}
	}

	async function createDatabase() {
		if (!newDatabase.name.trim()) {
			error = 'Database name is required';
			return;
		}

		try {
			loading = true;
			error = '';
			success = '';

			const response = await fetch('/api/databases', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(newDatabase)
			});

			if (response.ok) {
				success = 'Database created successfully';
				newDatabase = {
					name: '',
					type: 'postgresql',
					version: '15',
					port: 5432,
					memory_limit: 512,
					storage_limit: 10
				};
				await loadDatabases();
			} else {
				const result = await response.json();
				error = result.error || 'Failed to create database';
			}
		} catch (err) {
			error = 'Failed to create database';
			console.error(err);
		} finally {
			loading = false;
		}
	}

	async function performDatabaseAction(databaseId: string, action: string) {
		try {
			loading = true;
			error = '';
			success = '';

			const response = await fetch(`/api/databases/${databaseId}/${action}`, {
				method: 'POST'
			});

			if (response.ok) {
				success = `Database ${action} successful`;
				await loadDatabases();
			} else {
				const result = await response.json();
				error = result.error || `Failed to ${action} database`;
			}
		} catch (err) {
			error = `Failed to ${action} database`;
			console.error(err);
		} finally {
			loading = false;
		}
	}

	async function deleteDatabase(databaseId: string, databaseName: string) {
		if (!confirm(`Are you sure you want to delete database "${databaseName}"? This action cannot be undone.`)) {
			return;
		}

		try {
			loading = true;
			error = '';
			success = '';

			const response = await fetch(`/api/databases/${databaseId}`, {
				method: 'DELETE'
			});

			if (response.ok) {
				success = 'Database deleted successfully';
				await loadDatabases();
			} else {
				const result = await response.json();
				error = result.error || 'Failed to delete database';
			}
		} catch (err) {
			error = 'Failed to delete database';
			console.error(err);
		} finally {
			loading = false;
		}
	}

	function getStatusColor(status: string) {
		switch (status) {
			case 'running':
				return 'text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950 dark:border-green-800';
			case 'stopped':
				return 'text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950 dark:border-red-800';
			case 'starting':
				return 'text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950 dark:border-blue-800';
			case 'error':
				return 'text-orange-700 bg-orange-50 border-orange-200 dark:text-orange-400 dark:bg-orange-950 dark:border-orange-800';
			default:
				return 'text-gray-700 bg-gray-50 border-gray-200 dark:text-gray-300 dark:bg-gray-800 dark:border-gray-600';
		}
	}

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 GB';
		const gb = bytes / (1024 ** 3);
		return `${gb.toFixed(1)} GB`;
	}

	function formatDate(date: string | Date) {
		return typeof date === 'string' ? new Date(date).toLocaleString() : date.toLocaleString();
	}
</script>

<svelte:head>
	<title>Database Management - MD0</title>
</svelte:head>

<div class="flex flex-1 flex-col gap-4 p-4 pt-0">
	<!-- Page Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Database Management</h1>
			<p class="text-muted-foreground">
				Manage your database instances and configurations
			</p>
		</div>
		<Button variant="outline" onclick={loadDatabases} size="sm">
			<RefreshCw class="w-4 h-4 mr-2" />
			Refresh
		</Button>
	</div>

	<!-- Alerts -->
	{#if error}
		<Alert variant="destructive">
			<AlertCircle class="h-4 w-4" />
			<AlertDescription>{error}</AlertDescription>
		</Alert>
	{/if}

	{#if success}
		<Alert>
			<CheckCircle class="h-4 w-4" />
			<AlertDescription>{success}</AlertDescription>
		</Alert>
	{/if}

	<!-- Database Management Content -->
	<Tabs value="instances" class="w-full">
		<TabsList class="grid w-full grid-cols-2">
			<TabsTrigger value="instances">
				<Database class="w-4 h-4 mr-2" />
				Database Instances
			</TabsTrigger>
			<TabsTrigger value="create">
				<Plus class="w-4 h-4 mr-2" />
				Create New
			</TabsTrigger>
		</TabsList>

		<!-- Database Instances Tab -->
		<TabsContent value="instances" class="space-y-4">
			{#if loading && databases.length === 0}
				<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{#each Array(3) as _}
						<Card>
							<CardHeader>
								<div class="animate-pulse">
									<div class="h-4 bg-muted rounded w-3/4 mb-2"></div>
									<div class="h-3 bg-muted rounded w-1/2"></div>
								</div>
							</CardHeader>
							<CardContent>
								<div class="animate-pulse space-y-3">
									<div class="h-3 bg-muted rounded"></div>
									<div class="h-3 bg-muted rounded w-2/3"></div>
									<div class="flex gap-2">
										<div class="h-8 bg-muted rounded w-16"></div>
										<div class="h-8 bg-muted rounded w-16"></div>
									</div>
								</div>
							</CardContent>
						</Card>
					{/each}
				</div>
			{:else if databases.length === 0}
				<Card class="text-center py-12">
					<CardContent>
						<Database class="w-12 h-12 mx-auto text-muted-foreground mb-4" />
						<h3 class="text-lg font-semibold mb-2">No databases yet</h3>
						<p class="text-muted-foreground mb-4">
							Create your first database instance to get started
						</p>
						<Button>
							<Plus class="w-4 h-4 mr-2" />
							Create Database
						</Button>
					</CardContent>
				</Card>
			{:else}
				<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{#each databases as database}
						<Card class="hover:shadow-md transition-shadow">
							<CardHeader>
								<div class="flex justify-between items-start">
									<div>
										<CardTitle class="text-lg flex items-center gap-2">
											<Database class="w-4 h-4" />
											{database.name}
										</CardTitle>
										<CardDescription class="mt-1">
											{database.type} {database.version}
										</CardDescription>
									</div>
									<Badge class={getStatusColor(database.status)} variant="outline">
										{database.status}
									</Badge>
								</div>
							</CardHeader>
							<CardContent>
								<div class="space-y-4">
									<div class="text-sm space-y-2">
										<div class="flex justify-between">
											<span class="text-muted-foreground">Port:</span>
											<span class="font-mono">{database.port}</span>
										</div>
										<div class="flex justify-between">
											<span class="text-muted-foreground">Memory:</span>
											<span>{database.memory_limit} MB</span>
										</div>
										<div class="flex justify-between">
											<span class="text-muted-foreground">Storage:</span>
											<span>{formatBytes((database.storage_limit ?? 0) * 1024 * 1024 * 1024)}</span>
										</div>
										<div class="flex justify-between">
											<span class="text-muted-foreground">Created:</span>
											<span>{formatDate(database.created_at)}</span>
										</div>
									</div>

									<div class="flex gap-2 flex-wrap">
										{#if database.status === 'running'}
											<Button 
												size="sm" 
												variant="outline" 
												onclick={() => performDatabaseAction(database.id.toString(), 'stop')}
												disabled={loading}
											>
												<Square class="w-3 h-3 mr-1" />
												Stop
											</Button>
											<Button 
												size="sm" 
												variant="outline" 
												onclick={() => performDatabaseAction(database.id.toString(), 'backup')}
												disabled={loading}
											>
												<Download class="w-3 h-3 mr-1" />
												Backup
											</Button>
										{:else if database.status === 'stopped'}
											<Button 
												size="sm" 
												variant="outline" 
												onclick={() => performDatabaseAction(database.id.toString(), 'start')}
												disabled={loading}
											>
												<Play class="w-3 h-3 mr-1" />
												Start
											</Button>
										{/if}
										<Button 
											size="sm" 
											variant="outline" 
											onclick={() => deleteDatabase(database.id.toString(), database.name)}
											disabled={loading}
										>
											<Trash2 class="w-3 h-3 mr-1" />
											Delete
										</Button>
									</div>
								</div>
							</CardContent>
						</Card>
					{/each}
				</div>
			{/if}
		</TabsContent>

		<!-- Create New Database Tab -->
		<TabsContent value="create" class="space-y-4">
			<Card>
				<CardHeader>
					<CardTitle>Create New Database</CardTitle>
					<CardDescription>
						Set up a new database instance with custom configuration
					</CardDescription>
				</CardHeader>
				<CardContent class="space-y-4">
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div>
							<Label for="db-name">Database Name *</Label>
							<Input
								id="db-name"
								bind:value={newDatabase.name}
								placeholder="my-database"
							/>
						</div>
						<div>
							<Label for="db-type">Database Type</Label>
							<Select type="single" bind:value={newDatabase.type}>
								<SelectTrigger>
									<span data-slot="select-value">
										{newDatabase.type || "Select database type"}
									</span>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="postgresql">PostgreSQL</SelectItem>
									<SelectItem value="mysql">MySQL</SelectItem>
									<SelectItem value="redis">Redis</SelectItem>
									<SelectItem value="mongodb">MongoDB</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div>
							<Label for="db-version">Version</Label>
							<Input
								id="db-version"
								bind:value={newDatabase.version}
								placeholder="15"
							/>
						</div>
						<div>
							<Label for="db-port">Port</Label>
							<Input
								id="db-port"
								type="number"
								bind:value={newDatabase.port}
								min="1024"
								max="65535"
							/>
						</div>
					</div>

					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div>
							<Label for="db-memory">Memory Limit (MB)</Label>
							<Input
								id="db-memory"
								type="number"
								bind:value={newDatabase.memory_limit}
								min="128"
								max="8192"
							/>
						</div>
						<div>
							<Label for="db-storage">Storage Limit (GB)</Label>
							<Input
								id="db-storage"
								type="number"
								bind:value={newDatabase.storage_limit}
								min="1"
								max="1000"
							/>
						</div>
					</div>

					<div class="flex justify-end">
						<Button onclick={createDatabase} disabled={loading}>
							{loading ? 'Creating...' : 'Create Database'}
						</Button>
					</div>
				</CardContent>
			</Card>
		</TabsContent>
	</Tabs>
</div>
