<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Progress } from '$lib/components/ui/progress';
	import { Separator } from '$lib/components/ui/separator';
	import {
		Server,
		Cpu,
		HardDrive,
		MemoryStick,
		Activity,
		Zap,
		RefreshCw,
		AlertTriangle,
		CheckCircle,
		Shield,
		Network,
		Users,
		Globe,
		Lock,
		Eye,
		Terminal,
		Database,
		Clock,
		Wifi,
		AlertCircle,
		Info
	} from 'lucide-svelte';
	import { formatBytes, formatUptime } from '$lib/utils';
	import type { SystemMetrics, SecurityMetrics, VPSInformation } from '$lib/types';

	let metrics: SystemMetrics | null = null;
	let securityMetrics: SecurityMetrics | null = null;
	let vpsInformation: VPSInformation | null = null;
	let topProcesses: Array<{pid: number, cpu: number, memory: number, command: string}> = [];
	let containers: Array<{name: string, status: string, ports: string}> = [];
	let databaseStatus: {postgresql: boolean, pocketbase: boolean} = {postgresql: false, pocketbase: false};
	let recentLogs: string = '';
	let loading = true;
	let error = '';
	let autoRefresh = true;
	let refreshInterval: NodeJS.Timeout;

	onMount(async () => {
		await loadMetrics();
		if (autoRefresh) {
			startAutoRefresh();
		}
	});

	onDestroy(() => {
		if (refreshInterval) {
			clearInterval(refreshInterval);
		}
	});

	async function loadMetrics() {
		try {
			loading = true;
			const response = await fetch('/api/system/metrics');
			if (response.ok) {
				const data = await response.json();
				metrics = data.data?.current_metrics || null;
				securityMetrics = data.data?.security_metrics || null;
				vpsInformation = data.data?.vps_information || null;
				topProcesses = data.data?.top_processes || [];
				containers = data.data?.containers || [];
				databaseStatus = data.data?.database_status || {postgresql: false, pocketbase: false};
				recentLogs = data.data?.recent_logs || '';
				error = '';
			} else {
				error = 'Failed to load system metrics';
			}
		} catch (err) {
			error = 'Failed to load system metrics';
			console.error(err);
		} finally {
			loading = false;
		}
	}

	function startAutoRefresh() {
		if (refreshInterval) clearInterval(refreshInterval);
		refreshInterval = setInterval(loadMetrics, 5000); // Refresh every 5 seconds
	}

	function stopAutoRefresh() {
		if (refreshInterval) {
			clearInterval(refreshInterval);
		}
	}

	function toggleAutoRefresh() {
		autoRefresh = !autoRefresh;
		if (autoRefresh) {
			startAutoRefresh();
		} else {
			stopAutoRefresh();
		}
	}

	function getHealthStatus(cpu: number, memory: number, disk: number) {
		if (cpu > 90 || memory > 90 || disk > 90) {
			return {
				status: 'critical',
				color:
					'border-red-500/50 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400 dark:border-red-800',
				icon: AlertTriangle
			};
		} else if (cpu > 70 || memory > 70 || disk > 70) {
			return {
				status: 'warning',
				color:
					'border-yellow-500/50 bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400 dark:border-yellow-800',
				icon: AlertTriangle
			};
		} else {
			return {
				status: 'healthy',
				color:
					'border-green-500/50 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400 dark:border-green-800',
				icon: CheckCircle
			};
		}
	}

	function getSecurityStatus() {
		if (!securityMetrics) return { status: 'unknown', color: 'border-gray-500/50 bg-gray-50', icon: AlertTriangle };
		
		const issues = [];
		if (!securityMetrics.firewall_status) issues.push('Firewall inactive');
		if (!securityMetrics.fail2ban_status) issues.push('Fail2ban inactive');
		if (securityMetrics.failed_login_attempts > 10) issues.push('High failed login attempts');
		if (securityMetrics.suspicious_processes?.length > 0) issues.push('Suspicious processes detected');
		
		if (issues.length === 0) {
			return {
				status: 'secure',
				color: 'border-green-500/50 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400 dark:border-green-800',
				icon: Shield,
				message: 'All security systems operational'
			};
		} else if (issues.length <= 2) {
			return {
				status: 'warning',
				color: 'border-yellow-500/50 bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400 dark:border-yellow-800',
				icon: AlertTriangle,
				message: `Security issues: ${issues.join(', ')}`
			};
		} else {
			return {
				status: 'critical',
				color: 'border-red-500/50 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400 dark:border-red-800',
				icon: AlertCircle,
				message: `Critical security issues: ${issues.join(', ')}`
			};
		}
	}

	function getProgressColor(value: number): string {
		if (value > 90) return 'bg-red-500 dark:bg-red-600';
		if (value > 70) return 'bg-yellow-500 dark:bg-yellow-600';
		return 'bg-green-500 dark:bg-green-600';
	}

	function formatLogTime(timestamp: string): string {
		const date = new Date(timestamp);
		return date.toLocaleString();
	}

	$: healthStatus = metrics
		? getHealthStatus(metrics.cpu_usage ?? 0, metrics.memory_usage ?? 0, metrics.disk_usage ?? 0)
		: null;
	$: securityStatus = getSecurityStatus();
