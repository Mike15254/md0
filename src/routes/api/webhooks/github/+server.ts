import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, execute } from '$lib/server/database.js';
import { createHash, createHmac } from 'crypto';

interface GitHubWebhookPayload {
	ref: string;
	repository: {
		full_name: string;
		clone_url: string;
		html_url: string;
	};
	head_commit: {
		id: string;
		message: string;
		author: {
			name: string;
			email: string;
		};
		timestamp: string;
	};
	pusher: {
		name: string;
		email: string;
	};
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.text();
		const signature = request.headers.get('x-hub-signature-256');
		const githubEvent = request.headers.get('x-github-event');

		// Get webhook secret from settings
		const secretResult = await query(
			`SELECT value FROM settings WHERE category = 'system' AND key = 'webhook_secret'`
		);
		
		const webhookSecret = secretResult[0]?.value;
		
		if (!webhookSecret) {
			console.error('Webhook secret not configured');
			return json({ error: 'Webhook not configured' }, { status: 500 });
		}

		// Verify webhook signature
		if (signature) {
			const expectedSignature = 'sha256=' + createHmac('sha256', webhookSecret).update(body).digest('hex');
			if (signature !== expectedSignature) {
				console.error('Invalid webhook signature');
				return json({ error: 'Invalid signature' }, { status: 401 });
			}
		}

		// Only handle push events
		if (githubEvent !== 'push') {
			return json({ message: 'Event ignored' });
		}

		const payload: GitHubWebhookPayload = JSON.parse(body);
		
		// Check if this is a push to main/master branch
		const pushedBranch = payload.ref.replace('refs/heads/', '');
		
		// Get auto-deploy setting
		const autoDeployResult = await query(
			`SELECT value FROM settings WHERE category = 'github' AND key = 'auto_deploy'`
		);
		
		const autoDeployEnabled = autoDeployResult[0]?.value === 'true';
		
		if (!autoDeployEnabled) {
			return json({ message: 'Auto-deploy disabled' });
		}

		// Find project by GitHub URL
		const projectResult = await query(
			`SELECT id, name, github_branch, status FROM projects 
			 WHERE github_url = $1 OR github_url = $2`,
			[payload.repository.clone_url, payload.repository.html_url]
		);

		if (projectResult.length === 0) {
			console.log('No project found for repository:', payload.repository.full_name);
			return json({ message: 'No matching project found' });
		}

		const project = projectResult[0];
		
		// Check if the push is to the project's configured branch
		if (project.github_branch !== pushedBranch) {
			console.log(`Push to ${pushedBranch}, but project configured for ${project.github_branch}`);
			return json({ message: 'Branch mismatch' });
		}

		// Log the webhook event
		await execute(
			`INSERT INTO deployment_logs (project_id, log_type, message) 
			 VALUES ($1, 'info', $2)`,
			[project.id, `Webhook received: ${payload.head_commit.message} by ${payload.pusher.name}`]
		);

		// Start deployment process
		await deployProject(project.id, payload);

		return json({ 
			message: 'Deployment initiated',
			project: project.name,
			commit: payload.head_commit.id.substring(0, 7)
		});

	} catch (error) {
		console.error('GitHub webhook error:', error);
		return json({ 
			error: 'Webhook processing failed',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};

async function deployProject(projectId: number, payload: GitHubWebhookPayload) {
	try {
		// Update project status to building
		await execute(
			`UPDATE projects SET status = 'building', updated_at = NOW() WHERE id = $1`,
			[projectId]
		);

		// Log deployment start
		await execute(
			`INSERT INTO deployment_logs (project_id, log_type, message) 
			 VALUES ($1, 'info', $2)`,
			[projectId, `Starting deployment for commit ${payload.head_commit.id.substring(0, 7)}`]
		);

		// Get project details
		const projectResult = await query(
			`SELECT * FROM projects WHERE id = $1`,
			[projectId]
		);

		const project = projectResult[0];
		if (!project) {
			throw new Error('Project not found');
		}

		// Import deployment service
		const { deploymentService } = await import('$lib/server/deployment.js');
		
		// Create deployment config from project data
		const deploymentConfig = {
			projectId: project.id,
			name: project.name,
			githubUrl: project.github_url,
			branch: project.github_branch,
			buildCommand: project.build_command,
			startCommand: project.start_command,
			port: project.port
		};
		
		// Start deployment (this will run in background)
		deploymentService.deployProject(deploymentConfig).then(async (result: any) => {
			if (result.success) {
				await execute(
					`UPDATE projects SET status = 'running', last_deployed_at = NOW(), updated_at = NOW() WHERE id = $1`,
					[projectId]
				);
				
				await execute(
					`INSERT INTO deployment_logs (project_id, log_type, message) 
					 VALUES ($1, 'info', $2)`,
					[projectId, 'Deployment completed successfully']
				);
			} else {
				await execute(
					`UPDATE projects SET status = 'failed', updated_at = NOW() WHERE id = $1`,
					[projectId]
				);
				
				await execute(
					`INSERT INTO deployment_logs (project_id, log_type, message) 
					 VALUES ($1, 'error', $2)`,
					[projectId, `Deployment failed: ${result.error}`]
				);
			}
		}).catch(async (error) => {
			await execute(
				`UPDATE projects SET status = 'failed', updated_at = NOW() WHERE id = $1`,
				[projectId]
			);
			
			await execute(
				`INSERT INTO deployment_logs (project_id, log_type, message) 
				 VALUES ($1, 'error', $2)`,
				[projectId, `Deployment error: ${error.message}`]
			);
		});

	} catch (error) {
		console.error('Deploy project error:', error);
		await execute(
			`UPDATE projects SET status = 'failed', updated_at = NOW() WHERE id = $1`,
			[projectId]
		);
		
		await execute(
			`INSERT INTO deployment_logs (project_id, log_type, message) 
			 VALUES ($1, 'error', $2)`,
			[projectId, `Deployment initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
		);
	}
}
