import { Lucia } from 'lucia';
import { PostgresJsAdapter } from '@lucia-auth/adapter-postgresql';
import { db } from '../server/database.js';
import bcrypt from 'bcryptjs';
import type { User } from '../service/types.js';

const adapter = new PostgresJsAdapter(db, {
    user: 'users',
    session: 'user_sessions'
});

export const lucia = new Lucia(adapter, {
    sessionCookie: {
        attributes: {
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
        }
    },
    getUserAttributes: (attributes) => {
        return {
            username: attributes.username,
            email: attributes.email,
            isAdmin: attributes.is_admin,
            githubInstallations: attributes.github_installations || []
        };
    }
});

declare module 'lucia' {
    interface Register {
        Lucia: typeof lucia;
        DatabaseUserAttributes: {
            username: string;
            email: string | null;
            is_admin: boolean;
            github_installations: number[];
        };
    }
}

export interface AuthenticatedUser {
    id: number;
    username: string;
    email?: string;
    isAdmin: boolean;
    githubInstallations: number[];
    created_at: Date;
    last_login?: Date;
}

export const authService = {
    /**
     * Hash password with bcrypt
     */
    async hashPassword(password: string): Promise<string> {
        return bcrypt.hash(password, 12); // Increased rounds for better security
    },

    /**
     * Verify password against hash
     */
    async verifyPassword(password: string, hash: string): Promise<boolean> {
        return bcrypt.compare(password, hash);
    },

    /**
     * Validate password strength
     */
    validatePassword(password: string): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        
        if (password.length < 8) {
            errors.push('Password must be at least 8 characters long');
        }
        
        if (!/[A-Z]/.test(password)) {
            errors.push('Password must contain at least one uppercase letter');
        }
        
        if (!/[a-z]/.test(password)) {
            errors.push('Password must contain at least one lowercase letter');
        }
        
        if (!/[0-9]/.test(password)) {
            errors.push('Password must contain at least one number');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    },

    /**
     * Create a new user account
     */
    async createUser(params: {
        username: string;
        password: string;
        email?: string;
        isAdmin?: boolean;
    }): Promise<{ success: boolean; user?: User; error?: string }> {
        try {
            // Validate input
            if (!params.username || params.username.length < 3) {
                return { success: false, error: 'Username must be at least 3 characters' };
            }

            const passwordValidation = this.validatePassword(params.password);
            if (!passwordValidation.valid) {
                return { success: false, error: passwordValidation.errors.join(', ') };
            }

            // Check if user exists
            const existingUser = await this.getUserByUsername(params.username);
            if (existingUser) {
                return { success: false, error: 'Username already exists' };
            }

            // Check email if provided
            if (params.email) {
                const existingEmail = await this.getUserByEmail(params.email);
                if (existingEmail) {
                    return { success: false, error: 'Email already exists' };
                }
            }

            // Hash password
            const passwordHash = await this.hashPassword(params.password);

            // Create user
            const result = await db`
                INSERT INTO users (username, password_hash, email, is_admin)
                VALUES (${params.username}, ${passwordHash}, ${params.email || null}, ${params.isAdmin || false})
                RETURNING id, username, email, is_admin, github_installations, created_at
            `;

            const user = result[0];
            return {
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    is_admin: user.is_admin,
                    github_installations: user.github_installations || [],
                    created_at: user.created_at,
                    updated_at: user.created_at
                }
            };
        } catch (error) {
            console.error('Create user error:', error);
            return { success: false, error: 'Failed to create user' };
        }
    },

    /**
     * Authenticate user and create session
     */
    async login(username: string, password: string): Promise<{
        success: boolean;
        user?: AuthenticatedUser;
        sessionId?: string;
        error?: string;
    }> {
        try {
            // Rate limiting check
            const user = await this.getUserByUsername(username);
            if (!user) {
                return { success: false, error: 'Invalid credentials' };
            }

            // Check if account is locked
            if (user.locked_until && new Date() < user.locked_until) {
                const unlockTime = new Date(user.locked_until).toLocaleString();
                return { success: false, error: `Account locked until ${unlockTime}` };
            }

            // Verify password
            const validPassword = await this.verifyPassword(password, user.password_hash);
            if (!validPassword) {
                // Increment failed attempts
                await this.incrementFailedAttempts(user.id);
                return { success: false, error: 'Invalid credentials' };
            }

            // Reset failed attempts and update last login
            await this.resetFailedAttempts(user.id);

            // Create session
            const session = await lucia.createSession(user.id.toString(), {});

            return {
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    isAdmin: user.is_admin,
                    githubInstallations: user.github_installations || [],
                    created_at: user.created_at,
                    last_login: user.last_login
                },
                sessionId: session.id
            };
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: 'Login failed' };
        }
    },

    /**
     * Validate session and get user
     */
    async validateSession(sessionId: string): Promise<{
        user: AuthenticatedUser | null;
        session: any;
    }> {
        const result = await lucia.validateSession(sessionId);
        
        if (!result.user) {
            return { user: null, session: result.session };
        }

        // Get full user details
        const user = await this.getUserById(parseInt(result.user.id));
        
        return {
            user: user ? {
                id: user.id,
                username: user.username,
                email: user.email,
                isAdmin: user.is_admin,
                githubInstallations: user.github_installations || [],
                created_at: user.created_at,
                last_login: user.last_login
            } : null,
            session: result.session
        };
    },

    /**
     * Logout user
     */
    async logout(sessionId: string): Promise<void> {
        await lucia.invalidateSession(sessionId);
    },

    /**
     * Get user by username
     */
    async getUserByUsername(username: string): Promise<any> {
        const result = await db`
            SELECT id, username, password_hash, email, is_admin, github_installations,
                   failed_login_attempts, locked_until, created_at, last_login
            FROM users 
            WHERE username = ${username}
        `;
        return result[0] || null;
    },

    /**
     * Get user by email
     */
    async getUserByEmail(email: string): Promise<any> {
        const result = await db`
            SELECT id, username, email, is_admin, github_installations, created_at, last_login
            FROM users 
            WHERE email = ${email}
        `;
        return result[0] || null;
    },

    /**
     * Get user by ID
     */
    async getUserById(id: number): Promise<any> {
        const result = await db`
            SELECT id, username, email, is_admin, github_installations, created_at, last_login
            FROM users 
            WHERE id = ${id}
        `;
        return result[0] || null;
    },

    /**
     * Update user's GitHub installations
     */
    async updateGitHubInstallations(userId: number, installationIds: number[]): Promise<void> {
        await db`
            UPDATE users 
            SET github_installations = ${installationIds}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ${userId}
        `;
    },

    /**
     * Check if user has access to resource
     */
    async hasAccess(userId: number, resourceType: 'project' | 'database' | 'domain', resourceId: number): Promise<boolean> {
        try {
            let query;
            
            switch (resourceType) {
                case 'project':
                    query = db`SELECT id FROM projects WHERE id = ${resourceId} AND created_by = ${userId}`;
                    break;
                case 'database':
                    query = db`SELECT id FROM database_instances WHERE id = ${resourceId} AND created_by = ${userId}`;
                    break;
                case 'domain':
                    query = db`
                        SELECT d.id FROM domains d 
                        JOIN projects p ON d.project_id = p.id 
                        WHERE d.id = ${resourceId} AND p.created_by = ${userId}
                    `;
                    break;
                default:
                    return false;
            }
            
            const result = await query;
            return result.length > 0;
        } catch {
            return false;
        }
    },

    /**
     * Increment failed login attempts
     */
    async incrementFailedAttempts(userId: number): Promise<void> {
        await db`
            UPDATE users 
            SET 
                failed_login_attempts = failed_login_attempts + 1,
                locked_until = CASE 
                    WHEN failed_login_attempts >= 4 THEN CURRENT_TIMESTAMP + INTERVAL '30 minutes'
                    ELSE locked_until
                END,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ${userId}
        `;
    },

    /**
     * Reset failed login attempts
     */
    async resetFailedAttempts(userId: number): Promise<void> {
        await db`
            UPDATE users 
            SET 
                failed_login_attempts = 0,
                locked_until = NULL,
                last_login = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ${userId}
        `;
    },

    /**
     * Create initial admin user if none exists
     */
    async createInitialAdmin(): Promise<void> {
        try {
            const adminExists = await db`SELECT id FROM users WHERE is_admin = true LIMIT 1`;
            
            if (adminExists.length === 0) {
                await this.createUser({
                    username: 'admin',
                    password: 'admin123!', // Should be changed on first login
                    email: 'admin@md0.local',
                    isAdmin: true
                });
                console.log('Initial admin user created: admin/admin123!');
            }
        } catch (error) {
            console.error('Failed to create initial admin:', error);
        }
    },

    lucia // Export lucia instance for middleware
};

// Export legacy auth object for backward compatibility
export const auth = authService;

// Helper function to require authentication
export function requireAuth(locals: any): AuthenticatedUser {
    if (!locals.user) {
        throw new Error('Authentication required');
    }
    return locals.user;
}

// Helper function to require admin access
export function requireAdmin(locals: any): AuthenticatedUser {
    const user = requireAuth(locals);
    if (!user.isAdmin) {
        throw new Error('Admin access required');
    }
    return user;
}

// Helper function to check resource ownership
export async function requireResourceAccess(
    locals: any, 
    resourceType: 'project' | 'database' | 'domain', 
    resourceId: number
): Promise<AuthenticatedUser> {
    const user = requireAuth(locals);
    
    if (user.isAdmin) {
        return user; // Admins have access to everything
    }
    
    const hasAccess = await authService.hasAccess(user.id, resourceType, resourceId);
    if (!hasAccess) {
        throw new Error('Access denied to this resource');
    }
    
    return user;
}
