import type { PageServerLoad } from './$types.js';
import type { ClientUser } from '$lib/types.js';

export const load: PageServerLoad = async ({ locals }): Promise<{ user: ClientUser | null }> => {
    return {
        user: locals.user ? {
            id: parseInt(locals.user.id), // Convert string to number
            username: locals.user.username,
            email: locals.user.email,
            isAdmin: locals.user.isAdmin,
            githubInstallations: locals.user.githubInstallations || []
        } : null
    };
};
