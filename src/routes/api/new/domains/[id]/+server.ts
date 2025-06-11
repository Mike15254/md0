import { json } from '@sveltejs/kit';
import { domainService } from '$lib/service/domain.js';
import { type RequestEvent } from "@sveltejs/kit";

export const GET = async ({ params, locals }: RequestEvent) => {
	try {
		if (!locals.user) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}

		if (!params.id) {
			return json({ error: 'Domain ID is required' }, { status: 400 });
		}
		const domainResult = await domainService.getDomain(parseInt(params.id));
		if (!domainResult.success || !domainResult.data) {
			return json({ error: 'Domain not found' }, { status: 404 });
		}

		const domain = domainResult.data;
		const project = await domainService.getProject(domain.project_id.toString());
		if (!locals.user.isAdmin && project?.created_by !== locals.user.id) {
			return json({ error: 'Permission denied' }, { status: 403 });
		}

		return json({
			success: true,
			domain: domain  // Changed from 'data' to 'domain'
		});
	} catch (error) {
		console.error('Get domain error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

export const PUT = async ({ params, request, locals }: RequestEvent) => {
	try {
		if (!locals.user) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}

		if (!params.id) {
			return json({ error: 'Domain ID is required' }, { status: 400 });
		}

		const domainResult = await domainService.getDomain(parseInt(params.id));
		if (!domainResult.success || !domainResult.data) {
			return json({ error: 'Domain not found' }, { status: 404 });
		}

		const domain = domainResult.data;
		const project = await domainService.getProject(domain.project_id.toString());
		if (!locals.user.isAdmin && project?.created_by !== locals.user.id) {
			return json({ error: 'Permission denied' }, { status: 403 });
		}

		const updates = await request.json();
		
		// Update domain using the service
		const result = await domainService.updateDomain(parseInt(params.id), updates);
		
		if (!result.success) {
			return json({ error: result.message }, { status: 400 });
		}

		// Get updated domain using service
		const updatedDomainResult = await domainService.getDomain(parseInt(params.id));
		
		if (!updatedDomainResult.success) {
			return json({ error: 'Failed to retrieve updated domain' }, { status: 500 });
		}

		return json({
			success: true,
			domain: updatedDomainResult.data
		});
	} catch (error) {
		console.error('Update domain error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

export const DELETE = async ({ params, locals }: RequestEvent) => {
	try {
		if (!locals.user) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}

		if (!params.id) {
			return json({ error: 'Domain ID is required' }, { status: 400 });
		}
		const domainResult = await domainService.getDomain(parseInt(params.id));
		if (!domainResult.success || !domainResult.data) {
			return json({ error: 'Domain not found' }, { status: 404 });
		}

		const domain = domainResult.data;
		const project = await domainService.getProject(domain.project_id.toString());
		if (!locals.user.isAdmin && project?.created_by !== locals.user.id) {
			return json({ error: 'Permission denied' }, { status: 403 });
		}

		const removeResult = await domainService.deleteDomain(parseInt(params.id));
		
		if (!removeResult.success) {
			return json({ error: removeResult.message }, { status: 500 });
		}

		return json({
			success: true,
			message: 'Domain deleted successfully'
		});
	} catch (error) {
		console.error('Delete domain error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
