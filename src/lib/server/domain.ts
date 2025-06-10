import { dbUtils } from './database.js';
import { deploymentService } from './deployment.js';

export interface DomainConfig {
    domain: string;
    projectId: number;
    projectName: string;
    port: number;
    sslEnabled: boolean;
}

export const domainService = {
    async setupCustomDomain(config: DomainConfig): Promise<{ success: boolean; message: string }> {
        try {
            // Create nginx configuration for the domain
            await this.createNginxConfig(config);
            
            // Setup SSL certificate if enabled
            if (config.sslEnabled) {
                await this.setupSSLCertificate(config.domain);
            }
            
            // Test and reload nginx
            const testResult = await deploymentService.execCommand('sudo nginx -t');
            if (testResult.code !== 0) {
                throw new Error(`Nginx configuration test failed: ${testResult.stderr}`);
            }
            
            await deploymentService.execCommand('sudo systemctl reload nginx');
            
            // Update domain status
            await dbUtils.updateDomain(config.projectId, { verification_status: 'active', last_verified_at: new Date() });
            
            return { success: true, message: 'Domain configured successfully' };
        } catch (error) {
            await dbUtils.updateDomain(config.projectId, { verification_status: 'failed', last_verified_at: new Date() });
            return { success: false, message: `Domain setup failed: ${error}` };
        }
    },

    async createNginxConfig(config: DomainConfig) {
        const sslConfig = config.sslEnabled ? `
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    ssl_certificate /etc/letsencrypt/live/${config.domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${config.domain}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384;
    ssl_prefer_server_ciphers off;
    add_header Strict-Transport-Security "max-age=63072000" always;` : '';

        const redirectConfig = config.sslEnabled ? `
server {
    listen 80;
    listen [::]:80;
    server_name ${config.domain};
    return 301 https://$server_name$request_uri;
}` : '';

        const configContent = `${redirectConfig}

server {
    ${config.sslEnabled ? sslConfig : 'listen 80;\n    listen [::]:80;'}
    server_name ${config.domain};

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

    # Proxy configuration
    location / {
        proxy_pass http://localhost:${config.port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private must-revalidate auth;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/javascript;

    # Static file caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        proxy_pass http://localhost:${config.port};
    }
}`;

        const configPath = `/etc/nginx/sites-available/${config.domain}`;
        const symlinkPath = `/etc/nginx/sites-enabled/${config.domain}`;

        // Create nginx config
        await deploymentService.execCommand(`sudo tee ${configPath} > /dev/null << 'EOF'\n${configContent}\nEOF`);
        
        // Enable site
        await deploymentService.execCommand(`sudo ln -sf ${configPath} ${symlinkPath}`);
    },

    async setupSSLCertificate(domain: string): Promise<void> {
        try {
            // Check if certbot is installed
            const certbotCheck = await deploymentService.execCommand('which certbot');
            if (certbotCheck.code !== 0) {
                // Install certbot
                await deploymentService.execCommand('sudo apt update && sudo apt install -y certbot python3-certbot-nginx');
            }

            // Obtain SSL certificate
            const certResult = await deploymentService.execCommand(
                `sudo certbot certonly --nginx --non-interactive --agree-tos --email admin@${domain} -d ${domain}`
            );

            if (certResult.code !== 0) {
                throw new Error(`SSL certificate generation failed: ${certResult.stderr}`);
            }

            // Setup auto-renewal
            await deploymentService.execCommand('sudo systemctl enable certbot.timer');
            await deploymentService.execCommand('sudo systemctl start certbot.timer');

        } catch (error) {
            throw new Error(`SSL setup failed: ${error}`);
        }
    },

    async removeCustomDomain(domain: string): Promise<{ success: boolean; message: string }> {
        try {
            const configPath = `/etc/nginx/sites-available/${domain}`;
            const symlinkPath = `/etc/nginx/sites-enabled/${domain}`;

            // Remove nginx configuration
            await deploymentService.execCommand(`sudo rm -f ${configPath} ${symlinkPath}`);
            
            // Test and reload nginx
            const testResult = await deploymentService.execCommand('sudo nginx -t');
            if (testResult.code === 0) {
                await deploymentService.execCommand('sudo systemctl reload nginx');
            }

            // Remove SSL certificate
            await deploymentService.execCommand(`sudo certbot delete --cert-name ${domain} --non-interactive || true`);

            return { success: true, message: 'Domain removed successfully' };
        } catch (error) {
            return { success: false, message: `Domain removal failed: ${error}` };
        }
    },

    async checkDomainDNS(domain: string): Promise<{ configured: boolean; ip?: string }> {
        try {
            const result = await deploymentService.execCommand(`dig +short ${domain} A`);
            if (result.code === 0 && result.stdout.trim()) {
                return { configured: true, ip: result.stdout.trim() };
            }
            return { configured: false };
        } catch {
            return { configured: false };
        }
    },

    async renewSSLCertificates(): Promise<void> {
        try {
            await deploymentService.execCommand('sudo certbot renew --quiet');
        } catch (error) {
            console.error('SSL certificate renewal failed:', error);
        }
    }
};
