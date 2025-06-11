// Service Layer - Clean, organized backend services for MD0 deployment platform
//
// This service layer provides a clean separation of concerns with:
// - GitHub App integration for repository management
// - Docker-based deployment system
// - VPS monitoring and management
// - Domain and SSL management via Nginx
// - Database instance management (PostgreSQL & PocketBase)
// - Project lifecycle management

// Export all services
export { BaseService } from './database.js';
export { DatabaseService, databaseService } from './database.js';
export { GitHubService, githubService } from './github.js';
export { DeploymentService, deploymentService } from './deployment.js';
export { VPSService, vpsService } from './vps.js';
export { DomainService, domainService } from './domain.js';
export { ProjectService, projectService } from './project.js';
export { ConfigService, configService } from './config.js';

// Export all types
export type * from './types.js';

// Service registry for dependency injection
export const services = {
	database: () => import('./database.js').then((m) => m.databaseService),
	github: () => import('./github.js').then((m) => m.githubService),
	deployment: () => import('./deployment.js').then((m) => m.deploymentService),
	vps: () => import('./vps.js').then((m) => m.vpsService),
	domain: () => import('./domain.js').then((m) => m.domainService),
	project: () => import('./project.js').then((m) => m.projectService),
	config: () => import('./config.js').then((m) => m.configService)
};

// Service health check
export async function checkServicesHealth(): Promise<{
	github: boolean;
	deployment: boolean;
	database: boolean;
	vps: boolean;
	domain: boolean;
	project: boolean;
	overall: boolean;
}> {
	const [github, deployment, database, vps, domain, project] = await Promise.allSettled([
		import('./github.js')
			.then((m) => m.githubService.validateConfiguration())
			.then((r) => r.success),
		import('./deployment.js').then(() => true).catch(() => false),
		import('./database.js').then((m) => m.databaseService.getInstances(1)).then((r) => r.success),
		import('./vps.js').then((m) => m.vpsService.getMetrics()).then((r) => r.success),
		import('./domain.js').then((m) => m.domainService.getNginxStatus()).then((r) => r.success),
		import('./project.js').then((m) => m.projectService.getProjectStats()).then((r) => r.success)
	]);

	const results = {
		github: github.status === 'fulfilled' && github.value,
		deployment: deployment.status === 'fulfilled' && deployment.value,
		database: database.status === 'fulfilled' && database.value,
		vps: vps.status === 'fulfilled' && vps.value,
		domain: domain.status === 'fulfilled' && domain.value,
		project: project.status === 'fulfilled' && project.value,
		overall: false
	};

	results.overall = Object.values(results).filter((v) => v === true).length >= 4; // At least 4 services healthy

	return results;
}
