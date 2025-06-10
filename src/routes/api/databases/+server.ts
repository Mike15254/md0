import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { dbUtils } from '$lib/server/database.js';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const databases = await dbUtils.getDatabaseInstances(Number(locals.user.id));
		return json(databases);
	} catch (error) {
		console.error('Error fetching databases:', error);
		return json({ error: 'Failed to fetch databases' }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const data = await request.json();
		
		// Validate required fields
		if (!data.name || !data.type) {
			return json({ error: 'Name and type are required' }, { status: 400 });
		}

		// Create database instance
		const databaseId = await dbUtils.createDatabaseInstance({
			created_by: Number(locals.user.id),
			name: data.name,
			type: data.type,
			port: data.port || 5432,
			config: {
				version: data.version || '15',
				memory_limit: data.memory_limit || 512,
				storage_limit: data.storage_limit || 10,
				status: 'creating'
			}
		});

		// TODO: Implement actual database container creation logic here
		// For now, we'll simulate by updating status to 'running'
		setTimeout(async () => {
			await dbUtils.updateDatabaseInstance(databaseId.toString(), { status: 'running' });
		}, 2000);

		const database = await dbUtils.getDatabaseInstance(databaseId.toString());
		return json(database, { status: 201 });
	} catch (error) {
		console.error('Error creating database:', error);
		return json({ error: 'Failed to create database' }, { status: 500 });
	}
};
