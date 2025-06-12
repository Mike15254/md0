import { json } from '@sveltejs/kit';
import { GitHubService } from '$lib/service/github.js';
import { type RequestEvent } from "@sveltejs/kit";

// Get repositories accessible through GitHub App for new project creation
export const GET = async ({ locals, url }: RequestEvent) => {
    try {
        if (!locals.user) {
            return json({ error: 'Authentication required' }, { status: 401 });
        }
        
        const githubService = new GitHubService();
        
        // Check if GitHub App is configured
        const isConfigured = await githubService.isConfigured();
        if (!isConfigured) {
            return json({
                success: true,
                data: {
                    repositories: [],
                    hasInstallation: false,
                    total: 0,
                    message: 'GitHub App not configured'
                }
            });
        }
        
        // Get query parameters
        const searchQuery = url.searchParams.get('search') || '';
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
        
        // Get all GitHub App installations
        const installationsResult = await githubService.getInstallations();
        
        if (!installationsResult.success || !installationsResult.data || installationsResult.data.length === 0) {
            return json({
                success: true,
                data: {
                    repositories: [],
                    hasInstallation: false,
                    total: 0,
                    message: 'No GitHub App installations found'
                }
            });
        }
        
        // Collect all repositories from all installations
        const allRepositories = [];
        for (const installation of installationsResult.data) {
            if (installation.repositories) {
                allRepositories.push(...installation.repositories);
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
            repository_url: repo.html_url,
            installation_id: repo.installation_id
        }));
        
        return json({
            success: true,
            data: {
                repositories: transformedRepositories,
                hasInstallation: true,
                total: filteredRepositories.length,
                showing: transformedRepositories.length,
                installationCount: installationsResult.data?.length || 0
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
