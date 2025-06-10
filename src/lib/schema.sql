-- MD0 Deployment Dashboard Database Schema

-- Enable UUID extension for better security
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- GitHub credentials for accessing private repositories
CREATE TABLE IF NOT EXISTS github_credentials (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    credential_type VARCHAR(20) DEFAULT 'pat' CHECK (credential_type IN ('pat', 'oauth', 'ssh')),
    access_token TEXT, -- For PAT and OAuth
    refresh_token TEXT, -- For OAuth
    ssh_private_key TEXT, -- For SSH
    ssh_public_key TEXT, -- For SSH
    github_username VARCHAR(100),
    scopes TEXT[] DEFAULT ARRAY[]::TEXT[], -- OAuth scopes
    expires_at TIMESTAMP, -- For OAuth tokens
    is_active BOOLEAN DEFAULT TRUE,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, created_by)
);

-- Domain configurations
CREATE TABLE IF NOT EXISTS domains (
    id SERIAL PRIMARY KEY,
    domain_name VARCHAR(255) UNIQUE NOT NULL,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    ssl_enabled BOOLEAN DEFAULT FALSE,
    ssl_cert_path VARCHAR(500),
    ssl_key_path VARCHAR(500),
    ssl_auto_renew BOOLEAN DEFAULT TRUE,
    dns_configured BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'failed', 'expired')),
    last_ssl_check TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100) UNIQUE,
    is_admin BOOLEAN DEFAULT FALSE,
    last_login TIMESTAMP,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Projects table for deployed applications
CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    github_url VARCHAR(500) NOT NULL,
    github_branch VARCHAR(100) DEFAULT 'main',
    github_token_id INTEGER REFERENCES github_credentials(id),
    build_command TEXT DEFAULT 'bun install && bun run build',
    start_command TEXT DEFAULT 'bun start',
    port INTEGER,
    custom_domain VARCHAR(255),
    ssl_enabled BOOLEAN DEFAULT FALSE,
    ssl_cert_path VARCHAR(500),
    environment_variables JSONB DEFAULT '{}',
    runtime VARCHAR(50) DEFAULT 'node', -- node, python, static, go, rust, etc.
    tech_stack TEXT[] DEFAULT ARRAY[]::TEXT[],
    dockerfile_content TEXT,
    docker_image VARCHAR(200),
    status VARCHAR(20) DEFAULT 'stopped', -- running, stopped, building, failed, deploying
    container_id VARCHAR(100),
    process_id INTEGER,
    deployment_type VARCHAR(20) DEFAULT 'docker', -- docker, pm2
    auto_deploy BOOLEAN DEFAULT TRUE,
    webhook_secret VARCHAR(100),
    last_commit_sha VARCHAR(40),
    deployment_config JSONB DEFAULT '{}',
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_deployed_at TIMESTAMP,
    UNIQUE(name, created_by)
);

-- Deployment logs
CREATE TABLE IF NOT EXISTS deployment_logs (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    deployment_id VARCHAR(50), -- UUID for grouping logs by deployment
    log_type VARCHAR(20) NOT NULL CHECK (log_type IN ('build', 'runtime', 'error', 'info', 'webhook', 'domain')),
    level VARCHAR(10) DEFAULT 'info' CHECK (level IN ('info', 'warn', 'error', 'debug')),
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Webhook events tracking
CREATE TABLE IF NOT EXISTS webhook_events (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL, -- push, pull_request, tag, etc.
    event_action VARCHAR(50), -- opened, closed, synchronize for PRs
    source_branch VARCHAR(100),
    target_branch VARCHAR(100),
    commit_sha VARCHAR(40),
    commit_message TEXT,
    author_name VARCHAR(100),
    author_email VARCHAR(100),
    payload JSONB,
    processed BOOLEAN DEFAULT FALSE,
    deployment_triggered BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Database instances (PostgreSQL, PocketBase)
CREATE TABLE IF NOT EXISTS database_instances (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('postgresql', 'pocketbase', 'mysql', 'mongodb')),
    port INTEGER CHECK (port > 0 AND port < 65536),
    status VARCHAR(20) DEFAULT 'stopped' CHECK (status IN ('running', 'stopped', 'error', 'starting', 'stopping')),
    container_id VARCHAR(100),
    config JSONB DEFAULT '{}',
    version VARCHAR(20),
    memory_limit INTEGER DEFAULT 512, -- MB
    storage_limit INTEGER DEFAULT 1024, -- MB
    backup_enabled BOOLEAN DEFAULT FALSE,
    last_backup TIMESTAMP,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, created_by)
);

-- System monitoring data
CREATE TABLE IF NOT EXISTS system_metrics (
    id SERIAL PRIMARY KEY,
    cpu_usage DECIMAL(5,2),
    memory_usage DECIMAL(5,2),
    disk_usage DECIMAL(5,2),
    active_projects INTEGER DEFAULT 0,
    uptime_seconds BIGINT,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User sessions
CREATE TABLE IF NOT EXISTS user_sessions (
    id VARCHAR(128) PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Settings table for system configuration
CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    category VARCHAR(50) NOT NULL, -- system, github, database
    key VARCHAR(100) NOT NULL,
    value TEXT NOT NULL,
    type VARCHAR(20) DEFAULT 'string', -- string, number, boolean, json
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category, key)
);

