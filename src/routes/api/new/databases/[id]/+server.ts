import { json, type RequestHandler } from '@sveltejs/kit';
import { dbUtils } from '$lib/server/database.js';

export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		if (!locals.user) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}

		if (!params.id) {
			return json({ error: 'Domain ID is required' }, { status: 400 });
		}

		const instance = await dbUtils.getDatabaseInstance(params.id);
		if (!instance) {
			return json({ error: 'Database instance not found' }, { status: 404 });
		}

		if (!locals.user.isAdmin && instance.created_by !== locals.user.id) {
			return json({ error: 'Permission denied' }, { status: 403 });
		}

		return json({
			success: true,
			data: instance
		});
	} catch (error) {
		console.error('Get database instance error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
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

		const updates = await request.json();
		
		// Prevent changing database type
		if (updates.type && updates.type !== instance.type) {
			return json({ error: 'Database type cannot be changed' }, { status: 400 });
		}

		const updatedInstance = await dbUtils.updateDatabaseInstance(params.id, updates);

		return json({
			success: true,
			data: updatedInstance
		});
	} catch (error) {
		console.error('Update database instance error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

// Support both PUT and PATCH methods
export const PUT: RequestHandler = PATCH;

export const DELETE: RequestHandler = async ({ params, locals }) => {
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

		// Prevent deleting running databases
		if (instance.status === 'running') {
			return json({ error: 'Cannot delete running database. Stop it first.' }, { status: 400 });
		}

		await dbUtils.deleteDatabaseInstance(params.id);

		return json({
			success: true,
			message: 'Database instance deleted successfully'
		});
	} catch (error) {
		console.error('Delete database instance error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
