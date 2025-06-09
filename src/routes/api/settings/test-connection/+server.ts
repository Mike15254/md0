import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth.js';
import { systemService } from '$lib/server/system.js';

export const POST: RequestHandler = async ({ locals }) => {
	try {
		const user = requireAuth(locals);

		// Test local system connectivity
		// Since the app is running locally, we test basic system commands
		const tests = [
			{ name: 'Docker', command: 'docker version' },
			{ name: 'Git', command: 'git --version' },
			{ name: 'System Info', command: 'uname -a' }
		];

		const results = [];
		let allPassed = true;

		for (const test of tests) {
			try {
				const result = await systemService.execCommand(test.command);
				if (result.code === 0) {
					results.push({
						name: test.name,
						status: 'passed',
						output: result.stdout.trim()
					});
				} else {
					results.push({
						name: test.name,
						status: 'failed',
						error: result.stderr || 'Command failed'
					});
					allPassed = false;
				}
			} catch (error) {
				results.push({
					name: test.name,
					status: 'failed',
					error: error instanceof Error ? error.message : 'Unknown error'
				});
				allPassed = false;
			}
		}

		return json({
			success: allPassed,
			message: allPassed ? 'All system tests passed' : 'Some system tests failed',
			details: results
		});
	} catch (error) {
		console.error('Test connection error:', error);
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Failed to test system connectivity'
		}, { status: 500 });
	}
};
