import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { TestHelpers, TEST_CONFIG, TEST_DATA } from '../helpers';

describe('Realtime API Tests', () => {
    let testUser: any;
    let testProject: any;
    let testDomain: any;
    let testDatabase: any;
    let adminUser: any;
    let userSession: string;
    let adminSession: string;

    beforeAll(async () => {
        await TestHelpers.cleanupDatabase();
        
        // Create test users
        testUser = await TestHelpers.createTestUser('realtime_user', TestHelpers.generateTestEmail());
        adminUser = await TestHelpers.createTestUser('admin_realtime', TestHelpers.generateTestEmail(), true);
        
        // Create test sessions
        userSession = await TestHelpers.createTestSession(testUser.id);
        adminSession = await TestHelpers.createTestSession(adminUser.id);
        
        // Create test data
        testProject = await TestHelpers.createTestProject('realtime-test-project', testUser.id);
        testDomain = await TestHelpers.createTestDomain(testUser.id, 'realtime-test.example.com');
        testDatabase = await TestHelpers.createTestDatabase(testUser.id, 'realtime-test-db');
    });

    afterAll(async () => {
        await TestHelpers.cleanupDatabase();
    });

    beforeEach(async () => {
        // Clear realtime events before each test (if the table exists)
        try {
            await TestHelpers.testDb`DELETE FROM realtime_events WHERE created_at < NOW()`;
        } catch (error) {
            // Table might not exist, that's ok
        }
    });

    describe('GET /api/new/realtime/stats', () => {
        test('should return 401 for unauthenticated requests', async () => {
            const response = await TestHelpers.makeRequest('/api/new/realtime/stats', {
                method: 'GET'
            });
            
            expect(response.status).toBe(401);
            const data = await TestHelpers.expectJsonResponse(response, 401);
            expect(data.error).toBe('Authentication required');
        });

        test('should return realtime statistics for authenticated user', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/realtime/stats', userSession);
            
            expect(response.status).toBe(200);
            const data = await TestHelpers.expectJsonResponse(response);
            TestHelpers.expectSuccess(data);
            
            expect(data.data).toHaveProperty('connected_clients');
            expect(data.data).toHaveProperty('connected_users');
            expect(data.data).toHaveProperty('active_deployments');
            expect(data.data).toHaveProperty('recent_logs_count');
            
            expect(typeof data.data.connected_clients).toBe('number');
            expect(typeof data.data.connected_users).toBe('number');
            expect(typeof data.data.active_deployments).toBe('number');
            expect(typeof data.data.recent_logs_count).toBe('number');
        });

        test('should return accurate statistics', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/realtime/stats', userSession);
            
            expect(response.status).toBe(200);
            const data = await TestHelpers.expectJsonResponse(response);
            TestHelpers.expectSuccess(data);
            
            // Stats should be non-negative numbers
            expect(data.data.connected_clients).toBeGreaterThanOrEqual(0);
            expect(data.data.connected_users).toBeGreaterThanOrEqual(0);
            expect(data.data.active_deployments).toBeGreaterThanOrEqual(0);
            expect(data.data.recent_logs_count).toBeGreaterThanOrEqual(0);
        });
    });

    describe('GET /api/new/realtime/events', () => {
        test('should return 401 for unauthenticated requests', async () => {
            const response = await TestHelpers.makeRequest('/api/new/realtime/events', {
                method: 'GET'
            });
            
            expect(response.status).toBe(401);
        });

        test('should establish SSE connection for authenticated user', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/realtime/events', userSession);
            
            expect(response.status).toBe(200);
            
            // Check SSE headers
            const contentType = response.headers.get('content-type');
            const cacheControl = response.headers.get('cache-control');
            const connection = response.headers.get('connection');
            const accessControl = response.headers.get('access-control-allow-origin');
            
            expect(contentType).toBe('text/event-stream');
            expect(cacheControl).toBe('no-cache');
            expect(connection).toBe('keep-alive');
            expect(accessControl).toBe('*');
        });

        test('should handle SSE connection gracefully', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/realtime/events', userSession);
            
            expect(response.status).toBe(200);
            
            // The connection should be established without errors
            // In a real environment, this would stream data, but in tests we just verify the connection works
            expect(response.ok).toBe(true);
        });
    });

    describe('Realtime System Integration', () => {
        test('should handle realtime stats requests consistently', async () => {
            // Multiple consecutive requests should return consistent data structure
            const requests = [];
            for (let i = 0; i < 3; i++) {
                requests.push(TestHelpers.makeAuthenticatedRequest('/api/new/realtime/stats', userSession));
            }
            
            const responses = await Promise.all(requests);
            
            responses.forEach(response => {
                expect(response.status).toBe(200);
            });
            
            // All responses should have the same structure
            const dataPromises = responses.map(r => TestHelpers.expectJsonResponse(r));
            const allData = await Promise.all(dataPromises);
            
            allData.forEach(data => {
                TestHelpers.expectSuccess(data);
                expect(data.data).toHaveProperty('connected_clients');
                expect(data.data).toHaveProperty('connected_users');
                expect(data.data).toHaveProperty('active_deployments');
                expect(data.data).toHaveProperty('recent_logs_count');
            });
        });

        test('should handle concurrent SSE connection requests', async () => {
            const requests = [];
            for (let i = 0; i < 3; i++) {
                requests.push(TestHelpers.makeAuthenticatedRequest('/api/new/realtime/events', userSession));
            }
            
            const responses = await Promise.all(requests);
            
            responses.forEach(response => {
                expect(response.status).toBe(200);
                expect(response.headers.get('content-type')).toBe('text/event-stream');
            });
        });

        test('should handle admin access to realtime stats', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/realtime/stats', adminSession);
            
            expect(response.status).toBe(200);
            const data = await TestHelpers.expectJsonResponse(response);
            TestHelpers.expectSuccess(data);
            
            // Admin should get the same structure as regular users
            expect(data.data).toHaveProperty('connected_clients');
            expect(data.data).toHaveProperty('connected_users');
            expect(data.data).toHaveProperty('active_deployments');
            expect(data.data).toHaveProperty('recent_logs_count');
        });
    });

    describe('Error Handling and Edge Cases', () => {
        test('should handle malformed requests gracefully', async () => {
            // Test with invalid session
            const response = await TestHelpers.makeRequest('/api/new/realtime/stats', {
                method: 'GET',
                headers: {
                    'Cookie': 'auth_session=invalid-session-id'
                }
            });
            
            expect(response.status).toBe(401);
        });

        test('should handle POST requests to stats endpoint', async () => {
            const response = await TestHelpers.makeRequest('/api/new/realtime/stats', {
                method: 'POST',
                headers: {
                    'Cookie': `auth_session=${userSession}`
                },
                body: JSON.stringify({ test: 'data' })
            });
            
            // Should return method not allowed or handle gracefully
            expect([405, 404]).toContain(response.status);
        });

        test('should handle SSE connection with invalid authentication', async () => {
            const response = await TestHelpers.makeRequest('/api/new/realtime/events', {
                method: 'GET',
                headers: {
                    'Cookie': 'auth_session=definitely-invalid'
                }
            });
            
            expect(response.status).toBe(401);
        });
    });

    describe('Response Format Validation', () => {
        test('should return properly formatted realtime stats', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/realtime/stats', userSession);
            
            expect(response.status).toBe(200);
            const data = await TestHelpers.expectJsonResponse(response);
            
            // Validate response structure
            expect(data).toHaveProperty('success');
            expect(data).toHaveProperty('data');
            expect(data.success).toBe(true);
            
            // Validate data types
            const stats = data.data;
            expect(typeof stats.connected_clients).toBe('number');
            expect(typeof stats.connected_users).toBe('number');
            expect(typeof stats.active_deployments).toBe('number');
            expect(typeof stats.recent_logs_count).toBe('number');
            
            // Values should be reasonable
            expect(stats.connected_clients).toBeGreaterThanOrEqual(0);
            expect(stats.connected_users).toBeGreaterThanOrEqual(0);
            expect(stats.active_deployments).toBeGreaterThanOrEqual(0);
            expect(stats.recent_logs_count).toBeGreaterThanOrEqual(0);
        });

        test('should return consistent stats format across multiple requests', async () => {
            const response1 = await TestHelpers.makeAuthenticatedRequest('/api/new/realtime/stats', userSession);
            const response2 = await TestHelpers.makeAuthenticatedRequest('/api/new/realtime/stats', userSession);
            
            expect(response1.status).toBe(200);
            expect(response2.status).toBe(200);
            
            const data1 = await TestHelpers.expectJsonResponse(response1);
            const data2 = await TestHelpers.expectJsonResponse(response2);
            
            // Both should have the same structure
            expect(Object.keys(data1.data).sort()).toEqual(Object.keys(data2.data).sort());
            
            // All values should be numbers
            Object.values(data1.data).forEach(value => {
                expect(typeof value).toBe('number');
            });
            Object.values(data2.data).forEach(value => {
                expect(typeof value).toBe('number');
            });
        });
    });

    describe('Performance and Reliability', () => {
        test('should handle rapid requests without errors', async () => {
            const promises = [];
            
            // Send 10 rapid requests
            for (let i = 0; i < 10; i++) {
                promises.push(TestHelpers.makeAuthenticatedRequest('/api/new/realtime/stats', userSession));
            }
            
            const responses = await Promise.all(promises);
            
            // All requests should succeed
            responses.forEach((response, index) => {
                expect(response.status).toBe(200);
            });
        });

        test('should handle mixed user sessions correctly', async () => {
            const userResponse = await TestHelpers.makeAuthenticatedRequest('/api/new/realtime/stats', userSession);
            const adminResponse = await TestHelpers.makeAuthenticatedRequest('/api/new/realtime/stats', adminSession);
            
            expect(userResponse.status).toBe(200);
            expect(adminResponse.status).toBe(200);
            
            const userData = await TestHelpers.expectJsonResponse(userResponse);
            const adminData = await TestHelpers.expectJsonResponse(adminResponse);
            
            // Both should be successful and have the same structure
            TestHelpers.expectSuccess(userData);
            TestHelpers.expectSuccess(adminData);
            
            expect(Object.keys(userData.data).sort()).toEqual(Object.keys(adminData.data).sort());
        });
    });
});
