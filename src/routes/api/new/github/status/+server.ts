import { json } from '@sveltejs/kit';
import { GitHubService } from '$lib/service/github.js';
import { type RequestEvent } from "@sveltejs/kit";

export const GET = async ({ locals }: RequestEvent) => {
	try {
		if (!locals.user) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}

		const githubService = new GitHubService();
		const result = await githubService.getAppStatus();
		
		if (result.success) {
			return json({
				success: true,
				data: result.data
			});
		} else {
			return json({ 
				success: false,
				error: result.error 
			}, { status: 500 });
		}
	} catch (error) {
		console.error('GitHub App status error:', error);
		return json({ 
			success: false,
			error: 'Failed to get GitHub App status' 
		}, { status: 500 });
	}
};
