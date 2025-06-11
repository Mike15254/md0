import { db } from '../server/database.js';
import { BaseService } from './database.js';
import type { ServiceResponse, DomainConfig, DomainStatus } from './types.js';

/**
 * Domain service for managing custom domains, Nginx configuration, and SSL certificates
 */
export class DomainService extends BaseService {
	private readonly nginxSitesAvailable = '/etc/nginx/sites-available';
	private readonly nginxSitesEnabled = '/etc/nginx/sites-enabled';
	private readonly sslCertPath = '/etc/letsencrypt/live';

	/**
	 * Create a custom domain for a project
	 */
	async createDomain(params: {
		project_id: number;
		domain_name: string;
		subdomain?: string;
		ssl_enabled?: boolean;
		ssl_auto_renew?: boolean;
	}): Promise<ServiceResponse<{ id: number }>> {
		try {
			const missing = this.validateRequired({
				project_id: params.project_id,
				domain_name: params.domain_name
			});

			if (missing.length > 0) {
				return this.createResponse(
					false,
					{ id: -1 },
					`Missing required fields: ${missing.join(', ')}`
				);
			}

			// Validate domain format
			if (!this.isValidDomain(params.domain_name)) {
				return this.createResponse(false, { id: -1 }, 'Invalid domain name format');
			}

			// Check if domain already exists
			const existing = await this.executeQuery(
				db`SELECT id FROM domains WHERE domain_name = ${params.domain_name}`
			);

			if (existing.length > 0) {
				return this.createResponse(false, { id: -1 }, 'Domain name already exists');
			}

			// Get project details
			interface ProjectData {
				name: string;
				port: number;
			}

			console.log('Domain service: getting project details');
			const projects = (await this.executeQuery(
				db`SELECT name, port FROM projects WHERE id = ${params.project_id}`
			)) as ProjectData[];

			if (projects.length === 0) {
				console.log('Domain service: project not found');
				return this.createResponse(false, { id: -1 }, 'Project not found');
			}

			const project = projects[0];
			console.log('Domain service: project found', project);

			// Create domain record
			console.log('Domain service: creating domain record');
			const result = (await this.executeQuery(
				db`
                    INSERT INTO domains (
                        project_id, domain_name, subdomain, ssl_enabled, ssl_auto_renew, status
                    )
                    VALUES (
                        ${params.project_id}, ${params.domain_name}, ${params.subdomain || null},
                        ${params.ssl_enabled !== false}, ${params.ssl_auto_renew !== false}, 'pending'
                    )
                    RETURNING id
                `
			)) as { id: number }[];

			const domainId = result[0].id;
			console.log('Domain service: domain record created with id', domainId);

			// Skip system operations during testing
			console.log('Environment check:', { NODE_ENV: process.env.NODE_ENV, BUN_TEST: process.env.BUN_TEST });
			if (process.env.NODE_ENV !== 'test' && process.env.BUN_TEST !== '1') {
				console.log('Domain service: performing system operations');
				// Create Nginx configuration
				await this.createNginxConfig(
					domainId,
					params.domain_name,
					project.name,
					project.port,
					params.ssl_enabled !== false
				);

				// Set up SSL if enabled
				if (params.ssl_enabled !== false) {
					await this.setupSSL(domainId, params.domain_name);
				}

				// Reload Nginx
				await this.reloadNginx();
			} else {
				console.log('Domain service: skipping system operations in test mode');
			}

			// Update domain status
			console.log('Domain service: updating domain status');
			await this.executeQuery(db`UPDATE domains SET status = 'active' WHERE id = ${domainId}`);

			console.log('Domain service: logging operation');
			await this.logOperation('info', 'domain_created', {
				id: domainId,
				domain: params.domain_name,
				project: project.name
			});

			console.log('Domain service: createDomain completed successfully');

			return this.createResponse(true, { id: domainId }, undefined, 'Domain created successfully');
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error occurred';
			console.error('Service error:', error);
			return this.createResponse(false, { id: -1 }, message);
		}
	}

