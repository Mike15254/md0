import { json } from '@sveltejs/kit';
import { dbUtils } from '$lib/server/database.js';
import { type RequestEvent } from "@sveltejs/kit";

export const GET = async ({ locals, url }: RequestEvent) => {
	try {
		if (!locals.user?.isAdmin) {
			return json({ error: 'Admin access required' }, { status: 403 });
		}

		const category = url.searchParams.get('category');
		const settings = await dbUtils.getSettings();

		const filteredSettings = category ? 
			settings.filter(s => s.category === category) : 
			settings;

		const groupedSettings = filteredSettings.reduce((acc, setting) => {
			if (!acc[setting.category]) {
				acc[setting.category] = {};
			}
			acc[setting.category][setting.key] = {
				value: setting.value,
				type: setting.type
			};
			return acc;
		}, {} as Record<string, Record<string, { value: string; type: string }>>);

		return json({
			success: true,
			data: groupedSettings
		});
	} catch (error) {
		console.error('Get settings error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

export const POST = async ({ request, locals }: RequestEvent) => {
	try {
		if (!locals.user?.isAdmin) {
			return json({ error: 'Admin access required' }, { status: 403 });
		}

		const { category, key, value, type = 'string' } = await request.json();

		if (!category || !key || value === undefined) {
			return json({ error: 'Category, key, and value are required' }, { status: 400 });
		}

		await dbUtils.updateSetting(category, key, value, type);

		return json({
			success: true,
			message: 'Setting updated successfully'
		});
	} catch (error) {
		console.error('Update setting error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

export const PATCH = async ({ request, locals }: RequestEvent) => {
	try {
		if (!locals.user?.isAdmin) {
			return json({ error: 'Admin access required' }, { status: 403 });
		}

		const settings = await request.json();

		for (const [category, categorySettings] of Object.entries(settings)) {
			for (const [key, setting] of Object.entries(categorySettings as Record<string, any>)) {
				await dbUtils.updateSetting(category, key, setting.value, setting.type || 'string');
			}
		}

		return json({
			success: true,
			message: 'Settings updated successfully'
		});
	} catch (error) {
		console.error('Bulk update settings error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
