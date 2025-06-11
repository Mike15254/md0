// Store for data management with smart caching and loading states
// Implements optimistic updates and background sync

interface DataState<T> {
	data: T | null;
	loading: boolean;
	error: string | null;
	lastFetch: number | null;
	staleTime: number; // Time in ms before data is considered stale
}

interface CacheEntry<T> {
	data: T;
	timestamp: number;
	staleTime: number;
}

// Create reactive state class with proper Svelte 5 $state usage
class ReactiveDataState<T> {
	data = $state<T | null>(null);
	loading = $state(false);
	error = $state<string | null>(null);
	lastFetch = $state<number | null>(null);
	staleTime: number;

	constructor(staleTime: number) {
		this.staleTime = staleTime;
	}
}

class DataStore {
	private cache = new Map<string, CacheEntry<any>>();
	private states = new Map<string, ReactiveDataState<any>>();
	private fetchPromises = new Map<string, Promise<any>>();

	// Default stale time (5 minutes)
	private defaultStaleTime = 5 * 60 * 1000;

	// Get reactive state for a key
	getState<T>(key: string): ReactiveDataState<T> {
		if (!this.states.has(key)) {
			const state = new ReactiveDataState<T>(this.defaultStaleTime);
			this.states.set(key, state);
		}
		return this.states.get(key)!;
	}

	// Check if data is stale
	private isStale(key: string): boolean {
		const entry = this.cache.get(key);
		if (!entry) return true;
		
		return Date.now() - entry.timestamp > entry.staleTime;
	}

	// Generic fetch with caching
	async fetch<T>(
		key: string, 
		fetcher: () => Promise<T>, 
		options: { 
			staleTime?: number; 
			force?: boolean;
			background?: boolean;
		} = {}
	): Promise<T> {
		const state = this.getState<T>(key);
		const { staleTime = this.defaultStaleTime, force = false, background = false } = options;

		// Return cached data if not stale and not forced
		if (!force && !this.isStale(key)) {
			const cached = this.cache.get(key);
			if (cached) {
				state.data = cached.data;
				state.error = null;
				return cached.data;
			}
		}

		// Check if there's already a fetch in progress
		if (this.fetchPromises.has(key)) {
			return this.fetchPromises.get(key)!;
		}

		// Set loading state (unless background fetch)
		if (!background) {
			state.loading = true;
			state.error = null;
		}

		const fetchPromise = fetcher()
			.then(data => {
				// Update cache
				this.cache.set(key, {
					data,
					timestamp: Date.now(),
					staleTime
				});

				// Update state
				state.data = data;
				state.error = null;
				state.lastFetch = Date.now();

				return data;
			})
			.catch(error => {
				console.error(`Fetch error for ${key}:`, error);
				state.error = error.message || 'Failed to fetch data';
				throw error;
			})
			.finally(() => {
				state.loading = false;
				this.fetchPromises.delete(key);
			});

		this.fetchPromises.set(key, fetchPromise);
		return fetchPromise;
	}

	// Optimistic update
	optimisticUpdate<T>(key: string, updater: (current: T | null) => T) {
		const state = this.getState<T>(key);
		const newData = updater(state.data);
		
		state.data = newData;
		
		// Update cache too
		this.cache.set(key, {
			data: newData,
			timestamp: Date.now(),
			staleTime: this.defaultStaleTime
		});
	}

	// Invalidate cache for a key
	invalidate(key: string) {
		this.cache.delete(key);
		const state = this.states.get(key);
		if (state) {
			state.lastFetch = null;
		}
	}

	// Invalidate all cache
	invalidateAll() {
		this.cache.clear();
		this.states.forEach(state => {
			state.lastFetch = null;
		});
	}

	// Prefetch data
	async prefetch<T>(key: string, fetcher: () => Promise<T>, staleTime?: number) {
		if (!this.isStale(key)) return;
		
		return this.fetch(key, fetcher, { 
			staleTime, 
			background: true 
		}).catch(() => {
			// Ignore prefetch errors
		});
	}

	// Set data directly (for server-side hydration)
	setData<T>(key: string, data: T, staleTime?: number) {
		const state = this.getState<T>(key);
		
		state.data = data;
		state.loading = false;
		state.error = null;
		state.lastFetch = Date.now();

		this.cache.set(key, {
			data,
			timestamp: Date.now(),
			staleTime: staleTime || this.defaultStaleTime
		});
	}
}

// Export singleton instance
export const dataStore = new DataStore();

