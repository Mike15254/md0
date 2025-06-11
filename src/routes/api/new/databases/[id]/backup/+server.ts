import { json, type RequestHandler } from '@sveltejs/kit';
import { dbUtils } from '$lib/server/database.js';
import { databaseService } from '$lib/service';

export const POST: RequestHandler = async ({ params, locals }) => {
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

		// Check if backup is enabled
		if (!instance.backup_enabled) {
			return json({ error: 'Backup is not enabled for this database' }, { status: 400 });
		}

		const result = await databaseService.createBackup(parseInt(params.id), Number(locals.user.id));

		if (result.success) {
			return json({
				success: true,
				backup: {
					started: true,
					backup_id: result.data?.backupId,
					message: result.message
				}
			});
		} else {
			return json({ error: result.error }, { status: 400 });
		}
	} catch (error) {
		console.error('Create database backup error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
