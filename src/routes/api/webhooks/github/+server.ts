import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dbUtils } from '$lib/server/database.js';
import { createHmac } from 'crypto';

interface GitHubWebhookPayload {
	ref: string;
	repository: {
		full_name: string;
		clone_url: string;
		html_url: string;
		id: number;
	};
	head_commit?: {
		id: string;
		message: string;
		author: {
			name: string;
			email: string;
		};
		timestamp: string;
	};
	pusher?: {
		name: string;
		email: string;
	};
	action?: string; // For PR events
	pull_request?: {
		number: number;
		title: string;
		head: {
			sha: string;
			ref: string;
		};
		base: {
			ref: string;
		};
		user: {
			login: string;
		};
	};
	release?: {
		tag_name: string;
		name: string;
		draft: boolean;
		prerelease: boolean;
	};
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.text();
		const signature = request.headers.get('x-hub-signature-256');
		const githubEvent = request.headers.get('x-github-event') || 'unknown';

		// Get webhook secret from settings
		const settings = await dbUtils.getSettings();
		const webhookSecret = settings.find(s => s.category === 'system' && s.key === 'webhook_secret')?.value;
		
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

		const payload: GitHubWebhookPayload = JSON.parse(body);

		// Handle GitHub App installation events
		if (githubEvent === 'installation' || githubEvent === 'installation_repositories') {
			return await handleGitHubAppEvent(githubEvent, payload);
		}

		// Find project by GitHub URL
		const projects = await dbUtils.getProjectsByGitHubUrl([payload.repository.clone_url, payload.repository.html_url]);

		if (projects.length === 0) {
			console.log('No project found for repository:', payload.repository.full_name);
			return json({ message: 'No matching project found' });
		}

		const project = projects[0];

		// Log the webhook event
		const eventData = {
			project_id: project.id,
			event_type: githubEvent,
			payload: payload,
			repository_name: payload.repository.full_name,
			processed: false
		};

		const webhookEvent = await dbUtils.logWebhookEvent(eventData);

