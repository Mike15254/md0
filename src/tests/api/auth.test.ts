import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { TestHelpers, TEST_CONFIG, TEST_DATA } from '../helpers';

describe('Authentication API', () => {
    beforeAll(async () => {
        // Ensure clean state
        await TestHelpers.cleanupDatabase();
    });

    afterAll(async () => {
        // Clean up after all tests
        await TestHelpers.cleanupDatabase();
    });

    beforeEach(async () => {
        // Clean up between tests
        await TestHelpers.cleanupDatabase();
    });

    describe('POST /api/new/auth/register', () => {
        test('should register a new user successfully', async () => {
            const userData = {
                username: 'newuser',
                password: TEST_CONFIG.TEST_USER_PASSWORD,
                email: TestHelpers.generateTestEmail(),
            };

            const response = await TestHelpers.makeRequest('/api/new/auth/register', {
                method: 'POST',
                body: JSON.stringify(userData),
            });

            const data = await TestHelpers.expectJsonResponse(response, 200);
            TestHelpers.expectSuccess(data);
            
            expect(data.user).toBeDefined();
            expect(data.user.username).toBe(userData.username);
            expect(data.user.email).toBe(userData.email);
            expect(data.user.isAdmin).toBe(false);
            expect(data.user.password_hash).toBeUndefined(); // Should not return password hash

            // Verify user was created in database
            const dbUser = await TestHelpers.getUserByUsername(userData.username);
            expect(dbUser).toBeDefined();
            expect(dbUser!.username).toBe(userData.username);
        });

        test('should fail with missing username', async () => {
            const response = await TestHelpers.makeRequest('/api/new/auth/register', {
                method: 'POST',
                body: JSON.stringify({
                    password: TEST_CONFIG.TEST_USER_PASSWORD,
                    email: TestHelpers.generateTestEmail(),
                }),
            });

            const data = await TestHelpers.expectJsonResponse(response, 400);
            TestHelpers.expectError(data, 'Username and password required');
        });

        test('should fail with missing password', async () => {
            const response = await TestHelpers.makeRequest('/api/new/auth/register', {
                method: 'POST',
                body: JSON.stringify({
                    username: 'newuser',
                    email: TestHelpers.generateTestEmail(),
                }),
            });

            const data = await TestHelpers.expectJsonResponse(response, 400);
            TestHelpers.expectError(data, 'Username and password required');
        });

        test('should fail with duplicate username', async () => {
            const userData = {
                username: 'duplicateuser',
                password: TEST_CONFIG.TEST_USER_PASSWORD,
                email: TestHelpers.generateTestEmail(),
            };

            // Create first user
            await TestHelpers.createTestUser(userData.username, userData.email);

            // Try to create duplicate
            const response = await TestHelpers.makeRequest('/api/new/auth/register', {
                method: 'POST',
                body: JSON.stringify(userData),
            });

            const data = await TestHelpers.expectJsonResponse(response, 409);
            TestHelpers.expectError(data, 'Username already taken');
        });

        test('should fail with invalid email format', async () => {
            const response = await TestHelpers.makeRequest('/api/new/auth/register', {
                method: 'POST',
                body: JSON.stringify({
                    username: 'newuser',
                    password: TEST_CONFIG.TEST_USER_PASSWORD,
                    email: 'invalid-email',
                }),
            });

            const data = await TestHelpers.expectJsonResponse(response, 400);
            TestHelpers.expectError(data, 'Invalid email format');
        });

        test('should succeed without email', async () => {
            const userData = {
                username: 'userwithoutemail',
                password: TEST_CONFIG.TEST_USER_PASSWORD,
            };

            const response = await TestHelpers.makeRequest('/api/new/auth/register', {
                method: 'POST',
                body: JSON.stringify(userData),
            });

            const data = await TestHelpers.expectJsonResponse(response, 200);
            TestHelpers.expectSuccess(data);
            expect(data.user.email).toBeNull();
        });
    });

    describe('POST /api/new/auth/login', () => {
        test('should login with valid credentials', async () => {
            // Create test user
            const testUser = await TestHelpers.createTestUser('loginuser', TestHelpers.generateTestEmail());

            const response = await TestHelpers.makeRequest('/api/new/auth/login', {
                method: 'POST',
                body: JSON.stringify({
                    username: 'loginuser',
                    password: TEST_CONFIG.DEFAULT_PASSWORD, // Using default password from test user creation
                }),
            });

            const data = await TestHelpers.expectJsonResponse(response);
            TestHelpers.expectSuccess(data);
            
            expect(data.user).toBeDefined();
            expect(data.user.id).toBe(testUser.id);
            expect(data.user.username).toBe(testUser.username);

            // Verify session was created
            const session = await TestHelpers.getSessionByUserId(testUser.id);
            expect(session).toBeDefined();
        });

        test('should login admin user', async () => {
            const response = await TestHelpers.makeRequest('/api/new/auth/login', {
                method: 'POST',
                body: JSON.stringify({
                    username: TEST_DATA.ADMIN_USER.username,
                    password: TEST_DATA.ADMIN_USER.password,
                }),
            });

            const data = await TestHelpers.expectJsonResponse(response);
            TestHelpers.expectSuccess(data);
            
            expect(data.user.username).toBe('admin');
            expect(data.user.isAdmin).toBe(true);
        });

        test('should fail with invalid username', async () => {
            const response = await TestHelpers.makeRequest('/api/new/auth/login', {
                method: 'POST',
                body: JSON.stringify({
                    username: 'nonexistentuser',
                    password: TEST_CONFIG.TEST_USER_PASSWORD,
                }),
            });

            const data = await TestHelpers.expectJsonResponse(response, 401);
            TestHelpers.expectError(data, 'Invalid credentials');
        });

        test('should fail with invalid password', async () => {
            await TestHelpers.createTestUser('loginuser2');

            const response = await TestHelpers.makeRequest('/api/new/auth/login', {
                method: 'POST',
                body: JSON.stringify({
                    username: 'loginuser2',
                    password: 'wrongpassword',
                }),
            });

            const data = await TestHelpers.expectJsonResponse(response, 401);
            TestHelpers.expectError(data, 'Invalid credentials');
        });

        test('should fail with missing credentials', async () => {
            const response = await TestHelpers.makeRequest('/api/new/auth/login', {
                method: 'POST',
                body: JSON.stringify({}),
            });

            const data = await TestHelpers.expectJsonResponse(response, 400);
            TestHelpers.expectError(data, 'Username and password required');
        });
    });

    describe('POST /api/new/auth/logout', () => {
        test('should logout successfully', async () => {
            // Create user and session
            const testUser = await TestHelpers.createTestUser('logoutuser');
            const sessionId = await TestHelpers.createTestSession(testUser.id);

            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/auth/logout', sessionId, {
                method: 'POST',
            });

            const data = await TestHelpers.expectJsonResponse(response);
            TestHelpers.expectSuccess(data);

            // Verify session was deleted
            const session = await TestHelpers.getSessionByUserId(testUser.id);
            expect(session).toBeNull();
        });

        test('should handle logout without session', async () => {
            const response = await TestHelpers.makeRequest('/api/new/auth/logout', {
                method: 'POST',
            });

            const data = await TestHelpers.expectJsonResponse(response, 401);
            TestHelpers.expectError(data, 'Not authenticated');
        });
    });

    describe('GET /api/new/auth/session', () => {
        test('should return session info for authenticated user', async () => {
            const testUser = await TestHelpers.createTestUser('sessionuser', TestHelpers.generateTestEmail());
            const sessionId = await TestHelpers.createTestSession(testUser.id);

            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/auth/session', sessionId);

            const data = await TestHelpers.expectJsonResponse(response);
            TestHelpers.expectSuccess(data);
            
            expect(data.user).toBeDefined();
            expect(data.user.id).toBe(testUser.id);
            expect(data.user.username).toBe(testUser.username);
        });

        test('should return not authenticated for invalid session', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/auth/session', 'invalid_session');

            const data = await TestHelpers.expectJsonResponse(response, 401);
            TestHelpers.expectError(data, 'Not authenticated');
        });

        test('should return not authenticated without session', async () => {
            const response = await TestHelpers.makeRequest('/api/new/auth/session');

            const data = await TestHelpers.expectJsonResponse(response, 401);
            TestHelpers.expectError(data, 'Not authenticated');
        });
    });
});
