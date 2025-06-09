import type { LayoutServerLoad } from './$types.js';

export const load: LayoutServerLoad = async ({ locals }) => {
    return {
        user: locals.user ? {
            id: locals.user.id,
            username: locals.user.username,
            email: locals.user.email,
            isAdmin: locals.user.isAdmin
        } : null
    };
};
