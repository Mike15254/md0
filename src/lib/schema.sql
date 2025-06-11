-- MD0 Deployment Platform Database Schema
-- Clean, service-aligned schema for CI/CD platform with GitHub Apps, Docker deployments, and real-time features

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================================================
-- AUTHENTICATION & USER MANAGEMENT
-- =====================================================================================

-- Users table - Core authentication with GitHub Apps integration
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100) UNIQUE,
    is_admin BOOLEAN DEFAULT FALSE,
    github_installations INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    last_login TIMESTAMP,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT valid_username CHECK (username ~ '^[a-zA-Z0-9_-]+$' AND length(username) >= 3)
);

-- User sessions for Lucia authentication
CREATE TABLE IF NOT EXISTS user_sessions (
    id VARCHAR(128) PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- =====================================================================================
-- GITHUB APP INTEGRATION
-- =====================================================================================

-- GitHub App installations
CREATE TABLE IF NOT EXISTS github_app_installations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    installation_id INTEGER UNIQUE NOT NULL,
    account_id INTEGER,
    account_login VARCHAR(100) NOT NULL,
    account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('User', 'Organization')),
    permissions JSONB DEFAULT '{}',
    events TEXT[] DEFAULT ARRAY[]::TEXT[],
    setup_action VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- GitHub repositories accessible through installations
CREATE TABLE IF NOT EXISTS github_repositories (
    id SERIAL PRIMARY KEY,
    installation_id INTEGER NOT NULL REFERENCES github_app_installations(installation_id) ON DELETE CASCADE,
    repository_id INTEGER NOT NULL,
    name VARCHAR(100) NOT NULL,
    full_name VARCHAR(200) NOT NULL,
    clone_url VARCHAR(500) NOT NULL,
    html_url VARCHAR(500) NOT NULL,
    default_branch VARCHAR(100) DEFAULT 'main',
    private BOOLEAN DEFAULT FALSE,
    language VARCHAR(50),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(installation_id, repository_id)
);

-- Track repository access for GitHub App installations
CREATE TABLE IF NOT EXISTS github_repository_access (
    id SERIAL PRIMARY KEY,
    installation_id INTEGER NOT NULL,
    repository_id INTEGER NOT NULL,
    repository_name VARCHAR(200),
    has_access BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(installation_id, repository_id)
);

-- GitHub credentials (for backward compatibility if needed)
CREATE TABLE IF NOT EXISTS github_credentials (
    id SERIAL PRIMARY KEY,
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    username VARCHAR(100) NOT NULL,
    token_encrypted TEXT NOT NULL,
    scope TEXT[] DEFAULT ARRAY['repo', 'user:email'],
    is_active BOOLEAN DEFAULT TRUE,
    last_used TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(created_by, username)
);

-- =====================================================================================
-- PROJECT MANAGEMENT & DEPLOYMENTS
-- =====================================================================================

-- Projects with Docker deployment configuration
CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    github_repository_id INTEGER REFERENCES github_repositories(id) ON DELETE SET NULL,
    github_url VARCHAR(500),
    branch VARCHAR(100) DEFAULT 'main',
    
    -- Build configuration
    build_command TEXT DEFAULT 'bun install && bun run build',
    start_command TEXT DEFAULT 'bun start',
    port INTEGER DEFAULT 3000,
    runtime VARCHAR(20) DEFAULT 'node' CHECK (runtime IN ('node', 'bun', 'python', 'static', 'php', 'deno', 'go', 'rust')),
    tech_stack TEXT[] DEFAULT ARRAY[]::TEXT[],
    dockerfile_content TEXT,
    build_timeout INTEGER DEFAULT 600,
    
    -- Deployment configuration
    deployment_config JSONB DEFAULT '{"type": "docker", "restart_policy": "always"}',
    environment_variables JSONB DEFAULT '{}',
    
    -- Status and container info
    status VARCHAR(20) DEFAULT 'stopped' CHECK (status IN ('stopped', 'building', 'running', 'failed', 'stopping')),
    container_id VARCHAR(100),
    auto_deploy BOOLEAN DEFAULT TRUE,
    webhook_secret VARCHAR(100) DEFAULT uuid_generate_v4()::text,
    last_commit_sha VARCHAR(40),
    custom_domain VARCHAR(255),
    
    -- Ownership and timestamps
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_deployed_at TIMESTAMP,
    
    UNIQUE(name, created_by),
    CONSTRAINT valid_port CHECK (port > 0 AND port < 65536),
    CONSTRAINT valid_build_timeout CHECK (build_timeout > 0 AND build_timeout <= 3600)
);

