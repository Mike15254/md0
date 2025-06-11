import { json } from '@sveltejs/kit';
import { vpsService } from '$lib/service/vps.js';
import { type RequestEvent } from "@sveltejs/kit";

export const GET = async ({ locals, url }: RequestEvent) => {
	try {
		if (!locals.user?.isAdmin) {
			return json({ error: 'Admin access required' }, { status: 403 });
		}

		const limit = parseInt(url.searchParams.get('limit') || '100');
		const result = await vpsService.getHistoricalMetrics(limit);

		if (!result.success) {
			return json({ error: result.message }, { status: 500 });
		}

		return json({
			success: true,
			data: result.data
		});
	} catch (error) {
		console.error('Get historical metrics error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
