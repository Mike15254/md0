import type { ClientUser } from '$lib/types.js';

interface AuthState {
	user: ClientUser | null;
	loading: boolean;
	initialized: boolean;
}

class AuthStore {
	private state = $state<AuthState>({
		user: null,
		loading: false,
		initialized: false
	});

	// Reactive getters
	get user() {
		return this.state.user;
	}

	get isAuthenticated() {
		return this.state.user !== null;
	}

	get isAdmin() {
		return this.state.user?.isAdmin ?? false;
	}

	get loading() {
		return this.state.loading;
	}

	get initialized() {
		return this.state.initialized;
	}

	// Initialize auth state (called from layout)
	init(user: ClientUser | null) {
		this.state.user = user;
		this.state.initialized = true;
	}

	// Login action
	async login(username: string, password: string): Promise<{ success: boolean; error?: string }> {
		this.state.loading = true;
		
		try {
			const response = await fetch('/api/new/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username, password })
			});

			const result = await response.json();

			if (result.success && result.user) {
				this.state.user = result.user;
				return { success: true };
			} else {
				return { success: false, error: result.error || 'Login failed' };
			}
		} catch (error) {
			console.error('Login error:', error);
			return { success: false, error: 'Network error. Please try again.' };
		} finally {
			this.state.loading = false;
		}
	}

	// Logout action
	async logout(): Promise<void> {
		this.state.loading = true;
		
		try {
			await fetch('/api/new/auth/logout', {
				method: 'POST'
			});
		} catch (error) {
			console.error('Logout error:', error);
		} finally {
			this.state.user = null;
			this.state.loading = false;
		}
	}

	// Update user data (for profile updates, etc.)
	updateUser(userData: Partial<ClientUser>) {
		if (this.state.user) {
			this.state.user = { ...this.state.user, ...userData };
		}
	}
}

// Export singleton instance
export const authStore = new AuthStore();
