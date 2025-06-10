import { json } from '@sveltejs/kit';
import { deploymentService } from '$lib/server/deployment.js';
import { dbUtils } from '$lib/server/database.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ params, locals }) => {
    try {
        if (!locals.user) {
            return json({ error: 'Authentication required' }, { status: 401 });
        }

        const action = params.action;
        
        if (!['start', 'stop', 'restart', 'deploy'].includes(action)) {
            return json({ error: 'Invalid action. Must be start, stop, restart, or deploy' }, { status: 400 });
        }

        // Try to get project by name first, then by ID for backwards compatibility
        let project = await dbUtils.findProjectByName(decodeURIComponent(params.id));
        
        if (!project) {
            // Fallback: try to get by ID if the param looks like a number
            const projectId = parseInt(params.id);
            if (!isNaN(projectId)) {
                const projects = await dbUtils.getProjects();
                project = projects.find(p => p.id === projectId);
            }
        }

        if (!project) {
            return json({ error: 'Project not found' }, { status: 404 });
        }

        // Check permissions
        if (!locals.user.isAdmin && project.created_by !== locals.user.id) {
            return json({ error: 'Permission denied' }, { status: 403 });
        }

        let success = false;
        let newStatus = project.status;
        let message = '';

        // Log the action attempt
        await dbUtils.addDeploymentLog(project.id, 'info', `User initiated ${action} action`);

        switch (action) {
            case 'start':
            case 'deploy':
                // For start and deploy, we need to run full deployment
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
                
                // Update status to building immediately
                await dbUtils.updateProjectStatus(project.id, 'building');
                newStatus = 'building';
                
                // Start deployment in background
                deploymentService.deployProject(deploymentConfig).then(async (result) => {
                    if (result.success) {
                        await dbUtils.updateProjectStatus(project.id, 'running');
                        await dbUtils.addDeploymentLog(project.id, 'success', 'Deployment completed successfully');
                    } else {
                        await dbUtils.updateProjectStatus(project.id, 'failed');
                        await dbUtils.addDeploymentLog(project.id, 'error', `Deployment failed: ${result.message}`);
                    }
                }).catch(async (error) => {
                    await dbUtils.updateProjectStatus(project.id, 'failed');
                    await dbUtils.addDeploymentLog(project.id, 'error', `Deployment error: ${error.message}`);
                });
                
                success = true;
                message = `${action === 'deploy' ? 'Deployment' : 'Start'} initiated successfully`;
                break;
                
            case 'stop':
                try {
                    await dbUtils.addDeploymentLog(project.id, 'info', 'Stopping project...');
                    success = await deploymentService.stopProject(project.name);
                    newStatus = success ? 'stopped' : project.status;
                    message = success ? 'Project stopped successfully' : 'Failed to stop project';
                    
                    if (success) {
                        await dbUtils.updateProjectStatus(project.id, 'stopped');
                        await dbUtils.addDeploymentLog(project.id, 'success', 'Project stopped successfully');
                    } else {
                        await dbUtils.addDeploymentLog(project.id, 'error', 'Failed to stop project');
                    }
                } catch (error) {
                    await dbUtils.addDeploymentLog(project.id, 'error', `Stop failed: ${error}`);
                    message = 'Failed to stop project';
                }
                break;
                
            case 'restart':
                try {
                    await dbUtils.addDeploymentLog(project.id, 'info', 'Restarting project...');
                    success = await deploymentService.restartProject(project.name);
                    newStatus = success ? 'running' : project.status;
                    message = success ? 'Project restarted successfully' : 'Failed to restart project';
                    
                    if (success) {
                        await dbUtils.updateProjectStatus(project.id, 'running');
                        await dbUtils.addDeploymentLog(project.id, 'success', 'Project restarted successfully');
                    } else {
                        await dbUtils.addDeploymentLog(project.id, 'error', 'Failed to restart project');
                    }
                } catch (error) {
                    await dbUtils.addDeploymentLog(project.id, 'error', `Restart failed: ${error}`);
                    message = 'Failed to restart project';
                }
                break;
        }

        return json({
            success,
            message,
            status: newStatus
        });
    } catch (error) {
        console.error('Project action error:', error);
        
        // Try to log the error if we have project info
        try {
            if (params.id) {
                let project = await dbUtils.findProjectByName(decodeURIComponent(params.id));
                if (!project) {
                    const projectId = parseInt(params.id);
                    if (!isNaN(projectId)) {
                        const projects = await dbUtils.getProjects();
                        project = projects.find(p => p.id === projectId);
                    }
                }
                
                if (project) {
                    await dbUtils.addDeploymentLog(project.id, 'error', `Action ${params.action} failed: ${error}`);
                }
            }
        } catch (logError) {
            console.error('Failed to log error:', logError);
        }
        
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};