	/**
	 * Get a single domain by ID
	 */
	async getDomain(domainId: number): Promise<ServiceResponse<DomainConfig>> {
		try {
			const domains = await this.executeQuery(
				db`
					SELECT 
						d.id, d.domain_name, d.subdomain, d.ssl_enabled, d.ssl_auto_renew,
						d.nginx_config_path, d.certificate_path, d.private_key_path,
						d.status, d.created_at, d.updated_at, d.project_id
					FROM domains d
					WHERE d.id = ${domainId}
				`
			);

			if (domains.length === 0) {
				return this.createResponse(false, null as any, 'Domain not found');
			}

			return this.createResponse(true, domains[0] as DomainConfig);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Get domains by project ID (alias for getProjectDomains for consistency)
	 */
	async getDomainsByProject(projectId: number): Promise<ServiceResponse<DomainConfig[]>> {
		return this.getProjectDomains(projectId);
	}

	/**
	 * Get project details
	 */
	async getProject(projectId: string): Promise<any> {
		try {
			const projects = await this.executeQuery(
				db`SELECT id, name, created_by, status FROM projects WHERE id = ${parseInt(projectId)}`
			);
			return projects[0] || null;
		} catch (error) {
			console.error('Get project error:', error);
			return null;
		}
	}

	/**
	 * Get domains for a project
	 */
	async getProjectDomains(projectId: number): Promise<ServiceResponse<DomainConfig[]>> {
		try {
			const domains = await this.executeQuery(
				db`
                    SELECT 
                        id, domain_name, subdomain, ssl_enabled, ssl_auto_renew,
                        nginx_config_path, certificate_path, private_key_path,
                        status, created_at, updated_at
                    FROM domains 
                    WHERE project_id = ${projectId}
                    ORDER BY created_at DESC
                `
			);

			return this.createResponse(true, domains as DomainConfig[]);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Get all domains
	 */
	async getAllDomains(): Promise<ServiceResponse<any[]>> {
		try {
			const domains = await this.executeQuery(
				db`
                    SELECT 
                        d.id, d.domain_name, d.subdomain, d.ssl_enabled, d.status,
                        d.created_at, d.updated_at, p.name as project_name, p.id as project_id
                    FROM domains d
                    JOIN projects p ON d.project_id = p.id
                    ORDER BY d.created_at DESC
                `
			);

			return this.createResponse(true, domains);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Update domain configuration
	 */
	async updateDomain(
		domainId: number,
		updates: {
			ssl_enabled?: boolean;
			ssl_auto_renew?: boolean;
		}
	): Promise<ServiceResponse> {
		try {
			// Get current domain
			interface DomainWithProject {
				domain_name: string;
				project_name: string;
				port: number;
				ssl_enabled: boolean;
				// Other domain properties
			}

			const domains = (await this.executeQuery(
				db`
                    SELECT d.*, p.name as project_name, p.port 
                    FROM domains d
                    JOIN projects p ON d.project_id = p.id
                    WHERE d.id = ${domainId}
                `
			)) as DomainWithProject[];

			if (domains.length === 0) {
				return this.createResponse(false, undefined, 'Domain not found');
			}

			const domain = domains[0];

			// Update database
			const setClause = [];
			const values = [];

			if (updates.ssl_enabled !== undefined) {
				setClause.push('ssl_enabled = $' + (values.length + 1));
				values.push(updates.ssl_enabled);
			}

			if (updates.ssl_auto_renew !== undefined) {
				setClause.push('ssl_auto_renew = $' + (values.length + 1));
				values.push(updates.ssl_auto_renew);
			}

			if (setClause.length > 0) {
				setClause.push('updated_at = CURRENT_TIMESTAMP');
				const query = `UPDATE domains SET ${setClause.join(', ')} WHERE id = $${values.length + 1}`;
				values.push(domainId);

				await this.executeQuery(db.unsafe(query, values));
			}

			// Skip system operations during testing
			if (process.env.NODE_ENV !== 'test' && process.env.BUN_TEST !== '1') {
				// Update Nginx configuration
				await this.createNginxConfig(
					domainId,
					domain.domain_name,
					domain.project_name,
					domain.port,
					updates.ssl_enabled ?? domain.ssl_enabled
				);

				// Handle SSL changes
				if (updates.ssl_enabled === true && !domain.ssl_enabled) {
					await this.setupSSL(domainId, domain.domain_name);
				} else if (updates.ssl_enabled === false && domain.ssl_enabled) {
					await this.removeSSL(domainId, domain.domain_name);
				}

				await this.reloadNginx();
			}

			await this.logOperation('info', 'domain_updated', {
				id: domainId,
				domain: domain.domain_name
			});

			return this.createResponse(true, undefined, undefined, 'Domain updated successfully');
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Delete a domain
	 */
	async deleteDomain(domainId: number): Promise<ServiceResponse> {
		try {
			// Get domain details
			interface DomainData {
				domain_name: string;
				nginx_config_path: string;
			}

			const domains = (await this.executeQuery(
				db`SELECT domain_name, nginx_config_path FROM domains WHERE id = ${domainId}`
			)) as DomainData[];

			if (domains.length === 0) {
				return this.createResponse(false, undefined, 'Domain not found');
			}

			const domain = domains[0] as DomainData;

			// Skip system operations during testing
			if (process.env.NODE_ENV !== 'test' && process.env.BUN_TEST !== '1') {
				// Remove Nginx configuration
				await this.removeNginxConfig(domain.domain_name);

				// Remove SSL certificates
				await this.removeSSL(domainId, domain.domain_name);

				await this.reloadNginx();
			}

			// Delete from database
			await this.executeQuery(db`DELETE FROM domains WHERE id = ${domainId}`);

			await this.logOperation('info', 'domain_deleted', {
				id: domainId,
				domain: domain.domain_name
			});

			return this.createResponse(true, undefined, undefined, 'Domain deleted successfully');
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Check domain DNS configuration
	 */
	async checkDomainDNS(
		domainName: string
	): Promise<ServiceResponse<{ configured: boolean; ip?: string; records: any[] }>> {
		try {
			const { exec } = await import('child_process');
			const { promisify } = await import('util');
			const execAsync = promisify(exec);

			// Get current VPS IP
			const vpsIpResult = await execAsync('curl -s ifconfig.me');
			const vpsIp = vpsIpResult.stdout.trim();

			// Check DNS A record
			const dnsResult = await execAsync(`dig +short A ${domainName}`);
			const resolvedIps = dnsResult.stdout
				.trim()
				.split('\n')
				.filter((ip) => ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip));

			const configured = resolvedIps.includes(vpsIp);

			// Get detailed DNS records
			const detailedResult = await execAsync(`dig ${domainName} ANY`);
			const records = this.parseDNSRecords(detailedResult.stdout);

			return this.createResponse(true, {
				configured,
				ip: resolvedIps[0],
				records
			});
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Renew SSL certificates
	 */
	async renewSSLCertificates(): Promise<ServiceResponse<{ renewed: string[]; failed: string[] }>> {
		try {
			const { exec } = await import('child_process');
			const { promisify } = await import('util');
			const execAsync = promisify(exec);

			const renewed: string[] = [];
			const failed: string[] = [];

			// Define type for domains
			interface DomainWithSSL {
				id: number;
				domain_name: string;
			}

			// Get domains with SSL enabled
			const domains = (await this.executeQuery(
				db`SELECT id, domain_name FROM domains WHERE ssl_enabled = true AND status = 'active'`
			)) as DomainWithSSL[];

			for (const domain of domains) {
				try {
					// Try to renew certificate
					await execAsync(`sudo certbot renew --cert-name ${domain.domain_name} --nginx`);
					renewed.push(domain.domain_name);
				} catch (error) {
					console.error(`Failed to renew SSL for ${domain.domain_name}:`, error);
					failed.push(domain.domain_name);
				}
			}

			if (renewed.length > 0) {
				await this.reloadNginx();
			}

			await this.logOperation('info', 'ssl_certificates_renewed', { renewed, failed });

			return this.createResponse(
				true,
				{ renewed, failed },
				undefined,
				`SSL renewal completed. Renewed: ${renewed.length}, Failed: ${failed.length}`
			);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Get Nginx configuration status
	 */
	async getNginxStatus(): Promise<
		ServiceResponse<{ active: boolean; config_test: boolean; sites: any[] }>
	> {
		try {
			const { exec } = await import('child_process');
			const { promisify } = await import('util');
			const execAsync = promisify(exec);

			// Check if Nginx is active
			let active = false;
			try {
				const statusResult = await execAsync('systemctl is-active nginx');
				active = statusResult.stdout.trim() === 'active';
			} catch {
				active = false;
			}

			// Test Nginx configuration
			let configTest = false;
			try {
				await execAsync('sudo nginx -t');
				configTest = true;
			} catch {
				configTest = false;
			}

			// Get enabled sites
			const sites = [];
			try {
				const sitesResult = await execAsync(`ls -la ${this.nginxSitesEnabled}`);
				const lines = sitesResult.stdout.split('\n');

				for (const line of lines) {
					if (line.includes('->')) {
						const parts = line.split(' ');
						const siteName = parts[parts.length - 3];
						const target = parts[parts.length - 1];
						sites.push({ name: siteName, target, enabled: true });
					}
				}
			} catch {
				// Directory might not exist or no permissions
			}

			return this.createResponse(true, { active, config_test: configTest, sites });
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Create Nginx configuration for domain
	 */
	private async createNginxConfig(
		domainId: number,
		domainName: string,
		projectName: string,
		port: number,
		sslEnabled: boolean
	): Promise<void> {
		const { writeFile } = await import('fs/promises');
		const { exec } = await import('child_process');
		const { promisify } = await import('util');
		const execAsync = promisify(exec);

		const configPath = `${this.nginxSitesAvailable}/${domainName}`;
		const enabledPath = `${this.nginxSitesEnabled}/${domainName}`;

		let config = `
# Nginx configuration for ${domainName} (${projectName})
server {
    listen 80;
    listen [::]:80;
    server_name ${domainName};

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    
    # Client max body size
    client_max_body_size 100M;
    
    # Timeouts
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;

    ${
			sslEnabled
				? `
    # Redirect HTTP to HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }

    # Let's Encrypt challenge
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }`
				: `
    # Proxy to application
    location / {
        proxy_pass http://localhost:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Handle errors
        proxy_intercept_errors on;
        error_page 502 503 504 @fallback;
    }
    
    # Fallback for when app is not running
    location @fallback {
        return 503 '<!DOCTYPE html><html><head><title>Service Unavailable</title></head><body><h1>Service Temporarily Unavailable</h1><p>The application is starting up or temporarily unavailable.</p></body></html>';
        add_header Content-Type text/html;
    }
    
    # Health check endpoint
    location /health {
        access_log off;
        proxy_pass http://localhost:${port}/health;
        proxy_connect_timeout 5s;
        proxy_send_timeout 5s;
        proxy_read_timeout 5s;
    }`
		}
}`;

		// Add HTTPS configuration if SSL is enabled
		if (sslEnabled) {
			config += `

# HTTPS configuration
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${domainName};

    # SSL certificate paths (will be configured by Certbot)
    ssl_certificate ${this.sslCertPath}/${domainName}/fullchain.pem;
    ssl_certificate_key ${this.sslCertPath}/${domainName}/privkey.pem;
    
    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # Client max body size
    client_max_body_size 100M;
    
    # Timeouts
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;

    # Proxy to application
    location / {
        proxy_pass http://localhost:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Handle errors
        proxy_intercept_errors on;
        error_page 502 503 504 @fallback;
    }
    
    # Fallback for when app is not running
    location @fallback {
        return 503 '<!DOCTYPE html><html><head><title>Service Unavailable</title></head><body><h1>Service Temporarily Unavailable</h1><p>The application is starting up or temporarily unavailable.</p></body></html>';
        add_header Content-Type text/html;
    }
    
    # Health check endpoint
    location /health {
        access_log off;
        proxy_pass http://localhost:${port}/health;
        proxy_connect_timeout 5s;
        proxy_send_timeout 5s;
        proxy_read_timeout 5s;
    }
}`;
		}

		// Create directories if they don't exist
		await execAsync(`sudo mkdir -p ${this.nginxSitesAvailable} ${this.nginxSitesEnabled}`);

		// Write configuration
		const { spawn } = await import('child_process');
		const teeProcess = spawn('sudo', ['tee', configPath], { stdio: ['pipe', 'ignore', 'inherit'] });
		teeProcess.stdin.write(config);
		teeProcess.stdin.end();
		await new Promise<void>((resolve, reject) => {
			teeProcess.on('close', (code) => {
				if (code === 0) resolve();
				else reject(new Error(`tee process exited with code ${code}`));
			});
		});

		// Enable site
		await execAsync(`sudo ln -sf ${configPath} ${enabledPath}`).catch(() => {
			// Link might already exist
		});

		// Update database with config path
		await this.executeQuery(
			db`UPDATE domains SET nginx_config_path = ${configPath} WHERE id = ${domainId}`
		);
	}

	/**
	 * Setup SSL certificate for domain
	 */
	private async setupSSL(domainId: number, domainName: string): Promise<void> {
		try {
			const { exec } = await import('child_process');
			const { promisify } = await import('util');
			const execAsync = promisify(exec);

			// Obtain SSL certificate with Certbot
			await execAsync(
				`sudo certbot --nginx -d ${domainName} --non-interactive --agree-tos --no-eff-email --email admin@${domainName}`
			);

			// Update database with certificate paths
			await this.executeQuery(
				db`
                    UPDATE domains 
                    SET certificate_path = ${`${this.sslCertPath}/${domainName}/fullchain.pem`},
                        private_key_path = ${`${this.sslCertPath}/${domainName}/privkey.pem`}
                    WHERE id = ${domainId}
                `
			);
		} catch (error) {
			console.error(`SSL setup failed for ${domainName}:`, error);
			throw error;
		}
	}

	/**
	 * Remove SSL certificate for domain
	 */
	private async removeSSL(domainId: number, domainName: string): Promise<void> {
		try {
			const { exec } = await import('child_process');
			const { promisify } = await import('util');
			const execAsync = promisify(exec);

			// Remove certificate
			await execAsync(`sudo certbot delete --cert-name ${domainName} --non-interactive`).catch(
				() => {
					// Certificate might not exist
				}
			);

			// Update database
			await this.executeQuery(
				db`
                    UPDATE domains 
                    SET certificate_path = NULL, private_key_path = NULL
                    WHERE id = ${domainId}
                `
			);
		} catch (error) {
			console.warn(`SSL removal failed for ${domainName}:`, error);
		}
	}

	/**
	 * Remove Nginx configuration
	 */
	private async removeNginxConfig(domainName: string): Promise<void> {
		try {
			const { exec } = await import('child_process');
			const { promisify } = await import('util');
			const execAsync = promisify(exec);

			const configPath = `${this.nginxSitesAvailable}/${domainName}`;
			const enabledPath = `${this.nginxSitesEnabled}/${domainName}`;

			// Remove symlink and config file
			await execAsync(`sudo rm -f ${enabledPath} ${configPath}`);
		} catch (error) {
			console.warn(`Failed to remove Nginx config for ${domainName}:`, error);
		}
	}

	/**
	 * Reload Nginx configuration
	 */
	private async reloadNginx(): Promise<void> {
		const { exec } = await import('child_process');
		const { promisify } = await import('util');
		const execAsync = promisify(exec);

		// Test configuration first
		await execAsync('sudo nginx -t');

		// Reload if test passes
		await execAsync('sudo systemctl reload nginx');
	}

	/**
	 * Validate domain name format
	 */
	private isValidDomain(domain: string): boolean {
		// Use the same regex as the API endpoint for consistency
		const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]$/;
		return domainRegex.test(domain) && !domain.includes('..') && domain.length <= 253;
	}

	/**
	 * Parse DNS records from dig output
	 */
	private parseDNSRecords(digOutput: string): any[] {
		const records = [];
		const lines = digOutput.split('\n');

		let inAnswerSection = false;
		for (const line of lines) {
			if (line.includes(';; ANSWER SECTION:')) {
				inAnswerSection = true;
				continue;
			}

			if (line.startsWith(';;') || line.trim() === '') {
				inAnswerSection = false;
				continue;
			}

			if (inAnswerSection && !line.startsWith(';')) {
				const parts = line.trim().split(/\s+/);
				if (parts.length >= 5) {
					records.push({
						name: parts[0],
						ttl: parts[1],
						class: parts[2],
						type: parts[3],
						value: parts.slice(4).join(' ')
					});
				}
			}
		}

		return records;
	}
}

export const domainService = new DomainService();