</script>

<svelte:head>
	<title>VPS Security Monitor - MD0</title>
</svelte:head>

<div class="flex flex-1 flex-col gap-4 p-4 pt-0">
	<!-- Page Header -->
	<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">VPS Security Monitor</h1>
			<p class="text-muted-foreground">Comprehensive server monitoring with security analysis and attack prevention</p>
		</div>
		<div class="flex items-center gap-2">
			<Button
				variant="outline"
				size="sm"
				onclick={toggleAutoRefresh}
				class="gap-2 {autoRefresh
					? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400'
					: ''}"
			>
				{autoRefresh ? 'Disable' : 'Enable'} Auto-refresh
			</Button>
			<Button variant="outline" size="sm" onclick={loadMetrics} disabled={loading} class="gap-2">
				<RefreshCw class="h-4 w-4 {loading ? 'animate-spin' : ''}" />
				Refresh
			</Button>
		</div>
	</div>

	{#if loading && !metrics}
		<div class="flex h-[50vh] items-center justify-center">
			<div class="flex flex-col items-center gap-2">
				<div
					class="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
				></div>
				<div class="text-muted-foreground text-sm">Loading system metrics...</div>
			</div>
		</div>
	{:else if error}
		<Card class="border-destructive/50 bg-destructive/5">
			<CardContent class="pt-6">
				<div class="flex items-center gap-3">
					<AlertTriangle class="text-destructive h-5 w-5" />
					<div>
						<p class="text-destructive font-medium">{error}</p>
						<Button onclick={loadMetrics} variant="outline" size="sm" class="mt-3">
							<RefreshCw class="mr-2 h-4 w-4" />
							Try Again
						</Button>
					</div>
				</div>
			</CardContent>
		</Card>
	{:else if metrics}
		<!-- Security Status Overview -->
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
			<Card class="transition-shadow hover:shadow-md">
				<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle class="text-sm font-medium">System Status</CardTitle>
					{#if healthStatus}
						<svelte:component this={healthStatus.icon} class="h-4 w-4 text-green-600" />
					{/if}
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold text-green-600 dark:text-green-400">Online</div>
					<p class="text-muted-foreground mt-1 text-xs">
						{healthStatus?.status === 'healthy'
							? 'All systems operational'
							: healthStatus?.status === 'warning'
								? 'Some resources high'
								: 'Critical resources'}
					</p>
				</CardContent>
			</Card>

			<Card class="transition-shadow hover:shadow-md">
				<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle class="text-sm font-medium">Security Status</CardTitle>
					<svelte:component this={securityStatus.icon} class="h-4 w-4" />
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold capitalize
						{securityStatus.status === 'secure' ? 'text-green-600 dark:text-green-400' : 
						  securityStatus.status === 'warning' ? 'text-yellow-600 dark:text-yellow-400' : 
						  'text-red-600 dark:text-red-400'}">
						{securityStatus.status}
					</div>
					<p class="text-muted-foreground mt-1 text-xs">
						{securityStatus.status === 'secure' ? 'Protected' : 'Issues detected'}
					</p>
				</CardContent>
			</Card>

			<Card class="transition-shadow hover:shadow-md">
				<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle class="text-sm font-medium">Failed Logins</CardTitle>
					<Lock class="text-muted-foreground h-4 w-4" />
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold
						{(securityMetrics?.failed_login_attempts || 0) > 10 ? 'text-red-600 dark:text-red-400' : 
						 (securityMetrics?.failed_login_attempts || 0) > 5 ? 'text-yellow-600 dark:text-yellow-400' : 
						 'text-green-600 dark:text-green-400'}">
						{securityMetrics?.failed_login_attempts || 0}
					</div>
					<p class="text-muted-foreground mt-1 text-xs">Last 24 hours</p>
				</CardContent>
			</Card>

			<Card class="transition-shadow hover:shadow-md">
				<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle class="text-sm font-medium">Blocked IPs</CardTitle>
					<Shield class="text-muted-foreground h-4 w-4" />
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold text-orange-600 dark:text-orange-400">
						{securityMetrics?.blocked_ips?.length || 0}
					</div>
					<p class="text-muted-foreground mt-1 text-xs">
						{securityMetrics?.fail2ban_status ? 'Fail2ban active' : 'Fail2ban inactive'}
					</p>
				</CardContent>
			</Card>

			<Card class="transition-shadow hover:shadow-md">
				<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle class="text-sm font-medium">Public IP</CardTitle>
					<Globe class="text-muted-foreground h-4 w-4" />
				</CardHeader>
				<CardContent>
					<div class="text-lg font-bold font-mono">
						{vpsInformation?.public_ip || 'Loading...'}
					</div>
					<p class="text-muted-foreground mt-1 text-xs">
						{vpsInformation?.region || 'Unknown region'}
					</p>
				</CardContent>
			</Card>
		</div>

		<!-- Critical Security Alerts -->
		{#if securityStatus.status !== 'secure'}
			<Card class="border-l-4 {securityStatus.color}">
				<CardContent class="pt-6">
					<div class="flex items-center gap-3">
						<svelte:component this={securityStatus.icon} class="h-5 w-5" />
						<div>
							<p class="font-medium">
								Security {securityStatus.status === 'warning' ? 'Warning' : 'Alert'}
							</p>
							<p class="text-sm opacity-90">
								{securityStatus.message}
							</p>
						</div>
					</div>
				</CardContent>
			</Card>
		{/if}

		<!-- VPS Information -->
		<Card class="transition-shadow hover:shadow-md">
			<CardHeader>
				<CardTitle class="flex items-center gap-2">
					<Server class="h-5 w-5" />
					VPS Information
				</CardTitle>
				<CardDescription>Server specifications and system details</CardDescription>
			</CardHeader>
			<CardContent class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				<div class="space-y-3">
					<div class="flex justify-between">
						<span class="text-muted-foreground">Hostname:</span>
						<span class="font-medium font-mono">{vpsInformation?.hostname || metrics?.hostname || 'Unknown'}</span>
					</div>
					<Separator />
					<div class="flex justify-between">
						<span class="text-muted-foreground">Public IP:</span>
						<span class="font-medium font-mono">{vpsInformation?.public_ip || 'Loading...'}</span>
					</div>
					<Separator />
					<div class="flex justify-between">
						<span class="text-muted-foreground">Private IP:</span>
						<span class="font-medium font-mono">{vpsInformation?.private_ip || 'Loading...'}</span>
					</div>
				</div>
				<div class="space-y-3">
					<div class="flex justify-between">
						<span class="text-muted-foreground">OS Version:</span>
						<span class="font-medium">{vpsInformation?.os_version || 'Unknown'}</span>
					</div>
					<Separator />
					<div class="flex justify-between">
						<span class="text-muted-foreground">Kernel:</span>
						<span class="font-medium font-mono">{vpsInformation?.kernel_version || 'Unknown'}</span>
					</div>
					<Separator />
					<div class="flex justify-between">
						<span class="text-muted-foreground">Packages:</span>
						<span class="font-medium">{vpsInformation?.installed_packages || 'N/A'}</span>
					</div>
				</div>
				<div class="space-y-3">
					<div class="flex justify-between">
						<span class="text-muted-foreground">Last Update:</span>
						<span class="font-medium">{vpsInformation?.last_update || 'Unknown'}</span>
					</div>
					<Separator />
					<div class="flex justify-between">
						<span class="text-muted-foreground">Disk Health:</span>
						<Badge variant={vpsInformation?.disk_health === 'healthy' ? 'default' : 'destructive'}>
							{vpsInformation?.disk_health || 'Unknown'}
						</Badge>
					</div>
					<Separator />
					<div class="flex justify-between">
						<span class="text-muted-foreground">Uptime:</span>
						<span class="font-medium">{formatUptime(metrics.uptime_seconds || 0)}</span>
					</div>
				</div>
			</CardContent>
		</Card>

		<!-- Security Services Status -->
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
			<Card class="transition-shadow hover:shadow-md">
				<CardHeader>
					<CardTitle class="flex items-center gap-2">
						<Shield class="h-5 w-5" />
						Security Services
					</CardTitle>
					<CardDescription>Firewall and protection status</CardDescription>
				</CardHeader>
				<CardContent class="space-y-4">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<div class="h-2 w-2 rounded-full {securityMetrics?.firewall_status ? 'bg-green-500' : 'bg-red-500'}"></div>
							<span>Firewall (UFW)</span>
						</div>
						<Badge variant={securityMetrics?.firewall_status ? 'default' : 'destructive'}>
							{securityMetrics?.firewall_status ? 'Active' : 'Inactive'}
						</Badge>
					</div>
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<div class="h-2 w-2 rounded-full {securityMetrics?.fail2ban_status ? 'bg-green-500' : 'bg-red-500'}"></div>
							<span>Fail2ban</span>
						</div>
						<Badge variant={securityMetrics?.fail2ban_status ? 'default' : 'destructive'}>
							{securityMetrics?.fail2ban_status ? 'Active' : 'Inactive'}
						</Badge>
					</div>
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<div class="h-2 w-2 rounded-full {databaseStatus?.postgresql ? 'bg-green-500' : 'bg-red-500'}"></div>
							<span>PostgreSQL</span>
						</div>
						<Badge variant={databaseStatus?.postgresql ? 'default' : 'destructive'}>
							{databaseStatus?.postgresql ? 'Running' : 'Stopped'}
						</Badge>
					</div>
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<div class="h-2 w-2 rounded-full {databaseStatus?.pocketbase ? 'bg-green-500' : 'bg-red-500'}"></div>
							<span>PocketBase</span>
						</div>
						<Badge variant={databaseStatus?.pocketbase ? 'default' : 'destructive'}>
							{databaseStatus?.pocketbase ? 'Running' : 'Stopped'}
						</Badge>
					</div>
				</CardContent>
			</Card>

			<Card class="transition-shadow hover:shadow-md">
				<CardHeader>
					<CardTitle class="flex items-center gap-2">
						<Network class="h-5 w-5" />
						Open Ports & Services
					</CardTitle>
					<CardDescription>Network exposure analysis</CardDescription>
				</CardHeader>
				<CardContent class="space-y-2">
					{#if securityMetrics?.open_ports && securityMetrics.open_ports.length > 0}
						{#each securityMetrics.open_ports.slice(0, 6) as port}
							<div class="flex items-center justify-between">
								<span class="font-mono">{port.port}</span>
								<Badge variant="outline">{port.service}</Badge>
							</div>
						{/each}
						{#if securityMetrics.open_ports.length > 6}
							<p class="text-muted-foreground text-sm">... and {securityMetrics.open_ports.length - 6} more</p>
						{/if}
					{:else}
						<p class="text-muted-foreground text-sm">No open ports detected</p>
					{/if}
				</CardContent>
			</Card>
		</div>

		<!-- Resource Usage Cards (Enhanced) -->
		<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
			<!-- CPU Usage -->
			<Card class="transition-shadow hover:shadow-md">
				<CardHeader>
					<CardTitle class="flex items-center gap-2">
						<Cpu class="h-5 w-5" />
						CPU Usage
					</CardTitle>
					<CardDescription>Processor utilization</CardDescription>
				</CardHeader>
				<CardContent class="space-y-4">
					<div class="text-center">
						<div
							class="text-4xl font-bold {metrics.cpu_usage > 90
								? 'text-red-600 dark:text-red-400'
								: metrics.cpu_usage > 70
									? 'text-yellow-600 dark:text-yellow-400'
									: 'text-green-600 dark:text-green-400'}"
						>
							{(metrics.cpu_usage ?? 0).toFixed(1)}%
						</div>
					</div>
					<div class="space-y-2">
						<div class="bg-secondary h-2 w-full overflow-hidden rounded-full">
							<div
								class="h-full rounded-full transition-all duration-500 {getProgressColor(
									metrics.cpu_usage ?? 0
								)}"
								style="width: {Math.min(metrics.cpu_usage ?? 0, 100)}%"
							></div>
						</div>
						<div class="text-muted-foreground text-center text-sm">
							{metrics.cpu_cores || 'N/A'} cores available
						</div>
						{#if Array.isArray(metrics.load_average)}
							<div class="text-muted-foreground text-center text-xs">
								Load: {metrics.load_average[0]?.toFixed(2)} / {metrics.load_average[1]?.toFixed(2)} / {metrics.load_average[2]?.toFixed(2)}
							</div>
						{/if}
					</div>
				</CardContent>
			</Card>

			<!-- Memory Usage -->
			<Card class="transition-shadow hover:shadow-md">
				<CardHeader>
					<CardTitle class="flex items-center gap-2">
						<MemoryStick class="h-5 w-5" />
						Memory Usage
					</CardTitle>
					<CardDescription>RAM utilization</CardDescription>
				</CardHeader>
				<CardContent class="space-y-4">
					<div class="text-center">
						<div
							class="text-4xl font-bold {metrics.memory_usage > 90
								? 'text-red-600 dark:text-red-400'
								: metrics.memory_usage > 70
									? 'text-yellow-600 dark:text-yellow-400'
									: 'text-green-600 dark:text-green-400'}"
						>
							{(metrics.memory_usage ?? 0).toFixed(1)}%
						</div>
					</div>
					<div class="space-y-2">
						<div class="bg-secondary h-2 w-full overflow-hidden rounded-full">
							<div
								class="h-full rounded-full transition-all duration-500 {getProgressColor(
									metrics.memory_usage ?? 0
								)}"
								style="width: {Math.min(metrics.memory_usage ?? 0, 100)}%"
							></div>
						</div>
						<div class="text-muted-foreground text-center text-sm">
							{formatBytes(metrics.memory_used_bytes || 0)} / {formatBytes(
								metrics.memory_total_bytes || 0
							)}
						</div>
					</div>
				</CardContent>
			</Card>

			<!-- Disk Usage -->
			<Card class="transition-shadow hover:shadow-md">
				<CardHeader>
					<CardTitle class="flex items-center gap-2">
						<HardDrive class="h-5 w-5" />
						Disk Usage
					</CardTitle>
					<CardDescription>Storage utilization</CardDescription>
				</CardHeader>
				<CardContent class="space-y-4">
					<div class="text-center">
						<div
							class="text-4xl font-bold {metrics.disk_usage > 90
								? 'text-red-600 dark:text-red-400'
								: metrics.disk_usage > 70
									? 'text-yellow-600 dark:text-yellow-400'
									: 'text-green-600 dark:text-green-400'}"
						>
							{(metrics.disk_usage ?? 0).toFixed(1)}%
						</div>
					</div>
					<div class="space-y-2">
						<div class="bg-secondary h-2 w-full overflow-hidden rounded-full">
							<div
								class="h-full rounded-full transition-all duration-500 {getProgressColor(
									metrics.disk_usage ?? 0
								)}"
								style="width: {Math.min(metrics.disk_usage ?? 0, 100)}%"
							></div>
						</div>
						<div class="text-muted-foreground text-center text-sm">
							{formatBytes(metrics.disk_used_bytes || 0)} / {formatBytes(
								metrics.disk_total_bytes || 0
							)}
						</div>
					</div>
				</CardContent>
			</Card>
		</div>

		<!-- Security Analysis & Activity -->
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
			<Card class="transition-shadow hover:shadow-md">
				<CardHeader>
					<CardTitle class="flex items-center gap-2">
						<Users class="h-5 w-5" />
						Recent Login Activity
					</CardTitle>
					<CardDescription>Recent user sessions and access</CardDescription>
				</CardHeader>
				<CardContent class="space-y-3">
					{#if securityMetrics?.recent_logins && securityMetrics.recent_logins.length > 0}
						{#each securityMetrics.recent_logins.slice(0, 5) as login}
							<div class="flex items-center justify-between">
								<div>
									<span class="font-medium">{login.user}</span>
									<span class="text-muted-foreground text-sm">from {login.ip}</span>
								</div>
								<span class="text-muted-foreground text-xs">{login.time}</span>
							</div>
						{/each}
					{:else}
						<p class="text-muted-foreground text-sm">No recent login data available</p>
					{/if}
				</CardContent>
			</Card>

			<Card class="transition-shadow hover:shadow-md">
				<CardHeader>
					<CardTitle class="flex items-center gap-2">
						<Activity class="h-5 w-5" />
						Top Processes
					</CardTitle>
					<CardDescription>High resource usage processes</CardDescription>
				</CardHeader>
				<CardContent class="space-y-3">
					{#if topProcesses && topProcesses.length > 0}
						{#each topProcesses.slice(0, 5) as process}
							<div class="flex items-center justify-between">
								<div>
									<span class="font-medium font-mono text-sm">{process.command.split(' ')[0]}</span>
									<span class="text-muted-foreground text-xs">PID: {process.pid}</span>
								</div>
								<div class="text-right">
									<div class="text-sm font-medium">{process.cpu.toFixed(1)}% CPU</div>
									<div class="text-xs text-muted-foreground">{process.memory.toFixed(1)}% MEM</div>
								</div>
							</div>
						{/each}
					{:else}
						<p class="text-muted-foreground text-sm">No process data available</p>
					{/if}
				</CardContent>
			</Card>
		</div>

		<!-- Docker Containers & Applications -->
		{#if containers && containers.length > 0}
			<Card class="transition-shadow hover:shadow-md">
				<CardHeader>
					<CardTitle class="flex items-center gap-2">
						<Database class="h-5 w-5" />
						Active Containers
					</CardTitle>
					<CardDescription>Running applications and services</CardDescription>
				</CardHeader>
				<CardContent>
					<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
						{#each containers as container}
							<div class="p-3 border rounded-lg">
								<div class="flex items-center justify-between mb-2">
									<span class="font-medium">{container.name}</span>
									<Badge variant={container.status.includes('Up') ? 'default' : 'destructive'}>
										{container.status.includes('Up') ? 'Running' : 'Stopped'}
									</Badge>
								</div>
								<p class="text-muted-foreground text-sm">{container.ports || 'No ports exposed'}</p>
							</div>
						{/each}
					</div>
				</CardContent>
			</Card>
		{/if}

		<!-- Network Interfaces -->
		{#if vpsInformation?.network_interfaces && vpsInformation.network_interfaces.length > 0}
			<Card class="transition-shadow hover:shadow-md">
				<CardHeader>
					<CardTitle class="flex items-center gap-2">
						<Wifi class="h-5 w-5" />
						Network Interfaces
					</CardTitle>
					<CardDescription>Network configuration and connectivity</CardDescription>
				</CardHeader>
				<CardContent>
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						{#each vpsInformation.network_interfaces as iface}
							<div class="flex items-center justify-between">
								<div>
									<span class="font-medium font-mono">{iface.name}</span>
									<span class="text-muted-foreground text-sm ml-2">{iface.ip}</span>
								</div>
								<Badge variant={iface.status === 'up' ? 'default' : 'destructive'}>
									{iface.status}
								</Badge>
							</div>
						{/each}
					</div>
				</CardContent>
			</Card>
		{/if}

		<!-- System Logs Preview -->
		{#if recentLogs}
			<Card class="transition-shadow hover:shadow-md">
				<CardHeader>
					<CardTitle class="flex items-center gap-2">
						<Terminal class="h-5 w-5" />
						Recent System Logs
					</CardTitle>
					<CardDescription>Latest system events and messages</CardDescription>
				</CardHeader>
				<CardContent>
					<div class="bg-muted p-4 rounded-lg">
						<pre class="text-sm font-mono whitespace-pre-wrap overflow-x-auto max-h-64 overflow-y-auto">{recentLogs}</pre>
					</div>
				</CardContent>
			</Card>
		{/if}
	{/if}
</div>
