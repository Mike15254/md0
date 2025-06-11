// Test utilities and helpers for API testing
import postgres from 'postgres';
import { expect } from 'bun:test';

// Create separate database connection for tests
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://md0_admin:flewNew930@178.18.250.118:5432/md0?sslmode=prefer";
export const testDb = postgres(DATABASE_URL, {
    ssl: process.env.NODE_ENV === 'production',
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
});

export interface TestUser {
    id: number;
    username: string;
    email?: string;
    is_admin: boolean;
}

export interface TestProject {
    id: number;
    name: string;
    created_by: number;
    status: string;
}

export interface TestDomain {
    id: number;
    domain: string;
    project_id: number;
    ssl_enabled: boolean;
}

export interface TestDatabase {
    id: number;
    name: string;
    type: string;
    created_by: number;
    status: string;
}

// Simplified API for backward compatibility
export const setupTestDatabase = async () => {
    // Database is already set up, this is just for compatibility
    return true;
};

export const cleanupTestDatabase = async () => {
    await TestHelpers.cleanupDatabase();
};

export const createTestUser = async (username?: string, email?: string, isAdmin?: boolean) => {
    return TestHelpers.createTestUser(username, email, isAdmin);
};

export const createTestProject = async (userId: number, name?: string) => {
    return TestHelpers.createTestProject(name || TestHelpers.generateProjectName(), userId);
};

export const createTestDomain = async (userId: number, domainName: string, projectId?: number) => {
    if (!projectId) {
        const project = await createTestProject(userId);
        projectId = project.id;
    }
    
    const result = await testDb`
        INSERT INTO domains (domain_name, project_id, ssl_enabled, status)
        VALUES (${domainName}, ${projectId}, true, 'pending')
        RETURNING id, domain_name as domain, project_id, ssl_enabled
    `;
    return result[0] as TestDomain;
};

export const createTestDatabase = async (userId: number, name: string, type: string = 'postgresql') => {
    const result = await testDb`
        INSERT INTO database_instances (name, type, created_by, status, port, memory_limit, storage_limit)
        VALUES (${name}, ${type}, ${userId}, 'stopped', 5432, 512, 1024)
        RETURNING id, name, type, created_by, status
    `;
    return result[0] as TestDatabase;
};

export const createTestSession = async (userId: number) => {
    return TestHelpers.createTestSession(userId);
};

export const createUserSession = async (userId: number) => {
    return TestHelpers.createTestSession(userId);
};

export const getTestUser = async (username: string) => {
    return TestHelpers.getUserByUsername(username);
};

export const clearAllTables = async (tableNames: string[]) => {
    for (const tableName of tableNames) {
        await testDb`DELETE FROM ${testDb(tableName)}`;
    }
};

export const makeRequest = async (path: string, method: string = 'GET', body?: any, options?: { sessionId?: string }) => {
    const baseUrl = 'http://localhost:5173';
    const url = `${baseUrl}${path}`;
    
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    
    if (options?.sessionId) {
        headers['Cookie'] = `auth_session=${options.sessionId}`;
    }
    
    const requestOptions: RequestInit = {
        method,
        headers,
    };
    
    if (body && method !== 'GET') {
        requestOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    
    const response = await fetch(url, requestOptions);
    
    // Parse response data
    let data = null;
    const contentType = response.headers.get('content-type');
    
    if (contentType) {
        if (contentType.includes('application/json')) {
            try {
                data = await response.json();
            } catch (e) {
                // If JSON parsing fails, leave data as null
            }
        } else if (contentType.includes('text/event-stream')) {
            // For SSE streams, try to read the text
            try {
                data = await response.text();
            } catch (e) {
                // If text reading fails, leave data as null
            }
        } else if (contentType.includes('text/')) {
            try {
                data = await response.text();
            } catch (e) {
                // If text reading fails, leave data as null
            }
        }
    }
    
    return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        data,
        ok: response.ok
    };
};

