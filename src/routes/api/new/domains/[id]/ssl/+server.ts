import { json } from '@sveltejs/kit';
import { domainService } from '$lib/service/domain.js';
import { type RequestEvent } from "@sveltejs/kit";

export const POST = async ({ params, locals }: RequestEvent) => {
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

		// Update domain to enable SSL and provision certificate
		const result = await domainService.updateDomain(parseInt(params.id), { 
			ssl_enabled: true,
			ssl_auto_renew: true 
		});

		if (!result.success) {
			return json({ error: result.message }, { status: 500 });
		}

		// Get updated domain with certificate info
		const updatedDomainResult = await domainService.getDomain(parseInt(params.id));
		
		if (!updatedDomainResult.success || !updatedDomainResult.data) {
			return json({ error: 'Failed to retrieve updated domain' }, { status: 500 });
		}

		const updatedDomain = updatedDomainResult.data;

		return json({
			success: true,
			ssl_provisioned: updatedDomain.ssl_enabled,
			certificate_info: {
				certificate_path: updatedDomain.certificate_path,
				private_key_path: updatedDomain.private_key_path,
				ssl_auto_renew: updatedDomain.ssl_auto_renew
			}
		});
	} catch (error) {
		console.error('Provision SSL error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
