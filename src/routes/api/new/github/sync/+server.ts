import { json } from '@sveltejs/kit';
import { GitHubService } from '$lib/service/github.js';
import { type RequestEvent } from "@sveltejs/kit";

export const POST = async ({ locals }: RequestEvent) => {
	try {
		if (!locals.user) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}

		const githubService = new GitHubService();
		
		// Check if GitHub App is configured
		const isConfigured = await githubService.isConfigured();
		if (!isConfigured) {
			return json({ 
				success: false,
				error: 'GitHub App not configured. Please configure in settings first.' 
			}, { status: 400 });
		}

		// Sync installations from GitHub API
		const result = await githubService.syncInstallations();
		
		if (result.success) {
			return json({
				success: true,
				data: result.data,
				message: 'GitHub installations synced successfully'
			});
		} else {
			return json({ 
				success: false,
				error: result.error 
			}, { status: 500 });
		}
	} catch (error) {
		console.error('GitHub App sync error:', error);
		return json({ 
			success: false,
			error: 'Failed to sync GitHub installations' 
		}, { status: 500 });
	}
};
