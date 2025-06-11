import { dataStore } from '$lib/stores/data.svelte';
import type { Project } from '$lib/types';

interface ProjectFilters {
	status?: string;
	runtime?: string;
	search?: string;
}

interface ProjectActions {
	deploy: (id: string) => Promise<void>;
	restart: (id: string) => Promise<void>;
	stop: (id: string) => Promise<void>;
	delete: (id: string) => Promise<void>;
	update: (id: string, updates: Partial<Project>) => Promise<void>;
}

class ProjectStore {
	private filters = $state<ProjectFilters>({});
	private actionLoading = $state<Record<string, string | null>>({});

	get projectFilters() {
		return this.filters;
	}

	get isActionLoading() {
		return (projectId: string, action?: string) => {
			if (action) {
				return this.actionLoading[projectId] === action;
			}
			return this.actionLoading[projectId] !== null;
		};
	}

	// Fetch projects with filters
	async getProjects(
		options: {
			limit?: number;
			offset?: number;
			refresh?: boolean;
		} = {}
	) {
		const params = new URLSearchParams();
		if (options.limit) params.set('limit', options.limit.toString());
		if (options.offset) params.set('offset', options.offset.toString());

		// Apply filters
		if (this.filters.status) params.set('status', this.filters.status);
		if (this.filters.runtime) params.set('runtime', this.filters.runtime);
		if (this.filters.search) params.set('search', this.filters.search);

		const key = `projects:${params.toString()}`;

		if (options.refresh) {
			dataStore.invalidate(key);
		}

		return dataStore.fetch(key, async () => {
			const response = await fetch(`/api/new/projects?${params}`);
			if (!response.ok) throw new Error('Failed to fetch projects');
			const result = await response.json();
			return {
				projects: result.data || [],
				pagination: result.pagination || { total: 0, hasMore: false }
			};
		});
	}

	// Get single project
	async getProject(id: string, refresh = false) {
		const key = `project:${id}`;

		if (refresh) {
			dataStore.invalidate(key);
		}

		return dataStore.fetch(key, async () => {
			const response = await fetch(`/api/new/projects/${id}`);
			if (!response.ok) throw new Error('Failed to fetch project');
			const result = await response.json();
			return result.data;
		});
	}

	// Get project templates and types
	async getTemplates() {
		return dataStore.fetch(
			'project-templates',
			async () => {
				const response = await fetch('/api/new/projects?templates=true');
				if (!response.ok) throw new Error('Failed to fetch templates');
				const result = await response.json();
				return result.data;
			},
			{ staleTime: 300000 }
		); // 5 minutes cache
	}

	// Create new project
	async createProject(projectData: any) {
		const response = await fetch('/api/new/projects', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(projectData)
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error || 'Failed to create project');
		}

		const result = await response.json();

		// Invalidate projects cache to refresh list
		dataStore.invalidateAll();

		return result.data;
	}

	// Project actions
	get actions(): ProjectActions {
		return {
			deploy: async (id: string) => {
				this.actionLoading[id] = 'deploy';
				try {
					const response = await fetch(`/api/new/projects/${id}/deploy`, {
						method: 'POST'
					});

					if (!response.ok) {
						const error = await response.json();
						throw new Error(error.error || 'Failed to deploy project');
					}

					// Optimistically update project status
					dataStore.optimisticUpdate(`project:${id}`, (project: Project | null) => {
						if (!project) {
							throw new Error(`Project with ID ${id} not found during optimistic update`);
						}
						return { ...project, status: 'building' as Project['status'] };
					});

					// Invalidate projects list to refresh
					dataStore.invalidate('projects:');

					return response.json();
				} finally {
					this.actionLoading[id] = null;
				}
			},

			restart: async (id: string) => {
				this.actionLoading[id] = 'restart';
				try {
					const response = await fetch(`/api/new/projects/${id}/restart`, {
						method: 'POST'
					});

					if (!response.ok) {
						const error = await response.json();
						throw new Error(error.error || 'Failed to restart project');
					}

					const result = await response.json();

					// Optimistically update project status
					dataStore.optimisticUpdate(`project:${id}`, (project: Project | null) => {
						if (!project) {
							throw new Error(`Project with ID ${id} not found during optimistic update`);
						}
						return {
							...project,
							status: (result.status as Project['status']) || ('running' as Project['status'])
						};
					});

					// Invalidate projects list to refresh
					dataStore.invalidate('projects:');

					return result;
				} finally {
					this.actionLoading[id] = null;
				}
			},

			stop: async (id: string) => {
				this.actionLoading[id] = 'stop';
				try {
					const response = await fetch(`/api/new/projects/${id}/stop`, {
						method: 'POST'
					});

					if (!response.ok) {
						const error = await response.json();
						throw new Error(error.error || 'Failed to stop project');
					}

					const result = await response.json();

					// Optimistically update project status
					dataStore.optimisticUpdate(`project:${id}`, (project: Project | null) => {
						if (!project) {
							throw new Error(`Project with ID ${id} not found during optimistic update`);
						}
						return {
							...project,
							status: (result.status as Project['status']) || ('stopped' as Project['status'])
						};
					});

					// Invalidate projects list to refresh
					dataStore.invalidate('projects:');

					return result;
				} finally {
					this.actionLoading[id] = null;
				}
			},

			delete: async (id: string) => {
				this.actionLoading[id] = 'delete';
				try {
					const response = await fetch(`/api/new/projects/${id}`, {
						method: 'DELETE'
					});

					if (!response.ok) {
						const error = await response.json();
						throw new Error(error.error || 'Failed to delete project');
					}

					// Remove from cache
					dataStore.invalidate(`project:${id}`);
					dataStore.invalidateAll(); // Refresh all project lists

					return response.json();
				} finally {
					this.actionLoading[id] = null;
				}
			},

			update: async (id: string, updates: Partial<Project>) => {
				this.actionLoading[id] = 'update';
				try {
					const response = await fetch(`/api/new/projects/${id}`, {
						method: 'PATCH',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(updates)
					});

					if (!response.ok) {
						const error = await response.json();
						throw new Error(error.error || 'Failed to update project');
					}

					const result = await response.json();

					// Update cache with new data
					dataStore.setData(`project:${id}`, result.data);
					dataStore.invalidate('projects:'); // Refresh lists

					return result.data;
				} finally {
					this.actionLoading[id] = null;
				}
			}
		};
	}

	// Filter methods
	setStatusFilter(status: string | undefined) {
		this.filters.status = status;
	}

	setRuntimeFilter(runtime: string | undefined) {
		this.filters.runtime = runtime;
	}

	setSearchFilter(search: string | undefined) {
		this.filters.search = search;
	}

	clearFilters() {
		this.filters = {};
	}

	// Utility methods
	getProjectsByStatus(projects: Project[]) {
		const statusCounts = {
			running: 0,
			stopped: 0,
			building: 0,
			failed: 0,
			pending: 0
		};

		projects.forEach((project) => {
			if (statusCounts.hasOwnProperty(project.status)) {
				statusCounts[project.status as keyof typeof statusCounts]++;
			}
		});

		return statusCounts;
	}

	getProjectsByRuntime(projects: Project[]) {
		const runtimeCounts: Record<string, number> = {};

		projects.forEach((project) => {
			const runtime = project.runtime || 'unknown';
			runtimeCounts[runtime] = (runtimeCounts[runtime] || 0) + 1;
		});

		return runtimeCounts;
	}
}

// Export singleton instance
export const projectStore = new ProjectStore();
