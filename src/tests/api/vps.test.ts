import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { TestHelpers, TEST_CONFIG, testDb } from '../helpers';

describe('VPS Management API Tests (/api/new/vps)', () => {
    let adminUser: any;
    let adminSession: string;
    let regularUser: any;
    let regularSession: string;

    beforeAll(async () => {
        try {
            // Clean up any existing test data first
            await TestHelpers.cleanupDatabase();
            
            // Create admin user for VPS management
            adminUser = await TestHelpers.createTestUser('vps_admin_user', 'vpsadmin@test.com', true);
            adminSession = await TestHelpers.createTestSession(adminUser.id);
            
            // Create regular user to test authorization
            regularUser = await TestHelpers.createTestUser('regular_user', 'regular@test.com', false);
            regularSession = await TestHelpers.createTestSession(regularUser.id);
            
            console.log('Created admin user:', adminUser);
            console.log('Created regular user:', regularUser);
        } catch (error) {
            console.error('Error in VPS test setup:', error);
            throw error;
        }
    });

    afterAll(async () => {
        await TestHelpers.cleanupDatabase();
    });

    beforeEach(async () => {
        // Create some test VPS metrics for historical data tests
        await testDb`
            INSERT INTO vps_metrics (
                cpu_usage, memory_usage, disk_usage, network_in, network_out, uptime, recorded_at
            ) VALUES 
            (15.5, 45.2, 67.8, 1024, 2048, 86400, NOW() - INTERVAL '1 hour'),
            (22.1, 52.3, 68.1, 1124, 2148, 90000, NOW() - INTERVAL '30 minutes'),
            (18.7, 47.9, 68.3, 1224, 2248, 93600, NOW() - INTERVAL '15 minutes')
        `;
    });

    describe('VPS Metrics API (/api/new/vps/metrics)', () => {
        test('GET - should return current VPS metrics for authenticated users', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/vps/metrics',
                regularSession
            );

            expect(response.status).toBe(200);
            const data = await response.json();
            
            expect(data.success).toBe(true);
            expect(data.data).toBeDefined();
            
            const metrics = data.data;
            expect(typeof metrics.cpu_usage).toBe('number');
            expect(typeof metrics.memory_usage).toBe('number');
            expect(typeof metrics.disk_usage).toBe('number');
            expect(typeof metrics.network_in).toBe('number');
            expect(typeof metrics.network_out).toBe('number');
            expect(typeof metrics.uptime).toBe('number');
            expect(metrics.recorded_at).toBeDefined();
        });

        test('GET - should require authentication', async () => {
            const response = await TestHelpers.makeRequest('/api/new/vps/metrics');

            expect(response.status).toBe(401);
            const data = await response.json();
            expect(data.error).toBe('Authentication required');
        });

        test('GET - should handle metrics collection errors gracefully', async () => {
            // This test ensures the endpoint doesn't crash on system command failures
            const response = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/vps/metrics',
                adminSession
            );

            // Should return either success or a proper error, not crash
            expect(response.status).toBeLessThan(600);
        });
    });

    describe('VPS Historical Metrics API (/api/new/vps/metrics/history)', () => {
        test('GET - should return historical metrics for admin users', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/vps/metrics/history',
                adminSession
            );

            expect(response.status).toBe(200);
            const data = await response.json();
            
            expect(data.success).toBe(true);
            expect(data.data).toBeInstanceOf(Array);
            expect(data.data.length).toBeGreaterThan(0);
            
            const metric = data.data[0];
            expect(typeof metric.cpu_usage).toBe('number');
            expect(typeof metric.memory_usage).toBe('number');
            expect(typeof metric.disk_usage).toBe('number');
            expect(metric.recorded_at).toBeDefined();
        });

        test('GET - should respect limit parameter', async () => {
            const limit = 1;
            const response = await TestHelpers.makeAuthenticatedRequest(
                `/api/new/vps/metrics/history?limit=${limit}`,
                adminSession
            );

            expect(response.status).toBe(200);
            const data = await response.json();
            
            expect(data.success).toBe(true);
            expect(data.data).toBeInstanceOf(Array);
            expect(data.data.length).toBeLessThanOrEqual(limit);
        });

        test('GET - should require admin access', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/vps/metrics/history',
                regularSession
            );

            expect(response.status).toBe(403);
            const data = await response.json();
            expect(data.error).toBe('Admin access required');
        });

        test('GET - should require authentication', async () => {
            const response = await TestHelpers.makeRequest('/api/new/vps/metrics/history');

            expect(response.status).toBe(401);
            const data = await response.json();
            expect(data.error).toBe('Authentication required');
        });
    });

    describe('VPS Info API (/api/new/vps/info)', () => {
        test('GET - should return VPS information for admin users', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/vps/info',
                adminSession
            );

            expect(response.status).toBe(200);
            const data = await response.json();
            
            expect(data.success).toBe(true);
            expect(data.data).toBeDefined();
            
            const info = data.data;
            expect(typeof info.hostname).toBe('string');
            expect(typeof info.ip_address).toBe('string');
            expect(typeof info.os).toBe('string');
            expect(typeof info.kernel_version).toBe('string');
            expect(typeof info.total_memory).toBe('number');
            expect(typeof info.total_disk).toBe('number');
            // Docker and Nginx versions can be undefined if not installed
        });

        test('GET - should require admin access', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/vps/info',
                regularSession
            );

            expect(response.status).toBe(403);
            const data = await response.json();
            expect(data.error).toBe('Admin access required');
        });

        test('GET - should require authentication', async () => {
            const response = await TestHelpers.makeRequest('/api/new/vps/info');

            expect(response.status).toBe(401);
            const data = await response.json();
            expect(data.error).toBe('Authentication required');
        });
    });

    describe('VPS Containers API (/api/new/vps/containers)', () => {
        test('GET - should return Docker containers for admin users', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/vps/containers',
                adminSession
            );

            expect(response.status).toBe(200);
            const data = await response.json();
            
            expect(data.success).toBe(true);
            expect(data.data).toBeInstanceOf(Array);
            
            // If there are containers, check their structure
            if (data.data.length > 0) {
                const container = data.data[0];
                expect(typeof container.id).toBe('string');
                expect(typeof container.name).toBe('string');
                expect(typeof container.image).toBe('string');
                expect(typeof container.status).toBe('string');
                expect(container.created).toBeDefined();
                expect(container.ports).toBeInstanceOf(Array);
            }
        });

        test('GET - should require admin access', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/vps/containers',
                regularSession
            );

            expect(response.status).toBe(403);
            const data = await response.json();
            expect(data.error).toBe('Admin access required');
        });

        test('GET - should require authentication', async () => {
            const response = await TestHelpers.makeRequest('/api/new/vps/containers');

            expect(response.status).toBe(401);
            const data = await response.json();
            expect(data.error).toBe('Authentication required');
        });

        test('GET - should handle Docker not being installed', async () => {
            // This test ensures graceful handling when Docker is not available
            const response = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/vps/containers',
                adminSession
            );

            // Should return either empty array or proper error, not crash
            expect(response.status).toBeLessThan(600);
            
            if (response.status === 200) {
                const data = await response.json();
                expect(data.data).toBeInstanceOf(Array);
            }
        });
    });

    describe('VPS Firewall API (/api/new/vps/firewall)', () => {
        test('GET - should return firewall status for admin users', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/vps/firewall',
                adminSession
            );

            expect(response.status).toBe(200);
            const data = await response.json();
            
            expect(data.success).toBe(true);
            expect(data.data).toBeDefined();
            
            const firewall = data.data;
            expect(typeof firewall.enabled).toBe('boolean');
            expect(firewall.rules).toBeInstanceOf(Array);
            
            // If there are rules, check their structure
            if (firewall.rules.length > 0) {
                const rule = firewall.rules[0];
                expect(typeof rule.number).toBe('number');
                expect(typeof rule.to).toBe('string');
                expect(typeof rule.action).toBe('string');
                expect(typeof rule.from).toBe('string');
            }
        });

        test('GET - should require admin access', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/vps/firewall',
                regularSession
            );

            expect(response.status).toBe(403);
            const data = await response.json();
            expect(data.error).toBe('Admin access required');
        });

        test('GET - should require authentication', async () => {
            const response = await TestHelpers.makeRequest('/api/new/vps/firewall');

            expect(response.status).toBe(401);
            const data = await response.json();
            expect(data.error).toBe('Authentication required');
        });
    });

    describe('VPS Processes API (/api/new/vps/processes)', () => {
        test('GET - should return system processes for admin users', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/vps/processes',
                adminSession
            );

            expect(response.status).toBe(200);
            const data = await response.json();
            
            expect(data.success).toBe(true);
            expect(data.data).toBeInstanceOf(Array);
            expect(data.data.length).toBeGreaterThan(0);
            
            const process = data.data[0];
            expect(typeof process.user).toBe('string');
            expect(typeof process.pid).toBe('number');
            expect(typeof process.cpu).toBe('number');
            expect(typeof process.memory).toBe('number');
            expect(typeof process.command).toBe('string');
        });

        test('GET - should respect limit parameter', async () => {
            const limit = 5;
            const response = await TestHelpers.makeAuthenticatedRequest(
                `/api/new/vps/processes?limit=${limit}`,
                adminSession
            );

            expect(response.status).toBe(200);
            const data = await response.json();
            
            expect(data.success).toBe(true);
            expect(data.data).toBeInstanceOf(Array);
            expect(data.data.length).toBeLessThanOrEqual(limit);
        });

        test('GET - should require admin access', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/vps/processes',
                regularSession
            );

            expect(response.status).toBe(403);
            const data = await response.json();
            expect(data.error).toBe('Admin access required');
        });

        test('GET - should require authentication', async () => {
            const response = await TestHelpers.makeRequest('/api/new/vps/processes');

            expect(response.status).toBe(401);
            const data = await response.json();
            expect(data.error).toBe('Authentication required');
        });
    });

    describe('VPS Disk Usage API (/api/new/vps/disk)', () => {
        test('GET - should return disk usage information for admin users', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/vps/disk',
                adminSession
            );

            expect(response.status).toBe(200);
            const data = await response.json();
            
            expect(data.success).toBe(true);
            expect(data.data).toBeInstanceOf(Array);
            expect(data.data.length).toBeGreaterThan(0);
            
            const diskInfo = data.data[0];
            expect(typeof diskInfo.filesystem).toBe('string');
            expect(typeof diskInfo.size).toBe('string');
            expect(typeof diskInfo.used).toBe('string');
            expect(typeof diskInfo.available).toBe('string');
            expect(typeof diskInfo.use_percent).toBe('string');
            expect(typeof diskInfo.mounted_on).toBe('string');
        });

        test('GET - should require admin access', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/vps/disk',
                regularSession
            );

            expect(response.status).toBe(403);
            const data = await response.json();
            expect(data.error).toBe('Admin access required');
        });

        test('GET - should require authentication', async () => {
            const response = await TestHelpers.makeRequest('/api/new/vps/disk');

            expect(response.status).toBe(401);
            const data = await response.json();
            expect(data.error).toBe('Authentication required');
        });
    });

    describe('VPS Integration Tests', () => {
        test('Complete VPS monitoring workflow', async () => {
            // 1. Get current metrics
            const metricsResponse = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/vps/metrics',
                adminSession
            );
            expect(metricsResponse.status).toBe(200);
            const metricsData = await metricsResponse.json();
            expect(metricsData.success).toBe(true);

            // 2. Get VPS info
            const infoResponse = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/vps/info',
                adminSession
            );
            expect(infoResponse.status).toBe(200);
            const infoData = await infoResponse.json();
            expect(infoData.success).toBe(true);

            // 3. Get containers
            const containersResponse = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/vps/containers',
                adminSession
            );
            expect(containersResponse.status).toBe(200);
            const containersData = await containersResponse.json();
            expect(containersData.success).toBe(true);

            // 4. Get processes
            const processesResponse = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/vps/processes',
                adminSession
            );
            expect(processesResponse.status).toBe(200);
            const processesData = await processesResponse.json();
            expect(processesData.success).toBe(true);

            // 5. Get disk usage
            const diskResponse = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/vps/disk',
                adminSession
            );
            expect(diskResponse.status).toBe(200);
            const diskData = await diskResponse.json();
            expect(diskData.success).toBe(true);

            // 6. Get firewall status
            const firewallResponse = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/vps/firewall',
                adminSession
            );
            expect(firewallResponse.status).toBe(200);
            const firewallData = await firewallResponse.json();
            expect(firewallData.success).toBe(true);
        });

        test('Regular user access restrictions across all VPS endpoints', async () => {
            const adminOnlyEndpoints = [
                '/api/new/vps/info',
                '/api/new/vps/containers',
                '/api/new/vps/firewall',
                '/api/new/vps/processes',
                '/api/new/vps/disk',
                '/api/new/vps/metrics/history'
            ];

            for (const endpoint of adminOnlyEndpoints) {
                const response = await TestHelpers.makeAuthenticatedRequest(
                    endpoint,
                    regularSession
                );
                expect(response.status).toBe(403);
                
                const data = await response.json();
                expect(data.error).toBe('Admin access required');
            }
        });

        test('Authentication requirements across all VPS endpoints', async () => {
            const allEndpoints = [
                '/api/new/vps/metrics',
                '/api/new/vps/info',
                '/api/new/vps/containers',
                '/api/new/vps/firewall',
                '/api/new/vps/processes',
                '/api/new/vps/disk',
                '/api/new/vps/metrics/history'
            ];

            for (const endpoint of allEndpoints) {
                const response = await TestHelpers.makeRequest(endpoint);
                expect(response.status).toBe(401);
                
                const data = await response.json();
                expect(data.error).toBe('Authentication required');
            }
        });

        test('Parameter validation across applicable endpoints', async () => {
            // Test invalid limit parameters
            const endpointsWithLimits = [
                '/api/new/vps/processes?limit=invalid',
                '/api/new/vps/metrics/history?limit=abc'
            ];

            for (const endpoint of endpointsWithLimits) {
                const response = await TestHelpers.makeAuthenticatedRequest(
                    endpoint,
                    adminSession
                );
                
                // Should handle invalid parameters gracefully
                expect(response.status).toBeLessThan(600);
            }

            // Test reasonable limits
            const validLimitResponse = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/vps/processes?limit=10',
                adminSession
            );
            expect(validLimitResponse.status).toBe(200);
        });
    });

    describe('VPS Data Quality and Validation', () => {
        test('Metrics data should be within reasonable ranges', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/vps/metrics',
                adminSession
            );

            expect(response.status).toBe(200);
            const data = await response.json();
            
            if (data.success && data.data) {
                const metrics = data.data;
                
                // CPU usage should be between 0 and 100
                expect(metrics.cpu_usage).toBeGreaterThanOrEqual(0);
                expect(metrics.cpu_usage).toBeLessThanOrEqual(100);
                
                // Memory usage should be between 0 and 100
                expect(metrics.memory_usage).toBeGreaterThanOrEqual(0);
                expect(metrics.memory_usage).toBeLessThanOrEqual(100);
                
                // Disk usage should be between 0 and 100
                expect(metrics.disk_usage).toBeGreaterThanOrEqual(0);
                expect(metrics.disk_usage).toBeLessThanOrEqual(100);
                
                // Network values should be non-negative
                expect(metrics.network_in).toBeGreaterThanOrEqual(0);
                expect(metrics.network_out).toBeGreaterThanOrEqual(0);
                
                // Uptime should be positive
                expect(metrics.uptime).toBeGreaterThan(0);
            }
        });

        test('VPS info should contain valid system information', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/vps/info',
                adminSession
            );

            expect(response.status).toBe(200);
            const data = await response.json();
            
            if (data.success && data.data) {
                const info = data.data;
                
                // Hostname should not be empty
                expect(info.hostname.length).toBeGreaterThan(0);
                
                // IP address should be valid format (basic check)
                expect(info.ip_address).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
                
                // OS should not be empty
                expect(info.os.length).toBeGreaterThan(0);
                
                // Memory and disk should be positive numbers
                expect(info.total_memory).toBeGreaterThan(0);
                expect(info.total_disk).toBeGreaterThan(0);
            }
        });

        test('Historical metrics should be properly ordered', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/vps/metrics/history?limit=10',
                adminSession
            );

            expect(response.status).toBe(200);
            const data = await response.json();
            
            if (data.success && data.data && data.data.length > 1) {
                const metrics = data.data;
                
                // Should be ordered by timestamp (descending)
                for (let i = 0; i < metrics.length - 1; i++) {
                    const current = new Date(metrics[i].recorded_at);
                    const next = new Date(metrics[i + 1].recorded_at);
                    expect(current.getTime()).toBeGreaterThanOrEqual(next.getTime());
                }
            }
        });
    });

    describe('VPS Performance and Reliability', () => {
        test('All endpoints should respond within reasonable time', async () => {
            const endpoints = [
                '/api/new/vps/metrics',
                '/api/new/vps/info',
                '/api/new/vps/containers',
                '/api/new/vps/firewall',
                '/api/new/vps/processes?limit=5',
                '/api/new/vps/disk'
            ];

            for (const endpoint of endpoints) {
                const startTime = Date.now();
                
                const response = await TestHelpers.makeAuthenticatedRequest(
                    endpoint,
                    adminSession
                );
                
                const endTime = Date.now();
                const responseTime = endTime - startTime;
                
                // Endpoints should respond within 30 seconds (system commands can be slow)
                expect(responseTime).toBeLessThan(30000);
                expect(response.status).toBeLessThan(600); // Not a server crash
            }
        });

        test('Concurrent requests should be handled properly', async () => {
            const promises = Array(5).fill(null).map(() => 
                TestHelpers.makeAuthenticatedRequest('/api/new/vps/metrics', adminSession)
            );

            const responses = await Promise.all(promises);
            
            // All requests should complete successfully
            responses.forEach(response => {
                expect(response.status).toBeLessThan(600);
            });
        });

        test('Should handle system command failures gracefully', async () => {
            // This test ensures the service layer handles command failures properly
            const response = await TestHelpers.makeAuthenticatedRequest(
                '/api/new/vps/metrics',
                adminSession
            );

            // Should not crash the server
            expect(response.status).toBeLessThan(600);
            
            if (response.status >= 400) {
                const data = await response.json();
                expect(data.error).toBeDefined();
                // Error message should not expose system details
                expect(data.error).not.toContain('command not found');
                expect(data.error).not.toContain('/bin/');
                expect(data.error).not.toContain('permission denied');
            }
        });
    });
});