// Common API helpers using only /api/new/ endpoints
export const api = {
	// Authentication
	async getSession() {
		return dataStore.fetch('session', async () => {
			const response = await fetch('/api/new/auth/session');
			if (!response.ok) throw new Error('Not authenticated');
			const result = await response.json();
			return result.user;
		}, { staleTime: 60000 }); // 1 minute
	},

	// Projects
	async getProjects(options: { limit?: number; offset?: number; templates?: boolean } = {}) {
		const params = new URLSearchParams();
		if (options.limit) params.set('limit', options.limit.toString());
		if (options.offset) params.set('offset', options.offset.toString());
		if (options.templates) params.set('templates', 'true');
		
		const key = `projects:${params.toString()}`;
		return dataStore.fetch(key, async () => {
			const response = await fetch(`/api/new/projects?${params}`);
			if (!response.ok) throw new Error('Failed to fetch projects');
			const result = await response.json();
			return result.data || [];
		});
	},

	async getProject(id: string) {
		return dataStore.fetch(`project:${id}`, async () => {
			const response = await fetch(`/api/new/projects/${id}`);
			if (!response.ok) throw new Error('Failed to fetch project');
			const result = await response.json();
			return result.data;
		});
	},

	async getProjectStats() {
		return dataStore.fetch('project-stats', async () => {
			const response = await fetch('/api/new/projects/stats');
			if (!response.ok) throw new Error('Failed to fetch project stats');
			const result = await response.json();
			return result.data;
		}, { staleTime: 30000 }); // 30 seconds
	},

	async getProjectLogs(id: string) {
		return dataStore.fetch(`project-logs:${id}`, async () => {
			const response = await fetch(`/api/new/projects/${id}/logs`);
			if (!response.ok) throw new Error('Failed to fetch project logs');
			const result = await response.json();
			return result.data;
		}, { staleTime: 10000 }); // 10 seconds for logs
	},

	// Databases
	async getDatabases() {
		return dataStore.fetch('databases', async () => {
			const response = await fetch('/api/new/databases');
			if (!response.ok) throw new Error('Failed to fetch databases');
			const result = await response.json();
			return result.data || [];
		});
	},

	async getDatabase(id: string) {
		return dataStore.fetch(`database:${id}`, async () => {
			const response = await fetch(`/api/new/databases/${id}`);
			if (!response.ok) throw new Error('Failed to fetch database');
			const result = await response.json();
			return result.data;
		});
	},

	// VPS & System
	async getVPSMetrics() {
		return dataStore.fetch('vps-metrics', async () => {
			const response = await fetch('/api/new/vps/metrics');
			if (!response.ok) throw new Error('Failed to fetch VPS metrics');
			const result = await response.json();
			return result.data;
		}, { staleTime: 30000 }); // 30 seconds for metrics
	},

	async getVPSInfo() {
		return dataStore.fetch('vps-info', async () => {
			const response = await fetch('/api/new/vps/info');
			if (!response.ok) throw new Error('Failed to fetch VPS info');
			const result = await response.json();
			return result.data;
		}, { staleTime: 300000 }); // 5 minutes for system info
	},

	async getVPSContainers() {
		return dataStore.fetch('vps-containers', async () => {
			const response = await fetch('/api/new/vps/containers');
			if (!response.ok) throw new Error('Failed to fetch containers');
			const result = await response.json();
			return result.data;
		}, { staleTime: 15000 }); // 15 seconds
	},

	// Domains
	async getDomains(projectId?: number) {
		const params = projectId ? `?project_id=${projectId}` : '';
		const key = `domains${params}`;
		return dataStore.fetch(key, async () => {
			const response = await fetch(`/api/new/domains${params}`);
			if (!response.ok) throw new Error('Failed to fetch domains');
			const result = await response.json();
			return result.data || [];
		});
	},

	// Settings
	async getSettings() {
		return dataStore.fetch('settings', async () => {
			const response = await fetch('/api/new/settings');
			if (!response.ok) throw new Error('Failed to fetch settings');
			const result = await response.json();
			return result.data;
		}, { staleTime: 60000 }); // 1 minute
	},

	// Real-time data
	async getRealtimeStats() {
		return dataStore.fetch('realtime-stats', async () => {
			const response = await fetch('/api/new/realtime/stats');
			if (!response.ok) throw new Error('Failed to fetch realtime stats');
			const result = await response.json();
			return result.data;
		}, { staleTime: 5000 }); // 5 seconds for realtime
	},

	// API Endpoints info
	async getApiEndpoints() {
		return dataStore.fetch('api-endpoints', async () => {
			const response = await fetch('/api/new/endpoints');
			if (!response.ok) throw new Error('Failed to fetch API endpoints');
			const result = await response.json();
			return result.data;
		}, { staleTime: 3600000 }); // 1 hour for API docs
	}
};
