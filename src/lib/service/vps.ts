import { db } from '../server/database.js';
import { BaseService } from './database.js';
import type { ServiceResponse, VPSMetrics, VPSInfo, ContainerInfo } from './types.js';

/**
 * VPS service for monitoring and managing the server
 */
export class VPSService extends BaseService {
	/**
	 * Get current VPS metrics
	 */
	async getMetrics(): Promise<ServiceResponse<VPSMetrics>> {
		try {
			const { exec } = await import('child_process');
			const { promisify } = await import('util');
			const execAsync = promisify(exec);

			// Get CPU usage
			const cpuResult = await execAsync(
				"top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | cut -d'%' -f1"
			);
			const cpuUsage = parseFloat(cpuResult.stdout.trim()) || 0;

			// Get memory usage
			const memResult = await execAsync('free | grep Mem | awk \'{printf "%.2f", $3/$2 * 100.0}\'');
			const memoryUsage = parseFloat(memResult.stdout.trim()) || 0;

			// Get disk usage
			const diskResult = await execAsync(
				"df -h / | awk 'NR==2{printf \"%.2f\", $5}' | sed 's/%//'"
			);
			const diskUsage = parseFloat(diskResult.stdout.trim()) || 0;

			// Get network stats
			const netResult = await execAsync(
				"cat /proc/net/dev | grep -E 'eth0|ens|enp' | head -1 | awk '{print $2, $10}'"
			);
			const netStats = netResult.stdout.trim().split(' ');
			const networkIn = parseInt(netStats[0]) || 0;
			const networkOut = parseInt(netStats[1]) || 0;

			// Get uptime
			const uptimeResult = await execAsync("cat /proc/uptime | awk '{print $1}'");
			const uptime = parseFloat(uptimeResult.stdout.trim()) || 0;

			const metrics: VPSMetrics = {
				cpu_usage: cpuUsage,
				memory_usage: memoryUsage,
				disk_usage: diskUsage,
				network_in: networkIn,
				network_out: networkOut,
				uptime: uptime,
				recorded_at: new Date()
			};

			// Store metrics in database
			await this.storeMetrics(metrics);

			return this.createResponse(true, metrics);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Get VPS information
	 */
	async getVPSInfo(): Promise<ServiceResponse<VPSInfo>> {
		try {
			const { exec } = await import('child_process');
			const { promisify } = await import('util');
			const execAsync = promisify(exec);

			// Get hostname
			const hostnameResult = await execAsync('hostname');
			const hostname = hostnameResult.stdout.trim();

			// Get IP address
			const ipResult = await execAsync("curl -s ifconfig.me || hostname -I | awk '{print $1}'");
			const ipAddress = ipResult.stdout.trim();

			// Get OS info
			const osResult = await execAsync(
				'lsb_release -d 2>/dev/null | cut -f2 || cat /etc/os-release | grep PRETTY_NAME | cut -d"=" -f2 | tr -d \'"\''
			);
			const os = osResult.stdout.trim();

			// Get kernel version
			const kernelResult = await execAsync('uname -r');
			const kernelVersion = kernelResult.stdout.trim();

			// Get total memory (in MB)
			const memResult = await execAsync("free -m | grep Mem | awk '{print $2}'");
			const totalMemory = parseInt(memResult.stdout.trim()) || 0;

			// Get total disk (in GB)
			const diskResult = await execAsync("df -BG / | awk 'NR==2{print $2}' | sed 's/G//'");
			const totalDisk = parseInt(diskResult.stdout.trim()) || 0;

			// Get Docker version
			let dockerVersion: string | undefined;
			try {
				const dockerResult = await execAsync('docker --version');
				dockerVersion = dockerResult.stdout.trim();
			} catch {
				dockerVersion = undefined;
			}

			// Get Nginx version
			let nginxVersion: string | undefined;
			try {
				const nginxResult = await execAsync('nginx -v 2>&1');
				nginxVersion = nginxResult.stderr.trim();
			} catch {
				nginxVersion = undefined;
			}

			const vpsInfo: VPSInfo = {
				hostname,
				ip_address: ipAddress,
				os,
				kernel_version: kernelVersion,
				total_memory: totalMemory,
				total_disk: totalDisk,
				docker_version: dockerVersion,
				nginx_version: nginxVersion
			};

			return this.createResponse(true, vpsInfo);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Get Docker containers
	 */
	async getContainers(): Promise<ServiceResponse<ContainerInfo[]>> {
		try {
			const { exec } = await import('child_process');
			const { promisify } = await import('util');
			const execAsync = promisify(exec);

			// Get container list
			const result = await execAsync(
				'docker ps -a --format "table {{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.CreatedAt}}\t{{.Ports}}"'
			);
			const lines = result.stdout.trim().split('\n');

			if (lines.length <= 1) {
				return this.createResponse(true, []);
			}

			const containers: ContainerInfo[] = [];

			for (let i = 1; i < lines.length; i++) {
				const parts = lines[i].split('\t');
				if (parts.length >= 6) {
					const [id, name, image, status, createdAt, ports] = parts;

					// Parse ports
					const portMappings = this.parsePorts(ports);

					containers.push({
						id: id.trim(),
						name: name.trim(),
						image: image.trim(),
						status: status.trim(),
						created: new Date(createdAt.trim()),
						ports: portMappings
					});
				}
			}

			// Get stats for running containers
			for (const container of containers) {
				if (container.status.startsWith('Up')) {
					try {
						const statsResult = await execAsync(
							`docker stats ${container.id} --no-stream --format "{{.CPUPerc}}\t{{.MemPerc}}"`
						);
						const [cpu, mem] = statsResult.stdout.trim().split('\t');
						container.cpu_usage = parseFloat(cpu.replace('%', ''));
						container.memory_usage = parseFloat(mem.replace('%', ''));
					} catch {
						// Skip if stats not available
					}
				}
			}

			return this.createResponse(true, containers);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Get firewall status and rules
	 */
	async getFirewallStatus(): Promise<ServiceResponse<{ enabled: boolean; rules: any[] }>> {
		try {
			const { exec } = await import('child_process');
			const { promisify } = await import('util');
			const execAsync = promisify(exec);

			// Check if UFW is enabled
			let enabled = false;
			let rules: any[] = [];

			try {
				const statusResult = await execAsync('sudo ufw status');
				enabled = statusResult.stdout.includes('Status: active');

				if (enabled) {
					const rulesResult = await execAsync('sudo ufw status numbered');
					const lines = rulesResult.stdout.split('\n');

					for (const line of lines) {
						if (line.includes('ALLOW') || line.includes('DENY')) {
							const match = line.match(/\[\s*(\d+)\]\s+(.+?)\s+(ALLOW|DENY)\s+(.+)/);
							if (match) {
								rules.push({
									number: parseInt(match[1]),
									to: match[2].trim(),
									action: match[3],
									from: match[4].trim()
								});
							}
						}
					}
				}
			} catch (error) {
				// UFW might not be installed or accessible
				console.warn('UFW not available:', error);
			}

			return this.createResponse(true, { enabled, rules });
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Get system processes
	 */
	async getProcesses(limit = 20): Promise<ServiceResponse<any[]>> {
		try {
			const { exec } = await import('child_process');
			const { promisify } = await import('util');
			const execAsync = promisify(exec);

			const result = await execAsync(`ps aux --sort=-%cpu | head -${limit + 1}`);
			const lines = result.stdout.trim().split('\n');

			if (lines.length <= 1) {
				return this.createResponse(true, []);
			}

			const processes = [];
			for (let i = 1; i < lines.length; i++) {
				const parts = lines[i].trim().split(/\s+/);
				if (parts.length >= 11) {
					processes.push({
						user: parts[0],
						pid: parseInt(parts[1]),
						cpu: parseFloat(parts[2]),
						memory: parseFloat(parts[3]),
						vsz: parseInt(parts[4]),
						rss: parseInt(parts[5]),
						tty: parts[6],
						stat: parts[7],
						start: parts[8],
						time: parts[9],
						command: parts.slice(10).join(' ')
					});
				}
			}

			return this.createResponse(true, processes);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Get disk usage details
	 */
	async getDiskUsage(): Promise<ServiceResponse<any[]>> {
		try {
			const { exec } = await import('child_process');
			const { promisify } = await import('util');
			const execAsync = promisify(exec);

			const result = await execAsync('df -h');
			const lines = result.stdout.trim().split('\n');

			if (lines.length <= 1) {
				return this.createResponse(true, []);
			}

			const diskUsage = [];
			for (let i = 1; i < lines.length; i++) {
				const parts = lines[i].trim().split(/\s+/);
				if (parts.length >= 6) {
					diskUsage.push({
						filesystem: parts[0],
						size: parts[1],
						used: parts[2],
						available: parts[3],
						use_percent: parts[4],
						mounted_on: parts[5]
					});
				}
			}

			return this.createResponse(true, diskUsage);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Get historical metrics
	 */
	async getHistoricalMetrics(hours = 24): Promise<ServiceResponse<VPSMetrics[]>> {
		try {
			// Define type for database result
			type VPSMetricRow = {
				cpu_usage: string | number;
				memory_usage: string | number;
				disk_usage: string | number;
				network_in: string | number;
				network_out: string | number;
				uptime: string | number;
				recorded_at: string | Date;
			};

			const metricsData = (await this.executeQuery(
				db`
                    SELECT cpu_usage, memory_usage, disk_usage, network_in, network_out, uptime, recorded_at
                    FROM vps_metrics 
                    WHERE recorded_at > NOW() - INTERVAL '${hours} hours'
                    ORDER BY recorded_at DESC
                `
			)) as VPSMetricRow[];

			// Map the raw data to ensure it conforms to VPSMetrics interface
			const metrics: VPSMetrics[] = metricsData.map((item) => ({
				cpu_usage: Number(item.cpu_usage),
				memory_usage: Number(item.memory_usage),
				disk_usage: Number(item.disk_usage),
				network_in: Number(item.network_in),
				network_out: Number(item.network_out),
				uptime: Number(item.uptime),
				recorded_at: new Date(item.recorded_at)
			}));

			return this.createResponse(true, metrics);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Restart a system service
	 */
	async restartService(serviceName: string): Promise<ServiceResponse> {
		try {
			// Only allow specific safe services
			const allowedServices = ['nginx', 'docker', 'postgresql'];
			if (!allowedServices.includes(serviceName)) {
				return this.createResponse(false, undefined, 'Service not allowed');
			}

			const { exec } = await import('child_process');
			const { promisify } = await import('util');
			const execAsync = promisify(exec);

			await execAsync(`sudo systemctl restart ${serviceName}`);

			await this.logOperation('info', 'service_restarted', { service: serviceName });

			return this.createResponse(
				true,
				undefined,
				undefined,
				`${serviceName} restarted successfully`
			);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Get service status
	 */
	async getServiceStatus(
		serviceName: string
	): Promise<ServiceResponse<{ active: boolean; status: string }>> {
		try {
			const { exec } = await import('child_process');
			const { promisify } = await import('util');
			const execAsync = promisify(exec);

			const result = await execAsync(`systemctl is-active ${serviceName}`);
			const isActive = result.stdout.trim() === 'active';

			const statusResult = await execAsync(`systemctl status ${serviceName} --no-pager -l`);

			return this.createResponse(true, {
				active: isActive,
				status: statusResult.stdout.trim()
			});
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			return this.createResponse(true, {
				active: false,
				status: `Error: ${errorMessage}`
			});
		}
	}

	/**
	 * Clean up system resources
	 */
	async cleanupSystem(): Promise<ServiceResponse<{ cleaned: string[] }>> {
		try {
			const { exec } = await import('child_process');
			const { promisify } = await import('util');
			const execAsync = promisify(exec);

			const cleaned: string[] = [];

			// Clean Docker system
			try {
				await execAsync('docker system prune -f');
				cleaned.push('Docker unused containers and images');
			} catch (error) {
				console.warn('Docker cleanup failed:', error);
			}

			// Clean package cache
			try {
				await execAsync('sudo apt-get autoremove -y && sudo apt-get autoclean');
				cleaned.push('Package cache and unused packages');
			} catch (error) {
				console.warn('Package cleanup failed:', error);
			}

			// Clean old logs (older than 30 days)
			try {
				await execAsync('sudo journalctl --vacuum-time=30d');
				cleaned.push('System logs older than 30 days');
			} catch (error) {
				console.warn('Log cleanup failed:', error);
			}

			await this.logOperation('info', 'system_cleanup_performed', { cleaned });

			return this.createResponse(true, { cleaned }, undefined, 'System cleanup completed');
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Store metrics in database
	 */
	private async storeMetrics(metrics: VPSMetrics): Promise<void> {
		try {
			await this.executeQuery(
				db`
                    INSERT INTO vps_metrics (
                        cpu_usage, memory_usage, disk_usage, network_in, network_out, uptime
                    )
                    VALUES (
                        ${metrics.cpu_usage}, ${metrics.memory_usage}, ${metrics.disk_usage},
                        ${metrics.network_in}, ${metrics.network_out}, ${metrics.uptime}
                    )
                `
			);
		} catch (error) {
			console.error('Failed to store metrics:', error);
		}
	}

	/**
	 * Parse Docker port mappings
	 */
	private parsePorts(
		portsString: string
	): Array<{ container_port: number; host_port: number; protocol: 'tcp' | 'udp' }> {
		const ports: { container_port: number; host_port: number; protocol: 'tcp' | 'udp' }[] = [];

		if (!portsString || portsString === '') {
			return ports;
		}

		// Parse port mappings like "0.0.0.0:3000->3000/tcp"
		const portMappings = portsString.split(', ');

		for (const mapping of portMappings) {
			const match = mapping.match(/(\d+\.\d+\.\d+\.\d+:)?(\d+)->(\d+)\/(tcp|udp)/);
			if (match) {
				ports.push({
					host_port: parseInt(match[2]),
					container_port: parseInt(match[3]),
					protocol: match[4] as 'tcp' | 'udp'
				});
			}
		}

		return ports;
	}
}

export const vpsService = new VPSService();