-- =====================================================================================
-- DOMAIN MANAGEMENT & SSL
-- =====================================================================================

-- Custom domains with SSL certificate management
CREATE TABLE IF NOT EXISTS domains (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    domain_name VARCHAR(255) UNIQUE NOT NULL,
    subdomain VARCHAR(100),
    ssl_enabled BOOLEAN DEFAULT TRUE,
    ssl_auto_renew BOOLEAN DEFAULT TRUE,
    nginx_config_path VARCHAR(500),
    certificate_path VARCHAR(500),
    private_key_path VARCHAR(500),
    dns_configured BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'failed', 'expired')),
    last_ssl_check TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_domain_name CHECK (domain_name ~ '^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]$')
);

-- =====================================================================================
-- DATABASE MANAGEMENT
-- =====================================================================================

-- Database instances (PostgreSQL, PocketBase) via Docker
CREATE TABLE IF NOT EXISTS database_instances (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('postgresql', 'pocketbase')),
    version VARCHAR(20) DEFAULT 'latest',
    port INTEGER CHECK (port > 0 AND port < 65536),
    status VARCHAR(20) DEFAULT 'stopped' CHECK (status IN ('running', 'stopped', 'starting', 'stopping', 'error')),
    container_id VARCHAR(100),
    config JSONB DEFAULT '{}',
    memory_limit INTEGER DEFAULT 512,
    storage_limit INTEGER DEFAULT 1024,
    backup_enabled BOOLEAN DEFAULT FALSE,
    last_backup TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(name, created_by)
);

-- =====================================================================================
-- VPS MONITORING & SYSTEM METRICS
-- =====================================================================================