export class TestHelpers {
    // Test database utilities
    static async cleanupDatabase() {
        // Clean up test data in reverse dependency order
        await testDb`DELETE FROM realtime_events WHERE user_id > 1`;
        await testDb`DELETE FROM webhook_events WHERE project_id IN (SELECT id FROM projects WHERE created_by > 1)`;
        await testDb`DELETE FROM deployment_logs WHERE project_id IN (SELECT id FROM projects WHERE created_by > 1)`;
        await testDb`DELETE FROM domains WHERE project_id IN (SELECT id FROM projects WHERE created_by > 1)`;
        await testDb`DELETE FROM projects WHERE created_by > 1`;
        await testDb`DELETE FROM github_repository_access WHERE installation_id IN (SELECT installation_id FROM github_app_installations WHERE user_id > 1)`;
        await testDb`DELETE FROM github_repositories WHERE installation_id IN (SELECT installation_id FROM github_app_installations WHERE user_id > 1)`;
        await testDb`DELETE FROM github_credentials WHERE created_by > 1`;
        await testDb`DELETE FROM github_app_installations WHERE user_id > 1`;
        await testDb`DELETE FROM database_instances WHERE created_by > 1`;
        await testDb`DELETE FROM user_sessions WHERE user_id > 1`;
        await testDb`DELETE FROM users WHERE id > 1`;
    }

    // Create test user
    static async createTestUser(username: string = 'testuser', email?: string, isAdmin: boolean = false): Promise<TestUser> {
        // Use bcrypt to hash the default password consistently
        const bcrypt = await import('bcryptjs');
        const passwordHash = await bcrypt.hash(TEST_CONFIG.DEFAULT_PASSWORD, 12);
        
        const result = await testDb`
            INSERT INTO users (username, password_hash, email, is_admin)
            VALUES (${username}, ${passwordHash}, ${email || null}, ${isAdmin})
            RETURNING id, username, email, is_admin
        `;
        return result[0] as TestUser;
    }

    // Create test project with GitHub support
    static async createTestProject(
        name: string, 
        created_by: number, 
        options?: { 
            status?: string;
            github_url?: string;
            github_branch?: string; 
            auto_deploy?: boolean;
            runtime?: string;
            port?: number;
        }
    ): Promise<TestProject> {
        const status = options?.status || 'stopped';
        const result = await testDb`
            INSERT INTO projects (
                name, created_by, status, description, github_url, branch, 
                auto_deploy, runtime, port, build_command, start_command
            )
            VALUES (
                ${name}, ${created_by}, ${status}, 'Test project description',
                ${options?.github_url || null}, ${options?.github_branch || 'main'},
                ${options?.auto_deploy || false}, ${options?.runtime || 'node'}, 
                ${options?.port || 3000}, 'npm install', 'npm start'
            )
            RETURNING id, name, created_by, status
        `;
        return result[0] as TestProject;
    }

    // Setup test environment with webhook secrets
    static async setupTestEnvironment() {
        // Add webhook secret for testing
        await testDb`
            INSERT INTO settings (category, key, value, type)
            VALUES ('githubApp', 'webhook_secret', 'test_webhook_secret', 'string')
            ON CONFLICT (category, key) DO UPDATE SET 
                value = EXCLUDED.value,
                updated_at = CURRENT_TIMESTAMP
        `;
        
        // Add system webhook secret as well
        await testDb`
            INSERT INTO settings (category, key, value, type)
            VALUES ('system', 'webhook_secret', 'test_webhook_secret', 'string')
            ON CONFLICT (category, key) DO UPDATE SET 
                value = EXCLUDED.value,
                updated_at = CURRENT_TIMESTAMP
        `;

        // Add GitHub App configuration for testing
        const githubAppSettings = [
            { key: 'app_id', value: '123456' },
            { key: 'client_id', value: 'test_client_id' },
            { key: 'client_secret', value: 'test_client_secret' },
            { key: 'private_key', value: '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA1234567890abcdef\n-----END RSA PRIVATE KEY-----' }
        ];

        for (const setting of githubAppSettings) {
            await testDb`
                INSERT INTO settings (category, key, value, type)
                VALUES ('github_app', ${setting.key}, ${setting.value}, 'string')
                ON CONFLICT (category, key) DO UPDATE SET 
                    value = EXCLUDED.value,
                    updated_at = CURRENT_TIMESTAMP
            `;
        }
    }

