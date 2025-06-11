import { json } from '@sveltejs/kit';
import { vpsService } from '$lib/service/vps.js';
import { type RequestEvent } from "@sveltejs/kit";

export const GET = async ({ locals }: RequestEvent) => {
	try {
		if (!locals.user?.isAdmin) {
			return json({ error: 'Admin access required' }, { status: 403 });
		}

		const result = await vpsService.getContainers();

		if (!result.success) {
			return json({ error: result.message }, { status: 500 });
		}

		return json({
			success: true,
			data: result.data
		});
	} catch (error) {
		console.error('Get containers error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
