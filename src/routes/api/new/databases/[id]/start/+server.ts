import { json } from '@sveltejs/kit';
import { dbUtils } from '$lib/server/database.js';
import { type RequestEvent } from "@sveltejs/kit";
import { databaseService } from '$lib/service';

export const POST = async ({ params, locals }: RequestEvent) => {
	try {
		if (!locals.user) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}

		if (!params.id) {
			return json({ error: 'Database ID is required' }, { status: 400 });
		}
		
		const instance = await dbUtils.getDatabaseInstance(params.id);
		if (!instance) {
			return json({ error: 'Database instance not found' }, { status: 404 });
		}

		if (!locals.user.isAdmin && instance.created_by !== locals.user.id) {
			return json({ error: 'Permission denied' }, { status: 403 });
		}
		const result = await databaseService.startInstance(parseInt(params.id), Number(locals.user.id));

		if (result.success) {
			await dbUtils.updateDatabaseInstance(params.id, {
				status: 'running',
				container_id: result.data?.containerId
			});

			// Get updated instance
			const updatedInstance = await dbUtils.getDatabaseInstance(params.id);

			return json({
				success: result.success,
				message: result.message,
				data: updatedInstance
			});
		} else {
			return json({ 
				success: false, 
				error: result.error 
			}, { status: 400 });
		}
	} catch (error) {
		console.error('Start database instance error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
