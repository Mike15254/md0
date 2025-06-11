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

		const dnsCheck = await domainService.checkDomainDNS(domain.domain_name);

		if (!dnsCheck.success) {
			return json({ error: dnsCheck.message }, { status: 500 });
		}

		return json({
			success: true,
			verified: dnsCheck.data?.configured,
			dns_records: dnsCheck.data?.records || []
		});
	} catch (error) {
		console.error('Verify domain DNS error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