-- VPS metrics for system monitoring
CREATE TABLE IF NOT EXISTS vps_metrics (
    id SERIAL PRIMARY KEY,
    cpu_usage DECIMAL(5,2) NOT NULL,
    memory_usage DECIMAL(5,2) NOT NULL,
    disk_usage DECIMAL(5,2) NOT NULL,
    network_in BIGINT DEFAULT 0,
    network_out BIGINT DEFAULT 0,
    uptime BIGINT DEFAULT 0,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- System metrics (alias for vps_metrics for backward compatibility)
CREATE TABLE IF NOT EXISTS system_metrics (
    id SERIAL PRIMARY KEY,
    cpu_usage DECIMAL(5,2) NOT NULL,
    memory_usage DECIMAL(5,2) NOT NULL,
    disk_usage DECIMAL(5,2) NOT NULL,
    network_in BIGINT DEFAULT 0,
    network_out BIGINT DEFAULT 0,
    uptime BIGINT DEFAULT 0,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================================================
-- LOGGING & EVENTS
-- =====================================================================================

-- Deployment logs for builds, runtime, and system events
CREATE TABLE IF NOT EXISTS deployment_logs (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    deployment_id VARCHAR(50) NOT NULL,
    log_type VARCHAR(20) NOT NULL CHECK (log_type IN ('build', 'runtime', 'error', 'info', 'webhook', 'domain', 'vps')),
    type VARCHAR(20) NOT NULL CHECK (type IN ('build', 'runtime', 'error', 'info', 'webhook', 'domain', 'vps')),
    level VARCHAR(10) DEFAULT 'info' CHECK (level IN ('debug', 'info', 'warn', 'error')),
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Webhook events from GitHub
CREATE TABLE IF NOT EXISTS webhook_events (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    event_action VARCHAR(50),
    source_branch VARCHAR(100) NOT NULL,
    target_branch VARCHAR(100),
    commit_sha VARCHAR(40) NOT NULL,
    commit_message TEXT,
    author_name VARCHAR(100),
    author_email VARCHAR(100),
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    deployment_triggered BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Real-time events for SSE streaming
CREATE TABLE IF NOT EXISTS realtime_events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================================================
-- SETTINGS & CONFIGURATION
-- =====================================================================================

-- Application settings
CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    category VARCHAR(50) NOT NULL,
    key VARCHAR(100) NOT NULL,
    value TEXT NOT NULL,
    type VARCHAR(20) DEFAULT 'string', -- string, number, boolean, json
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category, key)
);

-- =====================================================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================================================

-- User authentication indexes
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

-- GitHub integration indexes
CREATE INDEX IF NOT EXISTS idx_github_installations_installation_id ON github_app_installations(installation_id);
CREATE INDEX IF NOT EXISTS idx_github_installations_user_id ON github_app_installations(user_id);
CREATE INDEX IF NOT EXISTS idx_github_installations_is_active ON github_app_installations(is_active);
CREATE INDEX IF NOT EXISTS idx_github_installations_account ON github_app_installations(account_login);
CREATE INDEX IF NOT EXISTS idx_github_repositories_installation_id ON github_repositories(installation_id);
CREATE INDEX IF NOT EXISTS idx_github_repositories_repository_id ON github_repositories(repository_id);
CREATE INDEX IF NOT EXISTS idx_github_repositories_full_name ON github_repositories(full_name);
CREATE INDEX IF NOT EXISTS idx_github_repository_access_installation_id ON github_repository_access(installation_id);
CREATE INDEX IF NOT EXISTS idx_github_repository_access_repository_id ON github_repository_access(repository_id);
CREATE INDEX IF NOT EXISTS idx_github_credentials_created_by ON github_credentials(created_by);
CREATE INDEX IF NOT EXISTS idx_github_credentials_is_active ON github_credentials(is_active);

-- Project management indexes
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects(created_by);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_github_repository_id ON projects(github_repository_id);
CREATE INDEX IF NOT EXISTS idx_projects_github_url ON projects(github_url);
CREATE INDEX IF NOT EXISTS idx_projects_custom_domain ON projects(custom_domain);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at DESC);

-- Domain management indexes
CREATE INDEX IF NOT EXISTS idx_domains_project_id ON domains(project_id);
CREATE INDEX IF NOT EXISTS idx_domains_domain_name ON domains(domain_name);
CREATE INDEX IF NOT EXISTS idx_domains_status ON domains(status);

-- Database management indexes
CREATE INDEX IF NOT EXISTS idx_database_instances_created_by ON database_instances(created_by);
CREATE INDEX IF NOT EXISTS idx_database_instances_status ON database_instances(status);
CREATE INDEX IF NOT EXISTS idx_database_instances_type ON database_instances(type);

-- Logging indexes
CREATE INDEX IF NOT EXISTS idx_deployment_logs_project_id ON deployment_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_deployment_logs_deployment_id ON deployment_logs(deployment_id);
CREATE INDEX IF NOT EXISTS idx_deployment_logs_created_at ON deployment_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deployment_logs_type_level ON deployment_logs(log_type, level);

CREATE INDEX IF NOT EXISTS idx_webhook_events_project_id ON webhook_events(project_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON webhook_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_realtime_events_user_id ON realtime_events(user_id);
CREATE INDEX IF NOT EXISTS idx_realtime_events_event_type ON realtime_events(event_type);
CREATE INDEX IF NOT EXISTS idx_realtime_events_created_at ON realtime_events(created_at DESC);

-- VPS monitoring indexes
CREATE INDEX IF NOT EXISTS idx_vps_metrics_recorded_at ON vps_metrics(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_metrics_recorded_at ON system_metrics(recorded_at DESC);

-- Settings indexes
CREATE INDEX IF NOT EXISTS idx_settings_category_key ON settings(category, key);

-- =====================================================================================
-- TRIGGERS & FUNCTIONS
-- =====================================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_github_installations_updated_at BEFORE UPDATE ON github_app_installations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_github_repositories_updated_at BEFORE UPDATE ON github_repositories 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_github_repository_access_updated_at BEFORE UPDATE ON github_repository_access
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_github_credentials_updated_at BEFORE UPDATE ON github_credentials
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_domains_updated_at BEFORE UPDATE ON domains 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_database_instances_updated_at BEFORE UPDATE ON database_instances 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================================
-- DATA CLEANUP FUNCTIONS
-- =====================================================================================

-- Function to clean old logs (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_logs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM deployment_logs WHERE created_at < NOW() - INTERVAL '30 days';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    DELETE FROM realtime_events WHERE created_at < NOW() - INTERVAL '7 days';
    DELETE FROM vps_metrics WHERE recorded_at < NOW() - INTERVAL '7 days';
    DELETE FROM system_metrics WHERE recorded_at < NOW() - INTERVAL '7 days';
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM user_sessions WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to get project deployment history
CREATE OR REPLACE FUNCTION get_project_deployment_history(project_id_param INTEGER, limit_param INTEGER DEFAULT 10)
RETURNS TABLE(
    log_id INTEGER,
    log_type VARCHAR,
    level VARCHAR,
    message TEXT,
    created_at TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dl.id,
        dl.log_type,
        dl.level,
        dl.message,
        dl.created_at
    FROM deployment_logs dl
    WHERE dl.project_id = project_id_param
    ORDER BY dl.created_at DESC
    LIMIT limit_param;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================================
-- USEFUL VIEWS
-- =====================================================================================

-- Project statistics view
CREATE OR REPLACE VIEW project_stats AS
SELECT 
    p.id,
    p.name,
    p.status,
    p.created_at,
    u.username as created_by_username,
    COUNT(dl.id) as total_logs,
    COUNT(CASE WHEN dl.log_type = 'error' THEN 1 END) as error_count,
    MAX(dl.created_at) as last_log_time
FROM projects p
LEFT JOIN users u ON p.created_by = u.id
LEFT JOIN deployment_logs dl ON p.id = dl.project_id
GROUP BY p.id, p.name, p.status, p.created_at, u.username;

-- System health view
CREATE OR REPLACE VIEW system_health AS
SELECT 
    COUNT(CASE WHEN status = 'running' THEN 1 END) as running_projects,
    COUNT(CASE WHEN status = 'stopped' THEN 1 END) as stopped_projects,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_projects,
    (SELECT COUNT(*) FROM database_instances WHERE status = 'running') as running_databases,
    (SELECT AVG(cpu_usage) FROM system_metrics WHERE recorded_at > NOW() - INTERVAL '1 hour') as avg_cpu_usage,
    (SELECT AVG(memory_usage) FROM system_metrics WHERE recorded_at > NOW() - INTERVAL '1 hour') as avg_memory_usage
FROM projects;

-- =====================================================================================
-- INITIAL DATA
-- =====================================================================================

-- Insert default admin user (password: admin123!)
INSERT INTO users (username, password_hash, email, is_admin) 
VALUES (
    'admin', 
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewYb7BA/sJxOv6Sq', 
    'admin@md0.local', 
    TRUE
) ON CONFLICT (username) DO NOTHING;

-- Insert basic system settings
INSERT INTO settings (category, key, value, type) VALUES
    ('system', 'app_name', 'MD0 Deployment Platform', 'string'),
    ('system', 'version', '1.0.0', 'string'),
    ('system', 'maintenance_mode', 'false', 'boolean'),
    ('github', 'app_installed', 'false', 'boolean'),
    ('deployment', 'max_concurrent_builds', '3', 'number'),
    ('deployment', 'default_timeout', '600', 'number'),
    ('ssl', 'auto_provision', 'true', 'boolean'),
    ('ssl', 'letsencrypt_enabled', 'true', 'boolean')
ON CONFLICT (category, key) DO NOTHING;