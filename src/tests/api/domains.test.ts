import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { TestHelpers, TEST_CONFIG, TEST_DATA } from '../helpers';

describe('Domains API', () => {
    let testUser: any;
    let sessionId: string;
    let testProject: any;

    beforeAll(async () => {
        await TestHelpers.cleanupDatabase();
        testUser = await TestHelpers.createTestUser('domainuser', TestHelpers.generateTestEmail());
        sessionId = await TestHelpers.createTestSession(testUser.id);
    });

    afterAll(async () => {
        await TestHelpers.cleanupDatabase();
    });

    beforeEach(async () => {
        // Clean up and recreate user/session/project for each test
        await TestHelpers.cleanupDatabase();
        testUser = await TestHelpers.createTestUser('domainuser', TestHelpers.generateTestEmail());
        sessionId = await TestHelpers.createTestSession(testUser.id);
        testProject = await TestHelpers.createTestProject('domainproject', testUser.id);
    });

    describe('GET /api/new/domains', () => {
        test('should return empty list for new user', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/domains', sessionId);

            const data = await TestHelpers.expectJsonResponse(response);
            TestHelpers.expectSuccess(data);
            
            expect(data.domains).toBeDefined();
            expect(Array.isArray(data.domains)).toBe(true);
            expect(data.domains).toHaveLength(0);
        });

        test('should return user domains', async () => {
            // Create test domains
            await TestHelpers.makeAuthenticatedRequest('/api/new/domains', sessionId, {
                method: 'POST',
                body: JSON.stringify({
                    project_id: testProject.id,
                    domain_name: 'test1.example.com',
                }),
            });

            await TestHelpers.makeAuthenticatedRequest('/api/new/domains', sessionId, {
                method: 'POST',
                body: JSON.stringify({
                    project_id: testProject.id,
                    domain_name: 'test2.example.com',
                }),
            });

            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/domains', sessionId);

            const data = await TestHelpers.expectJsonResponse(response);
            TestHelpers.expectSuccess(data);
            
            expect(data.domains).toHaveLength(2);
            
            const domainNames = data.domains.map((d: any) => d.domain_name);
            expect(domainNames).toContain('test1.example.com');
            expect(domainNames).toContain('test2.example.com');
        });

        test('should require authentication', async () => {
            const response = await TestHelpers.makeRequest('/api/new/domains');

            const data = await TestHelpers.expectJsonResponse(response, 401);
            TestHelpers.expectError(data, 'Authentication required');
        });
    });

    describe('POST /api/new/domains', () => {
        test('should create a new domain', async () => {
            const domainData = {
                project_id: testProject.id,
                domain_name: TestHelpers.generateDomainName(),
                ssl_enabled: true,
                ssl_auto_renew: true,
            };

            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/domains', sessionId, {
                method: 'POST',
                body: JSON.stringify(domainData),
            });

            const data = await TestHelpers.expectJsonResponse(response, 201);
            TestHelpers.expectSuccess(data);
            
            expect(data.domain).toBeDefined();
            expect(data.domain.domain_name).toBe(domainData.domain_name);
            expect(data.domain.project_id).toBe(domainData.project_id);
            expect(data.domain.ssl_enabled).toBe(domainData.ssl_enabled);
            expect(data.domain.ssl_auto_renew).toBe(domainData.ssl_auto_renew);
            expect(data.domain.status).toBe('pending'); // default status
        });

        test('should create domain with minimal data', async () => {
            const domainData = {
                project_id: testProject.id,
                domain_name: TestHelpers.generateDomainName(),
            };

            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/domains', sessionId, {
                method: 'POST',
                body: JSON.stringify(domainData),
            });

            const data = await TestHelpers.expectJsonResponse(response, 201);
            TestHelpers.expectSuccess(data);
            
            expect(data.domain.ssl_enabled).toBe(true); // default
            expect(data.domain.ssl_auto_renew).toBe(true); // default
        });

        test('should fail with missing project_id', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/domains', sessionId, {
                method: 'POST',
                body: JSON.stringify({
                    domain_name: TestHelpers.generateDomainName(),
                }),
            });

            const data = await TestHelpers.expectJsonResponse(response, 400);
            TestHelpers.expectError(data, 'Project ID and domain name are required');
        });

        test('should fail with missing domain_name', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/domains', sessionId, {
                method: 'POST',
                body: JSON.stringify({
                    project_id: testProject.id,
                }),
            });

            const data = await TestHelpers.expectJsonResponse(response, 400);
            TestHelpers.expectError(data, 'Project ID and domain name are required');
        });

        test('should fail with invalid domain name format', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/domains', sessionId, {
                method: 'POST',
                body: JSON.stringify({
                    project_id: testProject.id,
                    domain_name: 'invalid..domain..name',
                }),
            });

            const data = await TestHelpers.expectJsonResponse(response, 400);
            TestHelpers.expectError(data, 'Invalid domain name format');
        });

        test('should fail with duplicate domain name', async () => {
            const domainName = TestHelpers.generateDomainName();
            
            // Create first domain
            await TestHelpers.makeAuthenticatedRequest('/api/new/domains', sessionId, {
                method: 'POST',
                body: JSON.stringify({
                    project_id: testProject.id,
                    domain_name: domainName,
                }),
            });

            // Try to create duplicate
            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/domains', sessionId, {
                method: 'POST',
                body: JSON.stringify({
                    project_id: testProject.id,
                    domain_name: domainName,
                }),
            });

            const data = await TestHelpers.expectJsonResponse(response, 409);
            TestHelpers.expectError(data, 'Domain name already exists');
        });

        test('should fail with non-existent project', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/domains', sessionId, {
                method: 'POST',
                body: JSON.stringify({
                    project_id: 999999,
                    domain_name: TestHelpers.generateDomainName(),
                }),
            });

            const data = await TestHelpers.expectJsonResponse(response, 404);
            TestHelpers.expectError(data, 'Project not found');
        });

        test('should not allow creating domain for other users project', async () => {
            const otherUser = await TestHelpers.createTestUser('otherdomainuser');
            const otherProject = await TestHelpers.createTestProject('otherproject', otherUser.id);

            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/domains', sessionId, {
                method: 'POST',
                body: JSON.stringify({
                    project_id: otherProject.id,
                    domain_name: TestHelpers.generateDomainName(),
                }),
            });

            const data = await TestHelpers.expectJsonResponse(response, 404);
            TestHelpers.expectError(data, 'Project not found');
        });

        test('should require authentication', async () => {
            const response = await TestHelpers.makeRequest('/api/new/domains', {
                method: 'POST',
                body: JSON.stringify({
                    project_id: testProject.id,
                    domain_name: TestHelpers.generateDomainName(),
                }),
            });

            const data = await TestHelpers.expectJsonResponse(response, 401);
            TestHelpers.expectError(data, 'Authentication required');
        });
    });

    describe('GET /api/new/domains/:id', () => {
        test('should return domain details', async () => {
            // Create domain first
            const createResponse = await TestHelpers.makeAuthenticatedRequest('/api/new/domains', sessionId, {
                method: 'POST',
                body: JSON.stringify({
                    project_id: testProject.id,
                    domain_name: TestHelpers.generateDomainName(),
                }),
            });

            const createData = await createResponse.json();
            const domainId = createData.domain.id;

            const response = await TestHelpers.makeAuthenticatedRequest(`/api/new/domains/${domainId}`, sessionId);

            const data = await TestHelpers.expectJsonResponse(response);
            TestHelpers.expectSuccess(data);
            
            expect(data.domain).toBeDefined();
            expect(data.domain.id).toBe(domainId);
            expect(data.domain.project_id).toBe(testProject.id);
        });

        test('should return 404 for non-existent domain', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/domains/999999', sessionId);

            const data = await TestHelpers.expectJsonResponse(response, 404);
            TestHelpers.expectError(data, 'Domain not found');
        });

        test('should require authentication', async () => {
            const response = await TestHelpers.makeRequest('/api/new/domains/1');

            const data = await TestHelpers.expectJsonResponse(response, 401);
            TestHelpers.expectError(data, 'Authentication required');
        });
    });

    describe('PUT /api/new/domains/:id', () => {
        test('should update domain', async () => {
            // Create domain first
            const createResponse = await TestHelpers.makeAuthenticatedRequest('/api/new/domains', sessionId, {
                method: 'POST',
                body: JSON.stringify({
                    project_id: testProject.id,
                    domain_name: TestHelpers.generateDomainName(),
                }),
            });

            const createData = await createResponse.json();
            const domainId = createData.domain.id;

            const updateData = {
                ssl_enabled: false,
                ssl_auto_renew: false,
                subdomain: 'api',
            };

            const response = await TestHelpers.makeAuthenticatedRequest(`/api/new/domains/${domainId}`, sessionId, {
                method: 'PUT',
                body: JSON.stringify(updateData),
            });

            const data = await TestHelpers.expectJsonResponse(response);
            TestHelpers.expectSuccess(data);
            
            expect(data.domain.ssl_enabled).toBe(updateData.ssl_enabled);
            expect(data.domain.ssl_auto_renew).toBe(updateData.ssl_auto_renew);
            expect(data.domain.subdomain).toBe(updateData.subdomain);
        });

        test('should return 404 for non-existent domain', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/domains/999999', sessionId, {
                method: 'PUT',
                body: JSON.stringify({ ssl_enabled: false }),
            });

            const data = await TestHelpers.expectJsonResponse(response, 404);
            TestHelpers.expectError(data, 'Domain not found');
        });
    });

    describe('DELETE /api/new/domains/:id', () => {
        test('should delete domain', async () => {
            // Create domain first
            const createResponse = await TestHelpers.makeAuthenticatedRequest('/api/new/domains', sessionId, {
                method: 'POST',
                body: JSON.stringify({
                    project_id: testProject.id,
                    domain_name: TestHelpers.generateDomainName(),
                }),
            });

            const createData = await createResponse.json();
            const domainId = createData.domain.id;

            const response = await TestHelpers.makeAuthenticatedRequest(`/api/new/domains/${domainId}`, sessionId, {
                method: 'DELETE',
            });

            const data = await TestHelpers.expectJsonResponse(response);
            TestHelpers.expectSuccess(data);

            // Verify domain was deleted
            const getResponse = await TestHelpers.makeAuthenticatedRequest(`/api/new/domains/${domainId}`, sessionId);
            expect(getResponse.status).toBe(404);
        });

        test('should return 404 for non-existent domain', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/domains/999999', sessionId, {
                method: 'DELETE',
            });

            const data = await TestHelpers.expectJsonResponse(response, 404);
            TestHelpers.expectError(data, 'Domain not found');
        });
    });

    describe('POST /api/new/domains/:id/verify', () => {
        test('should verify domain DNS configuration', async () => {
            // Create domain first
            const createResponse = await TestHelpers.makeAuthenticatedRequest('/api/new/domains', sessionId, {
                method: 'POST',
                body: JSON.stringify({
                    project_id: testProject.id,
                    domain_name: 'verify.example.com',
                }),
            });

            const createData = await createResponse.json();
            const domainId = createData.domain.id;

            const response = await TestHelpers.makeAuthenticatedRequest(`/api/new/domains/${domainId}/verify`, sessionId, {
                method: 'POST',
            });

            const data = await TestHelpers.expectJsonResponse(response);
            TestHelpers.expectSuccess(data);
            
            expect(data.verified).toBeDefined();
            expect(data.dns_records).toBeDefined();
        });

        test('should return 404 for non-existent domain', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/domains/999999/verify', sessionId, {
                method: 'POST',
            });

            const data = await TestHelpers.expectJsonResponse(response, 404);
            TestHelpers.expectError(data, 'Domain not found');
        });
    });

    describe('POST /api/new/domains/:id/ssl', () => {
        test('should provision SSL certificate', async () => {
            // Create domain first
            const createResponse = await TestHelpers.makeAuthenticatedRequest('/api/new/domains', sessionId, {
                method: 'POST',
                body: JSON.stringify({
                    project_id: testProject.id,
                    domain_name: 'ssl.example.com',
                }),
            });

            const createData = await createResponse.json();
            const domainId = createData.domain.id;

            const response = await TestHelpers.makeAuthenticatedRequest(`/api/new/domains/${domainId}/ssl`, sessionId, {
                method: 'POST',
            });

            const data = await TestHelpers.expectJsonResponse(response);
            TestHelpers.expectSuccess(data);
            
            expect(data.ssl_provisioned).toBeDefined();
            expect(data.certificate_info).toBeDefined();
        });

        test('should return 404 for non-existent domain', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/domains/999999/ssl', sessionId, {
                method: 'POST',
            });

            const data = await TestHelpers.expectJsonResponse(response, 404);
            TestHelpers.expectError(data, 'Domain not found');
        });
    });
});
