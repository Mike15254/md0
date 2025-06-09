import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { dbUtils } from '$lib/server/database';

export const load: PageServerLoad = async ({ params }) => {
	const project = await dbUtils.getProject(params.id);
	
	if (!project) {
		throw error(404, 'Project not found');
	}

	// Get deployment logs
	const logs = await dbUtils.getDeploymentLogs(params.id, 50);

	return {
		project,
		logs
	};
};