    // Create GitHub App installation for testing
    static async createTestGitHubInstallation(userId: number, installationId: number = 12345) {
        const result = await testDb`
            INSERT INTO github_app_installations (
                user_id, installation_id, account_id, account_login, account_type,
                permissions, events, is_active
            )
            VALUES (
                ${userId}, ${installationId}, 67890, 'testuser', 'User',
                '{"contents": "read", "metadata": "read"}', 
                ${['push', 'pull_request', 'release']}, true
            )
            ON CONFLICT (installation_id) DO UPDATE SET
                user_id = EXCLUDED.user_id,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `;
        return result[0];
    }

    // Create GitHub repository for testing
    static async createTestGitHubRepository(installationId: number, repositoryId: number = 123456789) {
        const result = await testDb`
            INSERT INTO github_repositories (
                installation_id, repository_id, name, full_name, clone_url, 
                html_url, default_branch, private, language, description
            )
            VALUES (
                ${installationId}, ${repositoryId}, 'test-repo', 'testuser/test-repo',
                'https://github.com/testuser/test-repo.git',
                'https://github.com/testuser/test-repo', 'main', false,
                'TypeScript', 'Test repository'
            )
            ON CONFLICT (installation_id, repository_id) DO UPDATE SET
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `;
        return result[0];
    }

    // Create test domain for projects
    static async createTestDomain(projectId: number, domainName?: string) {
        const domain = domainName || this.generateDomainName();
        
        const result = await testDb`
            INSERT INTO domains (domain_name, project_id, ssl_enabled, status)
            VALUES (${domain}, ${projectId}, true, 'pending')
            RETURNING id, domain_name as domain, project_id, ssl_enabled, status
        `;
        return result[0] as TestDomain;
    }

    // Create test database instance
    static async createTestDatabase(name: string, created_by: number, options: {
        type?: string;
        status?: string;
        port?: number;
        memory_limit?: number;
        storage_limit?: number;
    } = {}) {
        const {
            type = 'postgresql',
            status = 'stopped',
            port = 5432,
            memory_limit = 512,
            storage_limit = 1024
        } = options;

        const result = await testDb`
            INSERT INTO database_instances (
                name, type, created_by, status, port, memory_limit, storage_limit
            )
            VALUES (
                ${name}, ${type}, ${created_by}, ${status}, ${port},
                ${memory_limit}, ${storage_limit}
            )
            RETURNING id, name, type, created_by, status, port
        `;
        return result[0] as TestDatabase;
    }

    // Create test session by logging in
    static async createTestSession(userId: number): Promise<string> {
        // Get the user first
        const user = await testDb`SELECT username FROM users WHERE id = ${userId}`;
        if (!user.length) {
            throw new Error(`User with id ${userId} not found`);
        }
        
        // Login to get session cookie
        const response = await this.makeRequest('/api/new/auth/login', {
            method: 'POST',
            body: JSON.stringify({
                username: user[0].username,
                password: TEST_CONFIG.DEFAULT_PASSWORD
            })
        });
        
        if (!response.ok) {
            throw new Error(`Failed to create session: ${response.status}`);
        }
        
        // Extract session cookie
        const setCookie = response.headers.get('set-cookie');
        if (!setCookie) {
            throw new Error('No session cookie returned');
        }
        
        const sessionMatch = setCookie.match(/auth_session=([^;]+)/);
        if (!sessionMatch) {
            throw new Error('Session cookie not found in response');
        }
        
        return sessionMatch[1];
    }

    // HTTP request helpers
    static async makeRequest(path: string, options: RequestInit = {}) {
        const baseUrl = 'http://localhost:5173'; // SvelteKit dev server
        const url = `${baseUrl}${path}`;
        
        const defaultHeaders = {
            'Content-Type': 'application/json',
        };

        return fetch(url, {
            ...options,
            headers: {
                ...defaultHeaders,
                ...options.headers,
            },
        });
    }

