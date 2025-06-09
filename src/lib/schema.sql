-- MD0 Deployment Dashboard Database Schema

-- Enable UUID extension for better security
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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
    github_url VARCHAR(500) NOT NULL,
    github_branch VARCHAR(100) DEFAULT 'main',
    build_command TEXT DEFAULT 'bun install && bun run build',
    start_command TEXT DEFAULT 'bun start',
    port INTEGER,
    environment_variables JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'stopped', -- running, stopped, building, failed
    container_id VARCHAR(100),
    process_id INTEGER,
    deployment_type VARCHAR(20) DEFAULT 'docker', -- docker, pm2
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_deployed_at TIMESTAMP
);

-- Deployment logs
CREATE TABLE IF NOT EXISTS deployment_logs (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    log_type VARCHAR(20) NOT NULL CHECK (log_type IN ('build', 'runtime', 'error', 'info')),
    level VARCHAR(10) DEFAULT 'info' CHECK (level IN ('info', 'warn', 'error', 'debug')),
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
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

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects(created_by);
CREATE INDEX IF NOT EXISTS idx_deployment_logs_project_id ON deployment_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_deployment_logs_created_at ON deployment_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_deployment_logs_log_type ON deployment_logs(log_type);
CREATE INDEX IF NOT EXISTS idx_system_metrics_recorded_at ON system_metrics(recorded_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_database_instances_created_by ON database_instances(created_by);
CREATE INDEX IF NOT EXISTS idx_database_instances_status ON database_instances(status);
CREATE INDEX IF NOT EXISTS idx_settings_category_key ON settings(category, key);

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

CREATE TRIGGER update_database_instances_updated_at BEFORE UPDATE ON database_instances
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings
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
