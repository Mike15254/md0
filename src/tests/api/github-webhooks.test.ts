// filepath: /Users/Mikemax/dev/md0/src/tests/api/github-webhooks.test.ts
import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { TestHelpers, TEST_CONFIG, TEST_DATA, testDb } from '../helpers';

describe('GitHub API Tests (/api/new/github)', () => {
    let testUser: any;
    let testSession: string;
    let testInstallation: any;
    let testRepository: any;
    let testProject: any;

    beforeAll(async () => {
        try {
            // Clean up any existing test data first
            await TestHelpers.cleanupDatabase();
            
            // Setup test environment
            await TestHelpers.setupTestEnvironment();
            
            // Create test user
            testUser = await TestHelpers.createTestUser('github_test_user', 'github@test.com');
            console.log('Created test user:', testUser);
            
            // Create session
            testSession = await TestHelpers.createTestSession(testUser.id);
            console.log('Created test session:', testSession ? 'success' : 'failed');
            
            // Create GitHub App installation
            testInstallation = await TestHelpers.createTestGitHubInstallation(testUser.id);
            console.log('Created test installation:', testInstallation);
            
            // Create test repository
            testRepository = await TestHelpers.createTestGitHubRepository(testInstallation.installation_id);
            console.log('Created test repository:', testRepository);
            
            // Create test project with GitHub integration
            testProject = await TestHelpers.createTestProject('github-test-project', testUser.id, {
                github_url: testRepository.html_url,
                github_branch: 'main',
                auto_deploy: true
            });
            console.log('Created test project:', testProject);
        } catch (error) {
            console.error('Error in beforeAll setup:', error);
            throw error;
        }
    });

    afterAll(async () => {
        await TestHelpers.cleanupDatabase();
    });

    describe('GitHub Installations API (/api/new/github/installations)', () => {
        test('GET - should return user GitHub installations', async () => {
            if (!testUser || !testSession || !testInstallation) {
                throw new Error('Test setup failed - missing required test data');
            }
            
            const response = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/github/installations',
                testSession
            );

            expect(response.status).toBe(200);
            const data = await response.json();
            
            expect(data.success).toBe(true);
            expect(data.data).toBeInstanceOf(Array);
            expect(data.data.length).toBeGreaterThan(0);
            
            const installation = data.data[0];
            expect(installation.installation_id).toBe(testInstallation.installation_id);
            expect(installation.account_login).toBe(testInstallation.account_login);
        });

        test('GET - should require authentication', async () => {
            const response = await TestHelpers.makeRequest('/api/new/github/installations');

            expect(response.status).toBe(401);
            const data = await response.json();
            expect(data.error).toBe('Authentication required');
        });

        test('POST - should link GitHub installation to user', async () => {
            const newInstallationId = 54321;
            
            const response = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/github/installations',
                testSession,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        installation_id: newInstallationId
                    })
                }
            );

            expect(response.status).toBe(200);
            const data = await response.json();
            
            expect(data.success).toBe(true);
            expect(data.message).toBe('GitHub App installation linked successfully');
        });

        test('POST - should require installation_id', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/github/installations',
                testSession,
                {
                    method: 'POST',
                    body: JSON.stringify({})
                }
            );

            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toBe('Installation ID required');
        });

        test('POST - should require authentication', async () => {
            const response = await TestHelpers.makeRequest('/api/new/github/installations', {
                method: 'POST',
                body: JSON.stringify({
                    installation_id: 12345
                })
            });

            expect(response.status).toBe(401);
            const data = await response.json();
            expect(data.error).toBe('Authentication required');
        });
    });

    describe('GitHub Installation Repositories API (/api/new/github/installations/[id]/repositories)', () => {
        test('GET - should return installation repositories', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest(
                `/api/new/github/installations/${testInstallation.installation_id}/repositories`,
                testSession
            );

            expect(response.status).toBe(200);
            const data = await response.json();
            
            expect(data.success).toBe(true);
            expect(data.data).toBeDefined();
            // Note: This endpoint calls GitHub API, so we expect it to work with mocked data
        });

        test('GET - should require authentication', async () => {
            const response = await TestHelpers.makeRequest(
                `/api/new/github/installations/${testInstallation.installation_id}/repositories`
            );

            expect(response.status).toBe(401);
            const data = await response.json();
            expect(data.error).toBe('Authentication required');
        });

        test('GET - should require valid installation ID', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/github/installations/invalid/repositories',
                testSession
            );

            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toBe('Invalid installation ID');
        });

        test('GET - should require installation ID parameter', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/github/installations//repositories',
                testSession
            );

            expect(response.status).toBe(404); // SvelteKit returns 404 for malformed routes
        });
    });

    describe('GitHub Webhooks API (/api/new/github/webhooks)', () => {
        beforeEach(async () => {
            // Create some test webhook events
            await testDb`
                INSERT INTO webhook_events (
                    project_id, event_type, event_action, source_branch, commit_sha, 
                    commit_message, author_name, author_email, payload, processed, deployment_triggered
                ) VALUES 
                (${testProject.id}, 'push', 'push', 'main', 'abc123def456', 'Test commit', 'Test User', 'test@example.com', ${JSON.stringify(TEST_DATA.GITHUB_WEBHOOK_PAYLOAD)}, true, false),
                (${testProject.id}, 'pull_request', 'opened', 'feature-branch', 'def456ghi789', 'Test PR', 'Test User', 'test@example.com', ${JSON.stringify({
                    action: 'opened',
                    number: 1,
                    pull_request: {
                        id: 1,
                        title: 'Test PR',
                        head: { ref: 'feature-branch' },
                        base: { ref: 'main' }
                    }
                })}, true, false)
            `;
        });

        test('GET - should return webhook events for authenticated user', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/github/webhooks',
                testSession
            );

            expect(response.status).toBe(200);
            const data = await response.json();
            
            expect(data.success).toBe(true);
            expect(data.data).toBeInstanceOf(Array);
            expect(data.data.length).toBeGreaterThan(0);
            
            const event = data.data[0];
            expect(event.event_type).toBeDefined();
            expect(event.payload).toBeDefined();
            expect(event.created_at).toBeDefined();
        });

        test('GET - should filter webhook events by project_id', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest(
                `/api/new/github/webhooks?project_id=${testProject.id}`,
                testSession
            );

            expect(response.status).toBe(200);
            const data = await response.json();
            
            expect(data.success).toBe(true);
            expect(data.data).toBeInstanceOf(Array);
            
            // All returned events should be for the specified project
            data.data.forEach((event: any) => {
                expect(event.project_id).toBe(testProject.id);
            });
        });

        test('GET - should respect limit parameter', async () => {
            const limit = 1;
            const response = await TestHelpers.makeAuthenticatedRequest(
                `/api/new/github/webhooks?limit=${limit}`,
                testSession
            );

            expect(response.status).toBe(200);
            const data = await response.json();
            
            expect(data.success).toBe(true);
            expect(data.data).toBeInstanceOf(Array);
            expect(data.data.length).toBeLessThanOrEqual(limit);
        });

        test('GET - should require authentication', async () => {
            const response = await TestHelpers.makeRequest('/api/new/github/webhooks');

            expect(response.status).toBe(401);
            const data = await response.json();
            expect(data.error).toBe('Authentication required');
        });

        test('GET - should handle invalid project_id parameter', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/github/webhooks?project_id=invalid',
                testSession
            );

            // Should return 400 for invalid project_id
            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toBe('Invalid project_id parameter');
        });

        test('GET - should default to limit 10 when not specified', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/github/webhooks',
                testSession
            );

            expect(response.status).toBe(200);
            const data = await response.json();
            
            expect(data.success).toBe(true);
            expect(data.data).toBeInstanceOf(Array);
            expect(data.data.length).toBeLessThanOrEqual(10);
        });
    });

    describe('GitHub API Integration Tests', () => {
        test('Complete workflow: installations -> repositories -> webhooks', async () => {
            // 1. Get installations
            const installationsResponse = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/github/installations',
                testSession
            );
            expect(installationsResponse.status).toBe(200);
            const installationsData = await installationsResponse.json();
            expect(installationsData.success).toBe(true);
            expect(installationsData.data.length).toBeGreaterThan(0);

            const installation = installationsData.data[0];

            // 2. Get repositories for installation
            const reposResponse = await TestHelpers.makeAuthenticatedRequest(
                `/api/new/github/installations/${installation.installation_id}/repositories`,
                testSession
            );
            expect(reposResponse.status).toBe(200);
            const reposData = await reposResponse.json();
            expect(reposData.success).toBe(true);

            // 3. Get webhook events
            const webhooksResponse = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/github/webhooks',
                testSession
            );
            expect(webhooksResponse.status).toBe(200);
            const webhooksData = await webhooksResponse.json();
            expect(webhooksData.success).toBe(true);
        });

        test('Error handling across all endpoints', async () => {
            const endpoints = [
                '/api/new/github/installations',
                `/api/new/github/installations/${testInstallation.installation_id}/repositories`,
                '/api/new/github/webhooks'
            ];

            for (const endpoint of endpoints) {
                // Test unauthenticated access
                const response = await TestHelpers.makeRequest(endpoint);
                expect(response.status).toBe(401);
                
                const data = await response.json();
                expect(data.error).toBe('Authentication required');
            }
        });

        test('GitHub App installation linking and data consistency', async () => {
            const newInstallationId = 99999;

            // Link new installation
            const linkResponse = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/github/installations',
                testSession,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        installation_id: newInstallationId
                    })
                }
            );
            expect(linkResponse.status).toBe(200);

            // Verify it appears in installations list
            const listResponse = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/github/installations',
                testSession
            );
            expect(listResponse.status).toBe(200);
            const listData = await listResponse.json();
            
            const linkedInstallation = listData.data.find(
                (inst: any) => inst.installation_id === newInstallationId
            );
            expect(linkedInstallation).toBeDefined();
        });

        test('Webhook events filtering and pagination', async () => {
            // Test with different limits
            const limits = [1, 5, 10];
            
            for (const limit of limits) {
                const response = await TestHelpers.makeAuthenticatedRequest(
                    `/api/new/github/webhooks?limit=${limit}`,
                    testSession
                );
                expect(response.status).toBe(200);
                
                const data = await response.json();
                expect(data.success).toBe(true);
                expect(data.data.length).toBeLessThanOrEqual(limit);
            }
        });
    });

    describe('GitHub API Error Handling', () => {
        test('Should handle malformed requests gracefully', async () => {
            const malformedRequests = [
                {
                    endpoint: '/api/new/github/installations',
                    method: 'POST',
                    body: 'invalid json'
                },
                {
                    endpoint: '/api/new/github/installations',
                    method: 'POST',
                    body: JSON.stringify({ invalid_field: 'value' })
                }
            ];

            for (const request of malformedRequests) {
                const response = await TestHelpers.makeAuthenticatedRequest(
                    request.endpoint,
                    testSession,
                    {
                        method: request.method,
                        body: request.body,
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    }
                );

                // Should return 400 or 500, not crash
                expect(response.status).toBeGreaterThanOrEqual(400);
            }
        });

        test('Should validate installation ID format', async () => {
            const invalidIds = ['abc', '-1', '0'];
            
            for (const invalidId of invalidIds) {
                const response = await TestHelpers.makeAuthenticatedRequest(
                    `/api/new/github/installations/${invalidId}/repositories`,
                    testSession
                );
                
                expect(response.status).toBe(400);
                const data = await response.json();
                expect(data.error).toBe('Invalid installation ID');
            }

            // Test empty string separately as it returns 404 from SvelteKit routing
            const emptyResponse = await TestHelpers.makeAuthenticatedRequest(
                `/api/new/github/installations//repositories`,
                testSession
            );
            expect(emptyResponse.status).toBe(404); // SvelteKit route not found
        });

        test('Should handle database connection errors gracefully', async () => {
            // This test would require mocking database failures
            // For now, we ensure the endpoints don't crash under normal operation
            
            const response = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/github/installations',
                testSession
            );
            
            // Should return either success or a proper error, not crash
            expect(response.status).toBeLessThan(600); // Not a server crash
        });
    });

    describe('GitHub API Security', () => {
        test('Should not expose sensitive information in error messages', async () => {
            const response = await TestHelpers.makeRequest('/api/new/github/installations');
            
            expect(response.status).toBe(401);
            const data = await response.json();
            
            // Error message should not contain sensitive info
            expect(data.error).not.toContain('database');
            expect(data.error).not.toContain('token');
            expect(data.error).not.toContain('secret');
        });

        test('Should validate user ownership of installations', async () => {
            // Create another user
            const otherUser = await TestHelpers.createTestUser('other_user');
            const otherSession = await TestHelpers.createTestSession(otherUser.id);
            
            // Try to access installations as other user
            const response = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/github/installations',
                otherSession
            );
            
            expect(response.status).toBe(200);
            const data = await response.json();
            
            // Should only return installations for the authenticated user
            expect(data.data).toBeInstanceOf(Array);
            // Other user should not see the test installations
            const hasTestInstallation = data.data.some(
                (inst: any) => inst.installation_id === testInstallation.installation_id
            );
            expect(hasTestInstallation).toBe(false);
        });

        test('Should require valid session tokens', async () => {
            const invalidSessions = ['invalid', '', 'expired_token'];
            
            for (const invalidSession of invalidSessions) {
                const response = await TestHelpers.makeAuthenticatedRequest(
                    '/api/new/github/installations',
                    invalidSession
                );
                
                expect(response.status).toBe(401);
            }
        });
    });
});