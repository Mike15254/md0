import { json } from '@sveltejs/kit';
import { dbUtils } from '$lib/server/database.js';
import { type RequestEvent } from "@sveltejs/kit";

export const GET = async ({ locals, url }: RequestEvent) => {
	try {
		if (!locals.user) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}

		const userId = locals.user.isAdmin ? undefined : Number(locals.user.id);
		const instances = await dbUtils.getDatabaseInstances(userId);

		return json({
			success: true,
			data: instances
		});
	} catch (error) {
		console.error('Get database instances error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

export const POST = async ({ request, locals }: RequestEvent) => {
	try {
		if (!locals.user) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}

		const {
			name,
			type,
			port,
			config = {},
			memory_limit = 512,
			storage_limit = 1024
		} = await request.json();

		if (!name || !type) {
			return json({ error: 'Name and type required' }, { status: 400 });
		}

		if (!['postgresql', 'pocketbase'].includes(type)) {
			return json({ error: 'Invalid database type' }, { status: 400 });
		}

		// Validate port range if provided
		if (port && (port < 1024 || port > 65535)) {
			return json({ error: 'Invalid port number. Must be between 1024 and 65535' }, { status: 400 });
		}

		// Validate memory limit if provided
		if (memory_limit && (memory_limit < 64 || memory_limit > 16384)) {
			return json({ error: 'Invalid memory limit. Must be between 64MB and 16GB' }, { status: 400 });
		}

		// Validate storage limit if provided
		if (storage_limit && (storage_limit < 100 || storage_limit > 102400)) {
			return json({ error: 'Invalid storage limit. Must be between 100MB and 100GB' }, { status: 400 });
		}

		// Check for duplicate name for this user
		const existingInstances = await dbUtils.getDatabaseInstances(Number(locals.user.id));
		const duplicateExists = existingInstances.some(instance => instance.name === name);
		
		if (duplicateExists) {
			return json({ error: 'Database instance with this name already exists' }, { status: 409 });
		}

		const instance = await dbUtils.createDatabaseInstance({
			name,
			type,
			port,
			config: {
				...config,
				memory_limit,
				storage_limit
			},
			created_by: Number(locals.user.id)
		});

		return json({
			success: true,
			data: instance
		});
	} catch (error) {
		console.error('Create database instance error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
