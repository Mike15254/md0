import { json, type RequestHandler } from '@sveltejs/kit';
import { realtimeService } from '$lib/service/realtime.js';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		if (!locals.user) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}

		const stats = await realtimeService.getRealtimeStats();

		return json({
			success: true,
			data: stats.data
		});
	} catch (error) {
		console.error('Get realtime stats error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
