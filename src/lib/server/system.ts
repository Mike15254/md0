import { exec } from 'child_process';
import { promisify } from 'util';
import { dbUtils } from './database.js';

const execAsync = promisify(exec);

interface SystemMetrics {
    cpu_usage: number;
    memory_usage: number;
    disk_usage: number;
    active_projects: number;
    uptime_seconds: number;
    // Enhanced security metrics
    cpu_cores?: number;
    memory_used_bytes?: number;
    memory_total_bytes?: number;
    disk_used_bytes?: number;
    disk_total_bytes?: number;
    hostname?: string;
    boot_time?: number;
    process_count?: number;
    load_average?: number[];
    network_connections?: number;
    failed_login_attempts?: number;
}

interface SecurityMetrics {
    firewall_status: boolean;
    fail2ban_status: boolean;
    blocked_ips: string[];
    failed_login_attempts: number;
    open_ports: Array<{port: number, service: string}>;
    suspicious_processes: Array<{pid: number, name: string, cpu: number}>;
    recent_logins: Array<{user: string, ip: string, time: string}>;
    ssl_certificates: Array<{domain: string, expires: string, valid: boolean}>;
}

interface VPSInformation {
    hostname: string;
    public_ip: string;
    private_ip: string;
    region: string;
    os_version: string;
    kernel_version: string;
    installed_packages: number;
    last_update: string;
    disk_health: string;
    network_interfaces: Array<{name: string, ip: string, status: string}>;
}

