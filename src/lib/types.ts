// Authentication types
export interface User {
    id: number;
    username: string;
    email?: string;
    is_admin: boolean;
    created_at: Date;
}

export interface LoginCredentials {
    username: string;
    password: string;
}

// Project types
export interface Project {
    id: number;
    name: string;
    github_url: string;
    repository_url?: string; // alias for github_url
    github_branch: string;
    branch?: string; // alias for github_branch
    build_command: string;
    start_command: string;
    port?: number;
    environment_variables: Record<string, string>;
    status: 'running' | 'stopped' | 'building' | 'failed';
    container_id?: string;
    process_id?: number;
    deployment_type: 'docker' | 'pm2';
    runtime?: string;
    domain?: string;
    description?: string;
    created_by: number;
    created_by_username?: string;
    created_at: Date;
    updated_at: Date;
    last_deployed_at?: Date;
}

export interface CreateProjectRequest {
    name: string;
    github_url: string;
    github_branch?: string;
    build_command?: string;
    start_command?: string;
    port?: number;
    environment_variables?: Record<string, string>;
}

// Deployment types
export interface DeploymentLog {
    id: number;
    project_id: number;
    log_type: 'build' | 'runtime' | 'error';
    level?: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    created_at: Date;
}

// Database types
export interface DatabaseInstance {
    id: number;
    name: string;
    type: 'postgresql' | 'pocketbase';
    port: number;
    status: 'running' | 'stopped';
    container_id?: string;
    config: Record<string, any>;
    version?: string;
    memory_limit?: number;
    storage_limit?: number;
    created_by: number;
    created_by_username?: string;
    created_at: Date;
    updated_at: Date;
}

export interface CreateDatabaseRequest {
    name: string;
    type: 'postgresql' | 'pocketbase';
    port: number;
    config?: Record<string, any>;
}

// System monitoring types
export interface SystemMetrics {
	memory_used_bytes: number;
	memory_total_bytes: number;
	disk_used_bytes: number;
	disk_total_bytes: number;
	hostname: string;
	boot_time: any;
	process_count: string;
    id?: number;
    cpu_usage: number;
    memory_usage: number;
    disk_usage: number;
    active_projects: number;
    uptime_seconds: number;
    // Additional system metrics
    memory_usage_percent?: number;
    disk_usage_percent?: number;
    uptime?: number;
    load_average?: number[];
    timestamp?: number;
    cpu_cores?: number;
    memory_used?: number;
    memory_total?: number;
    disk_used?: number;
    disk_total?: number;
    network_rx?: number;
    network_tx?: number;
    processes_running?: number;
    processes_total?: number;
    recorded_at?: Date;
    network_connections?: number;
    failed_login_attempts?: number;
}

export interface SecurityMetrics {
    firewall_status: boolean;
    fail2ban_status: boolean;
    blocked_ips: string[];
    failed_login_attempts: number;
    open_ports: Array<{port: number, service: string}>;
    suspicious_processes: Array<{pid: number, name: string, cpu: number}>;
    recent_logins: Array<{user: string, ip: string, time: string}>;
    ssl_certificates: Array<{domain: string, expires: string, valid: boolean}>;
}

export interface VPSInformation {
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

export interface DockerContainer {
    name: string;
    status: string;
    ports: string;
}

export interface SystemProcess {
    pid: number;
    cpu: number;
    memory: number;
    command: string;
}

export interface DatabaseStatus {
    postgresql: boolean;
    pocketbase: boolean;
}

// API response types
export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    message?: string;
    error?: string;
}

// Form validation types
export interface ValidationError {
    field: string;
    message: string;
}

// GitHub webhook types
export interface GitHubWebhookPayload {
    action?: string;
    repository: {
        name: string;
        full_name: string;
        clone_url: string;
        default_branch: string;
    };
    ref?: string;
    commits?: Array<{
        id: string;
        message: string;
        author: {
            name: string;
            email: string;
        };
    }>;
}

// Environment variable types
export interface EnvironmentVariable {
    key: string;
    value: string;
    description?: string;
}

// Settings types
export interface AppSettings {
    auto_deploy: boolean;
    max_projects: number;
    default_build_command: string;
    default_start_command: string;
    notification_email?: string;
}

// Dashboard stats types
export interface DashboardStats {
    total_projects: number;
    running_projects: number;
    failed_projects: number;
    total_deployments: number;
    system_metrics: SystemMetrics;
    recent_deployments: Array<{
        project_name: string;
        status: string;
        deployed_at: Date;
    }>;
}