		// Handle different event types
		switch (githubEvent) {
			case 'push':
				return await handlePushEvent(project, payload, webhookEvent.id);
			case 'pull_request':
				return await handlePullRequestEvent(project, payload, webhookEvent.id);
			case 'release':
				return await handleReleaseEvent(project, payload, webhookEvent.id);
			default:
				await dbUtils.markWebhookEventProcessed(webhookEvent.id, false);
				return json({ message: `Event type '${githubEvent}' not handled` });
		}

	} catch (error) {
		console.error('GitHub webhook error:', error);
		return json({ 
			error: 'Webhook processing failed',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};

async function handleGitHubAppEvent(eventType: string, payload: any) {
	try {
		const { githubAppService } = await import('$lib/server/github-app.js');
		
		if (eventType === 'installation') {
			const installationId = payload.installation.id;
			await githubAppService.handleWebhook(payload, installationId);
			
			return json({ 
				message: `Installation ${payload.action} processed`,
				installation_id: installationId
			});
		}
		
		if (eventType === 'installation_repositories') {
			const installationId = payload.installation.id;
			await githubAppService.handleWebhook(payload, installationId);
			
			return json({ 
				message: `Installation repositories ${payload.action} processed`,
				installation_id: installationId
			});
		}
		
		return json({ message: 'GitHub App event processed' });
		
	} catch (error) {
		console.error('GitHub App event handling error:', error);
		return json({ error: 'GitHub App event processing failed' }, { status: 500 });
	}
}

async function handlePushEvent(project: any, payload: GitHubWebhookPayload, webhookEventId: number) {
	try {
		// Check if this is a push to the configured branch
		const pushedBranch = payload.ref.replace('refs/heads/', '');
		
		if (project.github_branch !== pushedBranch) {
			console.log(`Push to ${pushedBranch}, but project configured for ${project.github_branch}`);
			await dbUtils.markWebhookEventProcessed(webhookEventId, false);
			return json({ message: 'Branch mismatch' });
		}

		// Check if auto-deploy is enabled for this project
		if (!project.auto_deploy) {
			await dbUtils.markWebhookEventProcessed(webhookEventId, false);
			return json({ message: 'Auto-deploy disabled for this project' });
		}

		// Log the webhook event in deployment logs
		await dbUtils.addDeploymentLog(project.id, 'webhook', 
			`Webhook received: ${payload.head_commit?.message || 'Unknown commit'} by ${payload.pusher?.name || 'Unknown'}`);

		// Start deployment process
		await deployProject(project, payload);
		await dbUtils.markWebhookEventProcessed(webhookEventId, true);

		return json({ 
			message: 'Deployment initiated',
			project: project.name,
			commit: payload.head_commit?.id.substring(0, 7) || 'unknown'
		});
	} catch (error) {
		console.error('Push event handling error:', error);
		await dbUtils.markWebhookEventProcessed(webhookEventId, false);
		throw error;
	}
}

async function handlePullRequestEvent(project: any, payload: GitHubWebhookPayload, webhookEventId: number) {
	try {
		// For now, just log PR events but don't trigger deployments
		await dbUtils.addDeploymentLog(project.id, 'webhook', 
			`Pull request ${payload.action}: ${payload.pull_request?.title || 'Unknown'} (${payload.pull_request?.head.ref} -> ${payload.pull_request?.base.ref})`);
		
		await dbUtils.markWebhookEventProcessed(webhookEventId, false);
		
		return json({ 
			message: 'Pull request event logged',
			action: payload.action,
			pr_number: payload.pull_request?.number
		});
	} catch (error) {
		console.error('Pull request event handling error:', error);
		await dbUtils.markWebhookEventProcessed(webhookEventId, false);
		throw error;
	}
}

async function handleReleaseEvent(project: any, payload: GitHubWebhookPayload, webhookEventId: number) {
	try {
		// For releases, we might want to deploy tags in the future
		await dbUtils.addDeploymentLog(project.id, 'webhook', 
			`Release ${payload.action}: ${payload.release?.name || payload.release?.tag_name || 'Unknown'}`);
		
		await dbUtils.markWebhookEventProcessed(webhookEventId, false);
		
		return json({ 
			message: 'Release event logged',
			action: payload.action,
			tag: payload.release?.tag_name
		});
	} catch (error) {
		console.error('Release event handling error:', error);
		await dbUtils.markWebhookEventProcessed(webhookEventId, false);
		throw error;
	}
}

async function deployProject(project: any, payload: GitHubWebhookPayload) {
	try {
		// Update project status to building
		await dbUtils.updateProjectStatus(project.id, 'building');

		// Log deployment start
		await dbUtils.addDeploymentLog(project.id, 'info', 
			`Starting deployment for commit ${payload.head_commit?.id.substring(0, 7) || 'unknown'}`);

		// Import deployment service
		const { deploymentService } = await import('$lib/server/deployment.js');
		
		// Get GitHub token if needed
		let githubToken;
		let installationId;
		
		// First try to get GitHub App installation token
		try {
			const match = project.github_url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
			if (match) {
				const [, owner, repo] = match;
				const cleanRepo = repo.replace('.git', '');
				const installation = await dbUtils.findInstallationForRepository(owner, cleanRepo);
				if (installation) {
					installationId = installation.installation_id;
					const { githubAppService } = await import('$lib/server/github-app.js');
					githubToken = await githubAppService.getInstallationAccessToken(installationId);
					await dbUtils.addDeploymentLog(project.id, 'info', 'Using GitHub App authentication for deployment');
				}
			}
		} catch (error) {
			console.log('Could not get GitHub App token:', error);
		}
		
		// Fallback to stored GitHub credential
		if (!githubToken && project.github_token_id) {
			const credential = await dbUtils.getGitHubCredential(project.github_token_id);
			githubToken = credential?.access_token;
		}

		// Create deployment config from project data
		const deploymentConfig = {
			projectId: project.id,
			name: project.name,
			githubUrl: project.github_url,
			branch: project.github_branch,
			buildCommand: project.build_command,
			startCommand: project.start_command,
			port: project.port,
			envVars: project.environment_variables,
			githubToken,
			installationId
		};
		
		// Start deployment (this will run in background)
		deploymentService.deployProject(deploymentConfig).then(async (result: any) => {
			if (result.success) {
				await dbUtils.updateProjectStatus(project.id, 'running');
				await dbUtils.addDeploymentLog(project.id, 'info', 'Deployment completed successfully');
			} else {
				await dbUtils.updateProjectStatus(project.id, 'failed');
				await dbUtils.addDeploymentLog(project.id, 'error', `Deployment failed: ${result.error}`);
			}
		}).catch(async (error) => {
			await dbUtils.updateProjectStatus(project.id, 'failed');
			await dbUtils.addDeploymentLog(project.id, 'error', `Deployment error: ${error.message}`);
		});

	} catch (error) {
		console.error('Deploy project error:', error);
		await dbUtils.updateProjectStatus(project.id, 'failed');
		await dbUtils.addDeploymentLog(project.id, 'error', 
			`Deployment initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}
}
