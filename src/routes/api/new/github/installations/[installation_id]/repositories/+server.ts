import { json } from '@sveltejs/kit';
import { GitHubService } from '$lib/service/github.js';
import { type RequestEvent } from "@sveltejs/kit";

export const GET = async ({ params, locals }: RequestEvent) => {
	try {
		if (!locals.user) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}

		if (!params.installation_id) {
			return json({ error: 'Installation ID is required' }, { status: 400 });
		}
		
		const installationId = parseInt(params.installation_id);
		if (isNaN(installationId) || installationId <= 0) {
			return json({ error: 'Invalid installation ID' }, { status: 400 });
		}

		const githubService = new GitHubService();
		const result = await githubService.getInstallationRepositories(installationId);

		if (!result.success) {
			return json({ error: result.error || 'Failed to get repositories' }, { status: 500 });
		}

		return json({
			success: true,
			data: result.data
		});
	} catch (error) {
		console.error('Get repositories error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
