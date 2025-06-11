import { json } from '@sveltejs/kit';
import { deploymentService } from '$lib/server/deployment.js';
import { dbUtils } from '$lib/server/database.js';
import { type RequestEvent } from '@sveltejs/kit';

export const POST = async ({ params, locals }: RequestEvent) => {
	try {
		if (!locals.user) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}
		if (!params.id) {
			return json({ error: 'Project ID is required' }, { status: 400 });
		}
		const project =
			(await dbUtils.findProjectByName(params.id)) || (await dbUtils.getProject(params.id));

		if (!project) {
			return json({ error: 'Project not found' }, { status: 404 });
		}

		if (!locals.user.isAdmin && project.created_by !== locals.user.id) {
			return json({ error: 'Permission denied' }, { status: 403 });
		}

		await dbUtils.updateProjectStatus(project.id, 'building');

		const deploymentConfig = {
			projectId: project.id,
			name: project.name,
			githubUrl: project.github_url,
			branch: project.github_branch || 'main',
			buildCommand: project.build_command,
			startCommand: project.start_command,
			port: project.port || 3000,
			runtime: project.runtime || 'node',
			envVars: project.environment_variables || {},
			customDomain: project.custom_domain
		};

		deploymentService
			.deployProject(deploymentConfig)
			.then(async (result) => {
				if (result.success) {
					await dbUtils.updateProjectStatus(project.id, 'running');
					await dbUtils.addDeploymentLog(
						project.id,
						'success',
						'Deployment completed successfully'
					);
				} else {
					await dbUtils.updateProjectStatus(project.id, 'failed');
					await dbUtils.addDeploymentLog(
						project.id,
						'error',
						`Deployment failed: ${result.message}`
					);
				}
			})
			.catch(async (error) => {
				await dbUtils.updateProjectStatus(project.id, 'failed');
				await dbUtils.addDeploymentLog(project.id, 'error', `Deployment error: ${error.message}`);
			});

		return json({
			success: true,
			message: 'Deployment started',
			status: 'building'
		});
	} catch (error) {
		console.error('Deploy project error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
