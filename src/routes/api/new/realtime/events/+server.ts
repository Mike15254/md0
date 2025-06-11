import { text } from '@sveltejs/kit';
import { realtimeService } from '$lib/service/realtime.js';
import { type RequestEvent } from "@sveltejs/kit";

export const GET = async ({ locals, url }: RequestEvent) => {
	if (!locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}

	// Create SSE stream using the service's createSSEConnection method
	const stream = realtimeService.createSSEConnection(Number(locals.user.id));

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Headers': 'Cache-Control'
		}
	});
};