export const systemService = {
    // Helper function to determine if we're in development mode
    isDevelopmentMode(): boolean {
        return process.env.NODE_ENV === 'development';
    },

    // Helper function to execute commands locally
    async execCommand(command: string): Promise<{ stdout: string; stderr: string; code: number }> {
        try {
            const { stdout, stderr } = await execAsync(command);
            return { stdout, stderr, code: 0 };
        } catch (error: any) {
            return { 
                stdout: error.stdout || '', 
                stderr: error.stderr || error.message, 
                code: error.code || 1 
            };
        }
    },

    // Development mode functions to provide mock data
    getMockSystemMetrics(): SystemMetrics {
        return {
            cpu_usage: Math.random() * 30 + 10, // 10-40%
            memory_usage: Math.random() * 40 + 30, // 30-70%
            disk_usage: Math.random() * 20 + 15, // 15-35%
            active_projects: 3,
            uptime_seconds: 86400 * 7, // 7 days
            cpu_cores: 4,
            memory_used_bytes: 4 * 1024 * 1024 * 1024, // 4GB
            memory_total_bytes: 8 * 1024 * 1024 * 1024, // 8GB
            disk_used_bytes: 50 * 1024 * 1024 * 1024, // 50GB
            disk_total_bytes: 200 * 1024 * 1024 * 1024, // 200GB
            hostname: 'md0-development',
            boot_time: Math.floor(Date.now() / 1000) - 86400 * 7,
            process_count: 156,
            load_average: [0.5, 0.7, 0.9],
            network_connections: 45,
            failed_login_attempts: 2
        };
    },

    getMockSecurityMetrics(): SecurityMetrics {
        return {
            firewall_status: true,
            fail2ban_status: true,
            blocked_ips: ['192.168.1.100', '10.0.0.1'],
            failed_login_attempts: 2,
            open_ports: [
                { port: 22, service: 'SSH' },
                { port: 80, service: 'HTTP' },
                { port: 443, service: 'HTTPS' },
                { port: 5432, service: 'PostgreSQL' }
            ],
            suspicious_processes: [],
            recent_logins: [
                { user: 'mike', ip: '192.168.1.1', time: 'Mon Dec  9 10:30:00 2024' },
                { user: 'root', ip: '127.0.0.1', time: 'Mon Dec  9 09:15:00 2024' }
            ],
            ssl_certificates: [
                { domain: 'example.com', expires: '2025-06-01', valid: true }
            ]
        };
    },

    getMockVPSInformation(): VPSInformation {
        return {
            hostname: 'md0-development',
            public_ip: '203.0.113.1',
            private_ip: '10.0.0.1',
            region: 'Development',
            os_version: 'Ubuntu 22.04.3 LTS',
            kernel_version: '5.15.0-91-generic',
            installed_packages: 1547,
            last_update: '2024-12-08',
            disk_health: 'healthy',
            network_interfaces: [
                { name: 'eth0', ip: '10.0.0.1', status: 'up' },
                { name: 'lo', ip: '127.0.0.1', status: 'up' }
            ]
        };
    },

    // Register this monitoring app as a project in the database
    async registerSelfAsProject(): Promise<void> {
        try {
            // Check if the monitoring project already exists
            const existingProject = await dbUtils.findProjectByName('md0-monitoring');
            
            if (!existingProject) {
                const hostname = await this.getHostname();
                const projectData = {
                    name: 'md0-monitoring',
                    description: 'MD0 VPS Monitoring Dashboard - System monitoring and security dashboard for the VPS',
                    github_url: 'https://github.com/mikemax/md0-monitoring',
                    domain: `http://${hostname}:4173`, // Preview mode port
                    status: 'running',
                    tech_stack: ['SvelteKit', 'TypeScript', 'PostgreSQL', 'Docker'],
                    created_at: new Date(),
                    updated_at: new Date()
                };

                await dbUtils.createProject(projectData);
                console.log('Monitoring app registered as project successfully');
            }
        } catch (error) {
            console.error('Failed to register monitoring app as project:', error);
        }
    },

    async getHostname(): Promise<string> {
        try {
            const result = await this.execCommand('hostname');
            return result.stdout.trim() || 'localhost';
        } catch (error) {
            return 'localhost';
        }
    },

    async getSystemMetrics(): Promise<SystemMetrics | null> {
        try {
            // Return mock data in development mode
            if (this.isDevelopmentMode()) {
                return this.getMockSystemMetrics();
            }

            // Get CPU usage
            const cpuResult = await this.execCommand(
                "top -bn1 | grep 'Cpu(s)' | sed 's/.*, *\\([0-9.]*\\)%* id.*/\\1/' | awk '{print 100 - $1}'"
            );
            const cpuUsage = parseFloat(cpuResult.stdout.trim()) || 0;

            // Get memory usage
            const memResult = await this.execCommand(
                "free | grep Mem | awk '{printf \"%.2f\", $3/$2 * 100.0}'"
            );
            const memoryUsage = parseFloat(memResult.stdout.trim()) || 0;

            // Get disk usage
            const diskResult = await this.execCommand(
                "df -h / | awk 'NR==2{printf \"%.2f\", $5}' | sed 's/%//'"
            );
            const diskUsage = parseFloat(diskResult.stdout.trim()) || 0;

            // Get uptime in seconds
            const uptimeResult = await this.execCommand("cat /proc/uptime | awk '{print $1}'");
            const uptimeSeconds = Math.floor(parseFloat(uptimeResult.stdout.trim()) || 0);

            // Count active Docker containers (our projects)
            const containerResult = await this.execCommand(
                "docker ps --filter 'name=md0-' --format '{{.Names}}' | wc -l"
            );
            const activeProjects = parseInt(containerResult.stdout.trim()) || 0;

            // Get additional metrics in parallel
            const [cpuCoresResult, memoryUsedResult, memoryTotalResult, diskUsedResult, diskTotalResult, hostnameResult, bootTimeResult, processCountResult, loadAverageResult, networkConnectionsResult, failedLoginAttemptsResult] = await Promise.all([
                this.execCommand("nproc"),
                this.execCommand("free | grep Mem | awk '{print $3}'"),
                this.execCommand("free | grep Mem | awk '{print $2}'"),
                this.execCommand("df / | grep / | awk '{ print $3 }'"),
                this.execCommand("df / | grep / | awk '{ print $2 }'"),
                this.execCommand("hostname"),
                this.execCommand("stat -c %Y /proc/1"),
                this.execCommand("ps aux | wc -l"),
                this.execCommand("cat /proc/loadavg | awk '{print $1, $2, $3}'"),
                this.execCommand("ss -tuln | wc -l"),
                this.execCommand("grep 'Failed password' /var/log/auth.log 2>/dev/null | wc -l || echo '0'")
            ]);

            const metrics: SystemMetrics = {
                cpu_usage: cpuUsage,
                memory_usage: memoryUsage,
                disk_usage: diskUsage,
                active_projects: activeProjects,
                uptime_seconds: uptimeSeconds,
                cpu_cores: parseInt(cpuCoresResult.stdout.trim()) || 0,
                memory_used_bytes: parseInt(memoryUsedResult.stdout.trim()) || 0,
                memory_total_bytes: parseInt(memoryTotalResult.stdout.trim()) || 0,
                disk_used_bytes: parseInt(diskUsedResult.stdout.trim()) || 0,
                disk_total_bytes: parseInt(diskTotalResult.stdout.trim()) || 0,
                hostname: hostnameResult.stdout.trim() || '',
                boot_time: parseInt(bootTimeResult.stdout.trim()) || 0,
                process_count: parseInt(processCountResult.stdout.trim()) || 0,
                load_average: loadAverageResult.stdout.trim().split(' ').map(Number),
                network_connections: parseInt(networkConnectionsResult.stdout.trim()) || 0,
                failed_login_attempts: parseInt(failedLoginAttemptsResult.stdout.trim()) || 0
            };

            // Store metrics in database
            await dbUtils.recordSystemMetrics(metrics);

            return metrics;
        } catch (error) {
            console.error('Failed to get system metrics:', error);
            return this.isDevelopmentMode() ? this.getMockSystemMetrics() : null;
        }
    },

    async getEnhancedSystemMetrics(): Promise<SystemMetrics | null> {
        try {
            // Return mock data in development mode
            if (this.isDevelopmentMode()) {
                return this.getMockSystemMetrics();
            }

            // Get basic metrics first
            const basicMetrics = await this.getSystemMetrics();
            return basicMetrics; // getSystemMetrics already includes enhanced metrics
        } catch (error) {
            console.error('Failed to get enhanced system metrics:', error);
            return this.isDevelopmentMode() ? this.getMockSystemMetrics() : null;
        }
    },

    async getDockerContainers() {
        try {
            // Return mock data in development mode
            if (this.isDevelopmentMode()) {
                return [
                    { name: 'project1', status: 'Up 2 hours', ports: '0.0.0.0:3000->3000/tcp' },
                    { name: 'project2', status: 'Up 1 day', ports: '0.0.0.0:3001->3000/tcp' },
                    { name: 'monitoring', status: 'Up 5 hours', ports: '0.0.0.0:4173->4173/tcp' }
                ];
            }

            const result = await this.execCommand(
                "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
            );

            if (result.code !== 0) return [];

            const lines = result.stdout.trim().split('\n');
            if (lines.length <= 1) return []; // Only header or no containers

            return lines.slice(1).map(line => {
                const [name, status, ports] = line.split('\t');
                return {
                    name: name?.replace('md0-', '') || '',
                    status: status || 'unknown',
                    ports: ports || ''
                };
            });
        } catch (error) {
            console.error('Failed to get Docker containers:', error);
            return [];
        }
    },

    async getDatabaseStatus() {
        try {
            // Return mock data in development mode
            if (this.isDevelopmentMode()) {
                return { postgresql: true, pocketbase: false };
            }

            // Check PostgreSQL
            const pgResult = await this.execCommand('systemctl is-active postgresql 2>/dev/null || echo "inactive"');
            const postgresqlActive = pgResult.stdout.trim() === 'active';

            // Check PocketBase containers
            const pbResult = await this.execCommand(
                "docker ps --filter 'name=pocketbase' --format '{{.Names}}' | wc -l"
            );
            const pocketbaseActive = parseInt(pbResult.stdout.trim()) > 0;

            return {
                postgresql: postgresqlActive,
                pocketbase: pocketbaseActive
            };
        } catch (error) {
            console.error('Failed to get database status:', error);
            return { postgresql: false, pocketbase: false };
        }
    },

    async startDatabase(type: 'postgresql' | 'pocketbase'): Promise<boolean> {
        try {
            if (this.isDevelopmentMode()) {
                console.log(`Mock: Starting ${type}`);
                return true;
            }

            if (type === 'postgresql') {
                const result = await this.execCommand('sudo systemctl start postgresql');
                return result.code === 0;
            } else if (type === 'pocketbase') {
                // Start PocketBase in Docker
                const result = await this.execCommand(
                    'docker run -d --name pocketbase -p 8090:8090 -v /var/pocketbase:/pb_data spectado/pocketbase:latest'
                );
                return result.code === 0;
            }

            return false;
        } catch (error) {
            console.error(`Failed to start ${type}:`, error);
            return false;
        }
    },

    async stopDatabase(type: 'postgresql' | 'pocketbase'): Promise<boolean> {
        try {
            if (this.isDevelopmentMode()) {
                console.log(`Mock: Stopping ${type}`);
                return true;
            }

            if (type === 'postgresql') {
                const result = await this.execCommand('sudo systemctl stop postgresql');
                return result.code === 0;
            } else if (type === 'pocketbase') {
                await this.execCommand('docker stop pocketbase || true');
                await this.execCommand('docker rm pocketbase || true');
                return true;
            }

            return false;
        } catch (error) {
            console.error(`Failed to stop ${type}:`, error);
            return false;
        }
    },

    async getSystemLogs(lines = 100): Promise<string> {
        try {
            if (this.isDevelopmentMode()) {
                return 'Mock system logs for development mode...';
            }

            const result = await this.execCommand(`journalctl -n ${lines} --no-pager`);
            return result.stdout || 'No logs available';
        } catch (error) {
            console.error('Failed to get system logs:', error);
            return 'Error retrieving logs';
        }
    },

    async getProcesses() {
        try {
            if (this.isDevelopmentMode()) {
                return [
                    { pid: 1234, cpu: 12.5, memory: 8.3, command: 'node server.js' },
                    { pid: 5678, cpu: 8.1, memory: 15.2, command: 'postgres' },
                    { pid: 9012, cpu: 5.3, memory: 4.7, command: 'docker' }
                ];
            }

            const result = await this.execCommand(
                "ps aux --sort=-%cpu | head -20 | awk 'NR>1 {printf \"%s,%s,%s,%s\\n\", $2, $3, $4, $11}'"
            );

            if (result.code !== 0) return [];

            return result.stdout.trim().split('\n').map(line => {
                const [pid, cpu, memory, command] = line.split(',');
                return {
                    pid: parseInt(pid) || 0,
                    cpu: parseFloat(cpu) || 0,
                    memory: parseFloat(memory) || 0,
                    command: command || ''
                };
            });
        } catch (error) {
            console.error('Failed to get processes:', error);
            return [];
        }
    },

    async createPostgresDatabase(dbName: string, username: string, password: string): Promise<boolean> {
        try {
            if (this.isDevelopmentMode()) {
                console.log(`Mock: Creating database ${dbName} for user ${username}`);
                return true;
            }

            // Create database
            const createDbResult = await this.execCommand(
                `sudo -u postgres createdb ${dbName}`
            );

            // Create user and grant privileges
            const createUserResult = await this.execCommand(
                `sudo -u postgres psql -c "CREATE USER ${username} WITH PASSWORD '${password}'; GRANT ALL PRIVILEGES ON DATABASE ${dbName} TO ${username};"`
            );

            return createDbResult.code === 0 && createUserResult.code === 0;
        } catch (error) {
            console.error('Failed to create PostgreSQL database:', error);
            return false;
        }
    },

    async backupDatabase(dbName: string): Promise<string | null> {
        try {
            if (this.isDevelopmentMode()) {
                return '/mock/backup/path.sql';
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = `/var/backups/md0_${dbName}_${timestamp}.sql`;

            const result = await this.execCommand(
                `sudo -u postgres pg_dump ${dbName} > ${backupPath}`
            );

            if (result.code === 0) {
                return backupPath;
            }
            return null;
        } catch (error) {
            console.error('Failed to backup database:', error);
            return null;
        }
    },

    // Helper function to get service name from port
    getServiceName(port: number): string {
        const services: { [key: number]: string } = {
            22: 'SSH',
            25: 'SMTP',
            53: 'DNS',
            80: 'HTTP',
            110: 'POP3',
            143: 'IMAP',
            443: 'HTTPS',
            993: 'IMAPS',
            995: 'POP3S',
            3306: 'MySQL',
            5432: 'PostgreSQL',
            6379: 'Redis',
            8080: 'HTTP-ALT',
            8443: 'HTTPS-ALT'
        };
        return services[port] || 'Unknown';
    },

    // Enhanced security metrics function
    async getSecurityMetrics(): Promise<SecurityMetrics | null> {
        try {
            // Return mock data in development mode
            if (this.isDevelopmentMode()) {
                return this.getMockSecurityMetrics();
            }

            // Get firewall status
            const firewallResult = await this.execCommand("sudo ufw status | grep -q 'Status: active' && echo 'true' || echo 'false'");
            const firewall_status = firewallResult.stdout.trim() === 'true';

            // Get fail2ban status
            const fail2banResult = await this.execCommand("sudo systemctl is-active fail2ban 2>/dev/null | grep -q 'active' && echo 'true' || echo 'false'");
            const fail2ban_status = fail2banResult.stdout.trim() === 'true';

            // Get blocked IPs from fail2ban
            const blockedIpsResult = await this.execCommand("sudo fail2ban-client status sshd 2>/dev/null | grep 'Banned IP list:' | cut -d: -f2 | tr -d ' ' || echo ''");
            const blocked_ips = blockedIpsResult.stdout.trim() ? blockedIpsResult.stdout.trim().split(',') : [];

            // Get failed login attempts
            const failedLoginsResult = await this.execCommand("grep 'Failed password' /var/log/auth.log 2>/dev/null | tail -100 | wc -l || echo '0'");
            const failed_login_attempts = parseInt(failedLoginsResult.stdout.trim()) || 0;

            // Get open ports
            const openPortsResult = await this.execCommand("ss -tuln | grep LISTEN | awk '{print $5}' | sed 's/.*://' | sort -nu");
            const portNumbers = openPortsResult.stdout.trim().split('\n').filter(p => p && !isNaN(parseInt(p)));
            const open_ports = portNumbers.map(port => ({
                port: parseInt(port),
                service: this.getServiceName(parseInt(port))
            }));

            // Get suspicious processes (high CPU usage)
            const suspiciousProcessesResult = await this.execCommand("ps aux --sort=-%cpu | head -10 | awk 'NR>1 && $3>50 {printf \"%s,%s,%s\\n\", $2, $11, $3}'");
            const suspicious_processes = suspiciousProcessesResult.stdout.trim() ? 
                suspiciousProcessesResult.stdout.trim().split('\n').map(line => {
                    const [pid, name, cpu] = line.split(',');
                    return {
                        pid: parseInt(pid) || 0,
                        name: name || '',
                        cpu: parseFloat(cpu) || 0
                    };
                }) : [];

            // Get recent logins
            const recentLoginsResult = await this.execCommand("last -n 10 | head -10 | awk '$1 != \"reboot\" && $1 != \"wtmp\" && NF >= 10 {printf \"%s,%s,%s %s %s %s\\n\", $1, $3, $4, $5, $6, $7}'");
            const recent_logins = recentLoginsResult.stdout.trim() ? 
                recentLoginsResult.stdout.trim().split('\n').map(line => {
                    const parts = line.split(',');
                    return {
                        user: parts[0] || '',
                        ip: parts[1] || '',
                        time: parts[2] || ''
                    };
                }) : [];

            // Get SSL certificates (basic check for common cert paths)
            const sslCertsResult = await this.execCommand("find /etc/ssl/certs /etc/letsencrypt/live -name '*.pem' -o -name '*.crt' 2>/dev/null | head -5 || echo ''");
            const ssl_certificates = sslCertsResult.stdout.trim() ? 
                sslCertsResult.stdout.trim().split('\n').map(cert => ({
                    domain: cert.split('/').pop()?.replace(/\.(pem|crt)$/, '') || 'unknown',
                    expires: 'Unknown',
                    valid: true
                })) : [];

            return {
                firewall_status,
                fail2ban_status,
                blocked_ips,
                failed_login_attempts,
                open_ports,
                suspicious_processes,
                recent_logins,
                ssl_certificates
            };
        } catch (error) {
            console.error('Failed to get security metrics:', error);
            return this.getMockSecurityMetrics();
        }
    },

    // VPS information function
    async getVPSInformation(): Promise<VPSInformation | null> {
        try {
            // Return mock data in development mode
            if (this.isDevelopmentMode()) {
                return this.getMockVPSInformation();
            }

            // Get hostname
            const hostnameResult = await this.execCommand("hostname");
            const hostname = hostnameResult.stdout.trim();

            // Get public IP
            const publicIpResult = await this.execCommand("curl -s ifconfig.me || curl -s icanhazip.com || echo 'Unknown'");
            const public_ip = publicIpResult.stdout.trim();

            // Get private IP
            const privateIpResult = await this.execCommand("hostname -I | awk '{print $1}'");
            const private_ip = privateIpResult.stdout.trim();

            // Get OS version
            const osVersionResult = await this.execCommand("lsb_release -d 2>/dev/null | cut -d: -f2 | sed 's/^\\s*//' || cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d '\"'");
            const os_version = osVersionResult.stdout.trim();

            // Get kernel version
            const kernelVersionResult = await this.execCommand("uname -r");
            const kernel_version = kernelVersionResult.stdout.trim();

            // Get installed packages count
            const packagesResult = await this.execCommand("dpkg -l | grep '^ii' | wc -l || rpm -qa | wc -l || echo '0'");
            const installed_packages = parseInt(packagesResult.stdout.trim()) || 0;

            // Get last update
            const lastUpdateResult = await this.execCommand("stat -c %y /var/log/apt/history.log 2>/dev/null | cut -d' ' -f1 || stat -c %y /var/log/yum.log 2>/dev/null | cut -d' ' -f1 || echo 'Unknown'");
            const last_update = lastUpdateResult.stdout.trim();

            // Get disk health
            const diskHealthResult = await this.execCommand("smartctl -H /dev/sda 2>/dev/null | grep -o 'PASSED\\|FAILED' || echo 'healthy'");
            const disk_health = diskHealthResult.stdout.trim().toLowerCase();

            // Get network interfaces
            const networkInterfacesResult = await this.execCommand("ip addr show | grep -E '^[0-9]+:' | awk '{print $2}' | sed 's/:$//'");
            const interfaceNames = networkInterfacesResult.stdout.trim().split('\n');
            const network_interfaces = [];

            for (const iface of interfaceNames) {
                if (iface && iface !== 'lo') {
                    const ipResult = await this.execCommand(`ip addr show ${iface} | grep 'inet ' | awk '{print $2}' | cut -d/ -f1`);
                    const statusResult = await this.execCommand(`ip link show ${iface} | grep -o 'state [A-Z]*' | awk '{print $2}'`);
                    
                    network_interfaces.push({
                        name: iface,
                        ip: ipResult.stdout.trim() || 'N/A',
                        status: statusResult.stdout.trim().toLowerCase() || 'unknown'
                    });
                }
            }

            return {
                hostname,
                public_ip,
                private_ip,
                region: 'Production', // This would need to be configured based on your VPS provider
                os_version,
                kernel_version,
                installed_packages,
                last_update,
                disk_health,
                network_interfaces
            };
        } catch (error) {
            console.error('Failed to get VPS information:', error);
            return this.getMockVPSInformation();
        }
    }
};
