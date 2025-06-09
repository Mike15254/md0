import { Lucia } from 'lucia';
import { PostgresJsAdapter } from '@lucia-auth/adapter-postgresql';
import { db } from './database.js';
import bcrypt from 'bcryptjs';

const adapter = new PostgresJsAdapter(db, {
    user: 'users',
    session: 'user_sessions'
});

export const lucia = new Lucia(adapter, {
    sessionCookie: {
        attributes: {
            secure: process.env.NODE_ENV === 'production'
        }
    },
    getUserAttributes: (attributes) => {
        return {
            username: attributes.username,
            email: attributes.email,
            isAdmin: attributes.is_admin
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
        };
    }
}

export const auth = {
    async hashPassword(password: string): Promise<string> {
        return bcrypt.hash(password, 10);
    },

    async verifyPassword(password: string, hash: string): Promise<boolean> {
        return bcrypt.compare(password, hash);
    },

    async createSession(userId: string) {
        return lucia.createSession(userId, {});
    },

    async validateSession(sessionId: string) {
        return lucia.validateSession(sessionId);
    },

    async invalidateSession(sessionId: string) {
        return lucia.invalidateSession(sessionId);
    },

    lucia // Export lucia instance
};

// Helper function to require authentication
export function requireAuth(locals: any) {
    if (!locals.user) {
        throw new Error('Authentication required');
    }
    return locals.user;
}
