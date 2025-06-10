import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { dbUtils } from '$lib/server/database';

export const load: PageServerLoad = async ({ params }) => {
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
		throw error(404, 'Project not found');
	}

	// Get deployment logs
	const logs = await dbUtils.getDeploymentLogs(project.id.toString(), 50);

	// Get enhanced repository information
	let repoInfo = null;
	let latestCommit = null;
	
	if (project.github_repository_id) {
		repoInfo = await dbUtils.getGitHubRepositoryById(project.github_repository_id);
	}

	// Try to fetch latest commit information
	if (project.github_url) {
		try {
			const repoPath = project.github_url.replace('https://github.com/', '');
			const branch = project.github_branch || 'main';
			
			const commitResponse = await fetch(`https://api.github.com/repos/${repoPath}/commits/${branch}`);
			if (commitResponse.ok) {
				const commitData = await commitResponse.json();
				latestCommit = {
					sha: commitData.sha,
					message: commitData.commit.message,
					author: commitData.commit.author.name,
					date: commitData.commit.author.date,
					url: commitData.html_url
				};
			}
		} catch (error) {
			console.log('Could not fetch commit information:', error);
		}
	}

	const enhancedProject = {
		...project,
		repository_name: repoInfo?.full_name || project.github_url?.split('/').slice(-2).join('/') || null,
		repository_url: repoInfo?.html_url || project.github_url,
		repository_clone_url: repoInfo?.clone_url || project.github_url,
		repository_language: repoInfo?.language || null,
		repository_description: repoInfo?.description || project.description,
		is_private: repoInfo?.private || false,
		latest_commit: latestCommit
	};

	return {
		project: enhancedProject,
		logs
	};
};
