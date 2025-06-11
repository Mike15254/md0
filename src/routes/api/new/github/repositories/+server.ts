import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth.js';

// Get repositories accessible through GitHub App for new project creation
export const GET: RequestHandler = async ({ locals, url }) => {
    try {
        const user = requireAuth(locals);
        
        const { githubAppService } = await import('$lib/server/github-app.js');
        const { dbUtils } = await import('$lib/server/database.js');
        
        // Get query parameters
        const searchQuery = url.searchParams.get('search') || '';
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
        
        // Get all active GitHub App installations
        const installations = await dbUtils.getAllActiveGitHubAppInstallations();
        
        if (installations.length === 0) {
            return json({
                success: true,
                data: {
                    repositories: [],
                    hasInstallation: false,
                    total: 0
                }
            });
        }
        
        // Fetch repositories for all installations
        const allRepositories = [];
        
        for (const installation of installations) {
            try {
                const repositories = await githubAppService.getInstallationRepositories(
                    installation.installation_id
                );
                allRepositories.push(...repositories);
            } catch (error) {
                console.error(`Failed to fetch repos for installation ${installation.installation_id}:`, error);
            }
        }
        
        // Filter repositories based on search query if provided
        let filteredRepositories = allRepositories;
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filteredRepositories = allRepositories.filter(repo => 
                repo.name.toLowerCase().includes(query) ||
                repo.full_name.toLowerCase().includes(query) ||
                (repo.description && repo.description.toLowerCase().includes(query))
            );
        }
        
        // Sort repositories by name and limit results
        const sortedRepositories = filteredRepositories
            .sort((a, b) => a.name.localeCompare(b.name))
            .slice(0, limit);
        
        // Transform repository data for project creation context
        const transformedRepositories = sortedRepositories.map(repo => ({
            id: repo.id,
            name: repo.name,
            full_name: repo.full_name,
            html_url: repo.html_url,
            clone_url: repo.clone_url,
            default_branch: repo.default_branch,
            private: repo.private,
            language: repo.language,
            description: repo.description,
            // Additional fields useful for project creation
            suggested_name: repo.name.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase(),
            repository_url: repo.html_url
        }));
        
        return json({
            success: true,
            data: {
                repositories: transformedRepositories,
                hasInstallation: true,
                total: filteredRepositories.length,
                showing: transformedRepositories.length,
                installationCount: installations.length
            }
        });
        
    } catch (error) {
        console.error('Get repositories for new project error:', error);
        return json({ 
            success: false,
            error: 'Failed to fetch repositories' 
        }, { status: 500 });
    }
};
