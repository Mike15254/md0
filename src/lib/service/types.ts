// Service Types - Clean TypeScript interfaces for the service layer
export interface User {
	id: number;
	username: string;
	email?: string;
	is_admin: boolean;
	github_installations: GitHubInstallation[];
	created_at: Date;
	updated_at: Date;
}

// GitHub Service Types
export interface GitHubInstallation {
	id: number;
	installation_id: number;
	account_login: string;
	account_type: 'User' | 'Organization';
	permissions: Record<string, string>;
	events: string[];
	repositories: GitHubRepository[];
	is_active: boolean;
	created_at: Date;
	updated_at: Date;
}

export interface GitHubRepository {
	id: number;
	repository_id: number;
	name: string;
	full_name: string;
	clone_url: string;
	html_url: string;
	default_branch: string;
	private: boolean;
	language?: string;
	description?: string;
	installation_id: number;
}

export interface GitHubAppConfig {
	app_id: string;
	client_id: string;
	client_secret: string;
	private_key: string;
	webhook_secret: string;
}

// Project & Deployment Types
export interface Project {
	id: number;
	name: string;
	description?: string;
	github_repository: GitHubRepository;
	branch: string;
	build_config: BuildConfig;
	deployment_config: DeploymentConfig;
	domain_config?: DomainConfig;
	environment_variables: Record<string, string>;
	status: ProjectStatus;
	container_id?: string;
	auto_deploy: boolean;
	created_by: number;
	created_at: Date;
	updated_at: Date;
	last_deployed_at?: Date;
}

export interface BuildConfig {
	build_command: string;
	start_command: string;
	port: number;
	runtime: 'node' | 'python' | 'static' | 'php';
	tech_stack: string[];
	dockerfile_content?: string;
	build_timeout: number;
}

export interface DeploymentConfig {
	type: 'docker';
	memory_limit?: number;
	cpu_limit?: number;
	restart_policy: 'always' | 'unless-stopped' | 'on-failure';
	health_check?: HealthCheck;
}

export interface HealthCheck {
	endpoint: string;
	interval: number;
	timeout: number;
	retries: number;
}

export type ProjectStatus = 'stopped' | 'building' | 'running' | 'failed' | 'stopping';

// Domain Service Types
export interface DomainConfig {
	id: number;
	project_id: number;
	domain_name: string;
	subdomain?: string;
	ssl_enabled: boolean;
	ssl_auto_renew: boolean;
	nginx_config_path?: string;
	certificate_path?: string;
	private_key_path?: string;
	status: DomainStatus;
	created_at: Date;
	updated_at: Date;
}

export type DomainStatus = 'pending' | 'active' | 'failed' | 'expired';

// VPS Service Types
export interface VPSMetrics {
	cpu_usage: number;
	memory_usage: number;
	disk_usage: number;
	network_in: number;
	network_out: number;
	uptime: number;
	recorded_at: Date;
}

export interface VPSInfo {
	hostname: string;
	ip_address: string;
	os: string;
	kernel_version: string;
	total_memory: number;
	total_disk: number;
	docker_version?: string;
	nginx_version?: string;
}

export interface ContainerInfo {
	id: string;
	name: string;
	image: string;
	status: string;
	created: Date;
	ports: PortMapping[];
	memory_usage?: number;
	cpu_usage?: number;
}

export interface PortMapping {
	container_port: number;
	host_port: number;
	protocol: 'tcp' | 'udp';
}

// Database Service Types
export interface DatabaseInstance {
	id: number;
	name: string;
	type: 'postgresql' | 'pocketbase';
	version: string;
	port: number;
	status: DatabaseStatus;
	container_id?: string;
	config: DatabaseConfig;
	memory_limit: number;
	storage_limit: number;
	backup_enabled: boolean;
	last_backup?: Date;
	created_by: number;
	created_at: Date;
	updated_at: Date;
}

export type DatabaseStatus = 'running' | 'stopped' | 'starting' | 'stopping' | 'error';

export interface DatabaseConfig {
	username?: string;
	password?: string;
	database_name?: string;
	max_connections?: number;
	shared_buffers?: string;
	data_directory?: string;
}

// Deployment Log Types
export interface DeploymentLog {
	id: number;
	project_id: number;
	deployment_id: string;
	type: LogType;
	level: LogLevel;
	message: string;
	metadata?: Record<string, any>;
	created_at: Date;
}

export type LogType = 'build' | 'runtime' | 'error' | 'info' | 'webhook' | 'domain' | 'vps';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Webhook Types
export interface WebhookEvent {
	id: number;
	project_id: number;
	event_type: string;
	event_action?: string;
	source_branch: string;
	target_branch?: string;
	commit_sha: string;
	commit_message: string;
	author_name: string;
	author_email: string;
	payload: Record<string, any>;
	processed: boolean;
	deployment_triggered: boolean;
	created_at: Date;
}

// Service Response Types
export interface ServiceResponse<T = any> {
	configured: any;
	ip: any;
	success: boolean;
	data?: T;
	error?: string;
	message?: string;
}

export interface PaginatedResponse<T = any> {
	data: T[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		pages: number;
	};
}

// Configuration Types
export interface AppConfig {
	github: GitHubAppConfig;
	vps: VPSConfig;
	database: DatabaseGlobalConfig;
	deployment: DeploymentGlobalConfig;
}

export interface VPSConfig {
	hostname: string;
	ip_address: string;
	ssh_port: number;
	ssh_key_path: string;
	nginx_config_path: string;
	docker_enabled: boolean;
	monitoring_enabled: boolean;
	max_projects: number;
	disk_quota_gb: number;
}

export interface DatabaseGlobalConfig {
	postgres_enabled: boolean;
	postgres_port: number;
	pocketbase_enabled: boolean;
	pocketbase_port: number;
	backup_enabled: boolean;
	backup_schedule: string;
	backup_retention_days: number;
}

export interface DeploymentGlobalConfig {
	build_timeout: number;
	default_memory_limit: number;
	default_cpu_limit: number;
	auto_deploy_enabled: boolean;
	webhook_secret: string;
}