-- GitHub App installations for automatic webhook management
CREATE TABLE IF NOT EXISTS github_app_installations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    installation_id INTEGER UNIQUE NOT NULL, -- GitHub's installation ID
    account_id INTEGER, -- GitHub account/organization ID
    account_login VARCHAR(100), -- GitHub username/org name
    account_type VARCHAR(20) CHECK (account_type IN ('User', 'Organization')),
    permissions JSONB DEFAULT '{}', -- App permissions granted
    events TEXT[] DEFAULT ARRAY[]::TEXT[], -- Webhook events enabled
    setup_action VARCHAR(20), -- install, update
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Track repository access for GitHub App installations
CREATE TABLE IF NOT EXISTS github_repository_access (
    id SERIAL PRIMARY KEY,
    installation_id INTEGER NOT NULL, -- Links to github_app_installations.installation_id
    repository_id INTEGER NOT NULL, -- GitHub repository ID
    repository_name VARCHAR(200), -- owner/repo format
    has_access BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(installation_id, repository_id)
);

-- Store detailed repository information for GitHub App installations
CREATE TABLE IF NOT EXISTS github_repositories (
    id SERIAL PRIMARY KEY,
    installation_id INTEGER NOT NULL, -- Links to github_app_installations.installation_id
    repository_id INTEGER NOT NULL, -- GitHub repository ID
    name VARCHAR(100) NOT NULL, -- Repository name only
    full_name VARCHAR(200) NOT NULL, -- owner/repo format
    clone_url VARCHAR(500), -- Git clone URL
    html_url VARCHAR(500), -- Web URL
    default_branch VARCHAR(100) DEFAULT 'main',
    private BOOLEAN DEFAULT FALSE,
    language VARCHAR(50),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(installation_id, repository_id)
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects(created_by);
CREATE INDEX IF NOT EXISTS idx_projects_github_url ON projects(github_url);
CREATE INDEX IF NOT EXISTS idx_projects_custom_domain ON projects(custom_domain);
CREATE INDEX IF NOT EXISTS idx_deployment_logs_project_id ON deployment_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_deployment_logs_deployment_id ON deployment_logs(deployment_id);
CREATE INDEX IF NOT EXISTS idx_deployment_logs_created_at ON deployment_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_deployment_logs_log_type ON deployment_logs(log_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_project_id ON webhook_events(project_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON webhook_events(created_at);
CREATE INDEX IF NOT EXISTS idx_github_credentials_created_by ON github_credentials(created_by);
CREATE INDEX IF NOT EXISTS idx_github_credentials_is_active ON github_credentials(is_active);
CREATE INDEX IF NOT EXISTS idx_domains_project_id ON domains(project_id);
CREATE INDEX IF NOT EXISTS idx_domains_status ON domains(status);
CREATE INDEX IF NOT EXISTS idx_system_metrics_recorded_at ON system_metrics(recorded_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_database_instances_created_by ON database_instances(created_by);
CREATE INDEX IF NOT EXISTS idx_database_instances_status ON database_instances(status);
CREATE INDEX IF NOT EXISTS idx_settings_category_key ON settings(category, key);
CREATE INDEX IF NOT EXISTS idx_github_app_installations_user_id ON github_app_installations(user_id);
CREATE INDEX IF NOT EXISTS idx_github_app_installations_installation_id ON github_app_installations(installation_id);
CREATE INDEX IF NOT EXISTS idx_github_app_installations_is_active ON github_app_installations(is_active);
CREATE INDEX IF NOT EXISTS idx_github_repository_access_installation_id ON github_repository_access(installation_id);
CREATE INDEX IF NOT EXISTS idx_github_repository_access_repository_id ON github_repository_access(repository_id);
CREATE INDEX IF NOT EXISTS idx_github_repositories_full_name ON github_repositories(full_name);
CREATE INDEX IF NOT EXISTS idx_github_app_installations_account ON github_app_installations(account_login);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers to update updated_at automatically
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_github_credentials_updated_at BEFORE UPDATE ON github_credentials
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_domains_updated_at BEFORE UPDATE ON domains
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_database_instances_updated_at BEFORE UPDATE ON database_instances
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_github_app_installations_updated_at BEFORE UPDATE ON github_app_installations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_github_repository_access_updated_at BEFORE UPDATE ON github_repository_access
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Useful views
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

CREATE OR REPLACE VIEW system_health AS
SELECT 
    COUNT(CASE WHEN status = 'running' THEN 1 END) as running_projects,
    COUNT(CASE WHEN status = 'stopped' THEN 1 END) as stopped_projects,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_projects,
    (SELECT COUNT(*) FROM database_instances WHERE status = 'running') as running_databases,
    (SELECT AVG(cpu_usage) FROM system_metrics WHERE recorded_at > NOW() - INTERVAL '1 hour') as avg_cpu_usage,
    (SELECT AVG(memory_usage) FROM system_metrics WHERE recorded_at > NOW() - INTERVAL '1 hour') as avg_memory_usage
FROM projects;

-- Function to clean old logs (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_logs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM deployment_logs 
    WHERE created_at < NOW() - INTERVAL '30 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    DELETE FROM system_metrics 
    WHERE recorded_at < NOW() - INTERVAL '7 days';
    
    RETURN deleted_count;
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

-- Insert default admin user (password: admin123)
INSERT INTO users (username, password_hash, is_admin) 
VALUES ('admin', '$2b$10$rHZ8D5ZoNgwKjF2LWZ8N8OJ2Q5yH.VxK0pGY9ZJx7XQp5qK2mF8Gu', true)
ON CONFLICT (username) DO NOTHING;
