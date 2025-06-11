import { json } from '@sveltejs/kit';
import { domainService } from '$lib/service/domain.js';
import { type RequestEvent } from '@sveltejs/kit';

export const GET = async ({ locals, url }: RequestEvent) => {
	try {
		if (!locals.user) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}

		const user = locals.user; // Store user after null check

		const projectId = url.searchParams.get('project_id');
		
		// Use domain service for consistency
		const result = projectId
			? await domainService.getDomainsByProject(parseInt(projectId))
			: await domainService.getAllDomains();

		if (!result.success) {
			return json({ error: result.message || 'Failed to get domains' }, { status: 500 });
		}

		const domains = result.data || [];
		const userDomains = user.isAdmin
			? domains
			: domains.filter((d: any) => d.project_created_by === user.id || d.project?.created_by === user.id);

		return json({
			success: true,
			domains: userDomains  // Changed from 'data' to 'domains' to match test expectations
		});
	} catch (error) {
		console.error('Get domains error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

export const POST = async ({ request, locals }: RequestEvent) => {
	try {
		if (!locals.user) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}

		const {
			domain_name,
			project_id,
			ssl_enabled = true,
			ssl_auto_renew = true
		} = await request.json();

		if (!domain_name || !project_id) {
			return json({ error: 'Project ID and domain name are required' }, { status: 400 });
		}

		// Validate domain format
		const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]$/;
		if (!domainRegex.test(domain_name) || domain_name.includes('..')) {
			return json({ error: 'Invalid domain name format' }, { status: 400 });
		}

		const project = await domainService.getProject(project_id.toString());
		if (!project) {
			return json({ error: 'Project not found' }, { status: 404 });
		}

		if (!locals.user.isAdmin && project.created_by !== locals.user.id) {
			return json({ error: 'Permission denied' }, { status: 403 });
		}

		// Use domain service for proper validation and error handling
		const result = await domainService.createDomain({
			project_id: project_id,
			domain_name: domain_name,
			ssl_enabled: ssl_enabled !== false,
			ssl_auto_renew: ssl_auto_renew !== false
		});

		if (!result.success) {
			const errorMessage = result.message || result.error || 'Failed to create domain';
			if (errorMessage === 'Domain name already exists') {
				return json({ error: errorMessage }, { status: 409 });
			}
			return json({ error: errorMessage }, { status: 400 });
		}

		return json({
			success: true,
			domain: result.data
		}, { status: 201 });
	} catch (error) {
		console.error('Create domain error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
