import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dbUtils } from '$lib/server/database';

export const POST: RequestHandler = async ({ params, locals }) => {
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

		const action = params.action;
		let newStatus = database.status;

		switch (action) {
			case 'start':
				if (database.status === 'stopped') {
					newStatus = 'starting';
					// TODO: Implement actual database start logic
					setTimeout(async () => {
						await dbUtils.updateDatabaseInstance(params.id, { status: 'running' });
					}, 3000);
				}
				break;
			case 'stop':
				if (database.status === 'running') {
					newStatus = 'stopping';
					// TODO: Implement actual database stop logic
					setTimeout(async () => {
						await dbUtils.updateDatabaseInstance(params.id, { status: 'stopped' });
					}, 2000);
				}
				break;
			case 'backup':
				if (database.status === 'running') {
					// TODO: Implement actual database backup logic
					await dbUtils.logDeployment({
						project_id: '0', // Use '0' for system/database logs
						message: `Database backup created for ${database.name}`,
						log_type: 'info'
					});
				}
				break;
			default:
				return json({ error: 'Invalid action' }, { status: 400 });
		}

		if (newStatus !== database.status) {
			await dbUtils.updateDatabaseInstance(params.id, { status: newStatus });
		}

		return json({ success: true });
	} catch (error) {
		console.error('Error performing database action:', error);
		return json({ error: 'Failed to perform database action' }, { status: 500 });
	}
};
