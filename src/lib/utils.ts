import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, "child"> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, "children"> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithElementRef<T> = T & { ref?: any };

// MD0 Deployment Dashboard Utilities

export function formatBytes(bytes: number, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
        return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}

export function formatDate(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
}

export function formatRelativeTime(date: Date | string): string {
    const now = new Date();
    const then = new Date(date);
    const diffInSeconds = Math.floor((now.getTime() - then.getTime()) / 1000);

    if (diffInSeconds < 60) return 'just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    
    return formatDate(date);
}

export function getStatusColor(status: string): string {
    switch (status.toLowerCase()) {
        case 'running':
            return 'text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950 dark:border-green-800';
        case 'stopped':
            return 'text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950 dark:border-red-800';
        case 'building':
        case 'deploying':
            return 'text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950 dark:border-blue-800';
        case 'failed':
            return 'text-orange-700 bg-orange-50 border-orange-200 dark:text-orange-400 dark:bg-orange-950 dark:border-orange-800';
        case 'pending':
            return 'text-yellow-700 bg-yellow-50 border-yellow-200 dark:text-yellow-400 dark:bg-yellow-950 dark:border-yellow-800';
        default:
            return 'text-gray-700 bg-gray-50 border-gray-200 dark:text-gray-300 dark:bg-gray-800 dark:border-gray-600';
    }
}

export function getStatusIcon(status: string): string {
    switch (status.toLowerCase()) {
        case 'running':
            return '●';
        case 'stopped':
            return '○';
        case 'building':
            return '◐';
        case 'failed':
            return '✕';
        default:
            return '?';
    }
}

export function extractRepoName(githubUrl: string): string {
    try {
        const url = new URL(githubUrl);
        const pathParts = url.pathname.split('/').filter(Boolean);
        return pathParts[pathParts.length - 1]?.replace('.git', '') || 'unknown';
    } catch {
        return 'unknown';
    }
}

export function validateGitHubUrl(url: string): boolean {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname === 'github.com' && urlObj.pathname.includes('/');
    } catch {
        return false;
    }
}

export function generateRandomPort(): number {
    return Math.floor(Math.random() * (9999 - 3000 + 1)) + 3000;
}

export function sanitizeProjectName(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 50);
}

export function validateProjectName(name: string): string | null {
    if (!name || name.length < 2) {
        return 'Project name must be at least 2 characters long';
    }
    if (name.length > 50) {
        return 'Project name must be less than 50 characters';
    }
    if (!/^[a-zA-Z0-9-_]+$/.test(name)) {
        return 'Project name can only contain letters, numbers, hyphens, and underscores';
    }
    return null;
}

export function validateEnvironmentVariables(envVars: Record<string, string>): string | null {
    for (const [key, value] of Object.entries(envVars)) {
        if (!key || key.trim() === '') {
            return 'Environment variable keys cannot be empty';
        }
        if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
            return `Invalid environment variable key: ${key}. Use uppercase letters, numbers, and underscores only.`;
        }
        if (value.length > 1000) {
            return `Environment variable value for ${key} is too long (max 1000 characters)`;
        }
    }
    return null;
}

export function parseEnvString(envString: string): Record<string, string> {
    const envVars: Record<string, string> = {};
    const lines = envString.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    
    for (const line of lines) {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
            envVars[key.trim()] = valueParts.join('=').trim();
        }
    }
    
    return envVars;
}

export function stringifyEnvVars(envVars: Record<string, string>): string {
    return Object.entries(envVars)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
}

export function debounce<T extends (...args: any[]) => void>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

export function throttle<T extends (...args: any[]) => void>(
    func: T,
    limit: number
): (...args: Parameters<T>) => void {
    let inThrottle: boolean;
    return (...args: Parameters<T>) => {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => (inThrottle = false), limit);
        }
    };
}
