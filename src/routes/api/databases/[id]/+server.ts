import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dbUtils } from '$lib/server/database';

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const database = await dbUtils.getDatabaseInstance(params.id);
		
		if (!database) {
			return json({ error: 'Database not found' }, { status: 404 });
		}

		if (database.user_id !== locals.user.id) {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		// TODO: Implement actual database container deletion logic here
		// For now, we'll just delete from the database
		await dbUtils.deleteDatabaseInstance(params.id);

		return json({ success: true });
	} catch (error) {
		console.error('Error deleting database:', error);
		return json({ error: 'Failed to delete database' }, { status: 500 });
	}
};