    static async makeAuthenticatedRequest(path: string, sessionId: string, options: RequestInit = {}) {
        return this.makeRequest(path, {
            ...options,
            headers: {
                ...options.headers,
                'Cookie': `auth_session=${sessionId}`,
            },
        });
    }

    // Assertion helpers
    static expectValidResponse(response: Response, expectedStatus: number = 200) {
        expect(response.status).toBe(expectedStatus);
        expect(response.headers.get('content-type')).toContain('application/json');
    }

    static async expectJsonResponse(response: Response, expectedStatus: number = 200) {
        this.expectValidResponse(response, expectedStatus);
        const data = await response.json();
        expect(data).toBeDefined();
        return data;
    }

    static expectError(data: any, expectedMessage?: string) {
        expect(data.error).toBeDefined();
        if (expectedMessage) {
            expect(data.error).toContain(expectedMessage);
        }
    }

    static expectSuccess(data: any) {
        expect(data.error).toBeUndefined();
    }

    // Database verification helpers
    static async getUserByUsername(username: string): Promise<TestUser | null> {
        const result = await testDb`
            SELECT id, username, email, is_admin 
            FROM users 
            WHERE username = ${username}
        `;
        return result[0] as TestUser || null;
    }

    static async getProjectByName(name: string, userId: number): Promise<TestProject | null> {
        const result = await testDb`
            SELECT id, name, created_by, status 
            FROM projects 
            WHERE name = ${name} AND created_by = ${userId}
        `;
        return result[0] as TestProject || null;
    }

    static async getSessionByUserId(userId: number): Promise<{ id: string; user_id: number } | null> {
        const result = await testDb`
            SELECT id, user_id 
            FROM user_sessions 
            WHERE user_id = ${userId}
        `;
        return result[0] as { id: string; user_id: number } || null;
    }

    // Test data generators
    static generateRandomString(length: number = 8): string {
        return Math.random().toString(36).substring(2, 2 + length);
    }

    static generateTestEmail(): string {
        return `test${this.generateRandomString()}@example.com`;
    }

    static generateProjectName(): string {
        return `test-project-${this.generateRandomString()}`;
    }

    static generateDomainName(): string {
        return `${this.generateRandomString()}.example.com`;
    }
}

// Common test configurations
export const TEST_CONFIG = {
    API_BASE: '/api/new',
    TIMEOUT: 10000,
    DEFAULT_PASSWORD: 'admin123!',
    TEST_USER_PASSWORD: 'testpass123',
};

// Test data constants
export const TEST_DATA = {
    ADMIN_USER: {
        username: 'admin',
        password: 'admin123!',
    },
    VALID_PROJECT: {
        name: 'test-app',
        description: 'Test application',
        repository_url: 'https://github.com/test/test-app',
        github_url: 'https://github.com/test/test-app',
        build_command: 'npm run build',
        start_command: 'npm start',
        port: 3000,
    },
    VALID_DOMAIN: {
        domain_name: 'test.example.com',
        ssl_enabled: true,
    },
    GITHUB_WEBHOOK_PAYLOAD: {
        ref: 'refs/heads/main',
        repository: {
            id: 123456789,
            name: 'test-repo',
            full_name: 'testuser/test-repo',
            html_url: 'https://github.com/testuser/test-repo',
            clone_url: 'https://github.com/testuser/test-repo.git',
            private: false,
            owner: {
                login: 'testuser'
            }
        },
        head_commit: {
            id: 'abc123def456789',
            message: 'Test commit message',
            author: {
                name: 'Test User',
                email: 'test@example.com',
            },
            timestamp: '2024-01-15T10:30:00Z'
        },
        pusher: {
            name: 'testuser',
            email: 'test@example.com'
        }
    },
    GITHUB_INSTALLATION: {
        installation_id: 12345,
        account_login: 'testuser',
        account_type: 'User',
        permissions: {
            contents: 'read',
            metadata: 'read',
            pull_requests: 'read'
        },
        events: ['push', 'pull_request', 'release']
    },
};
