import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { TestHelpers, TEST_CONFIG, TEST_DATA } from '../helpers';

describe('Projects API', () => {
    let testUser: any;
    let sessionId: string;

    beforeAll(async () => {
        await TestHelpers.cleanupDatabase();
        testUser = await TestHelpers.createTestUser('projectuser', TestHelpers.generateTestEmail());
        sessionId = await TestHelpers.createTestSession(testUser.id);
    });

    afterAll(async () => {
        await TestHelpers.cleanupDatabase();
    });

    beforeEach(async () => {
        // Clean up projects between tests but keep user and session
        await TestHelpers.cleanupDatabase();
        testUser = await TestHelpers.createTestUser('projectuser', TestHelpers.generateTestEmail());
        sessionId = await TestHelpers.createTestSession(testUser.id);
    });

    describe('GET /api/new/projects', () => {
        test('should return empty list for new user', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/projects', sessionId);

            const data = await TestHelpers.expectJsonResponse(response);
            TestHelpers.expectSuccess(data);
            
            expect(data.data).toBeDefined();
            expect(Array.isArray(data.data)).toBe(true);
            expect(data.data).toHaveLength(0);
        });

        test('should return user projects', async () => {
            // Create test projects
            const project1 = await TestHelpers.createTestProject('project1', testUser.id);
            const project2 = await TestHelpers.createTestProject('project2', testUser.id, 'running');

            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/projects', sessionId);

            const data = await TestHelpers.expectJsonResponse(response);
            TestHelpers.expectSuccess(data);
            
            expect(data.data).toHaveLength(2);
            
            const projectNames = data.data.map((p: any) => p.name);
            expect(projectNames).toContain('project1');
            expect(projectNames).toContain('project2');
        });

        test('should require authentication', async () => {
            const response = await TestHelpers.makeRequest('/api/new/projects');

            const data = await TestHelpers.expectJsonResponse(response, 401);
            TestHelpers.expectError(data, 'Authentication required');
        });

        test('should not return other users projects', async () => {
            // Create another user with projects
            const otherUser = await TestHelpers.createTestUser('otheruser');
            await TestHelpers.createTestProject('otherproject', otherUser.id);

            // Current user should not see other user's projects
            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/projects', sessionId);

            const data = await TestHelpers.expectJsonResponse(response);
            expect(data.data).toHaveLength(0);
        });
    });

    describe('POST /api/new/projects', () => {
        test('should create a new project', async () => {
            const projectData = {
                ...TEST_DATA.VALID_PROJECT,
                name: TestHelpers.generateProjectName(),
            };

            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/projects', sessionId, {
                method: 'POST',
                body: JSON.stringify(projectData),
            });

            const data = await TestHelpers.expectJsonResponse(response, 201);
            TestHelpers.expectSuccess(data);
            
            expect(data.data).toBeDefined();
            expect(data.data.name).toBe(projectData.name);
            expect(data.project.description).toBe(projectData.description);
            expect(data.project.github_url).toBe(projectData.github_url);
            expect(data.project.port).toBe(projectData.port);
            expect(data.project.status).toBe('stopped');
            expect(data.project.created_by).toBe(testUser.id);

            // Verify in database
            const dbProject = await TestHelpers.getProjectByName(projectData.name, testUser.id);
            expect(dbProject).toBeDefined();
        });

        test('should create project with minimal data', async () => {
            const projectData = {
                name: TestHelpers.generateProjectName(),
                description: 'Minimal project',
                repository_url: 'https://github.com/test/minimal-project'
            };

            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/projects', sessionId, {
                method: 'POST',
                body: JSON.stringify(projectData),
            });

            const data = await TestHelpers.expectJsonResponse(response, 201);
            TestHelpers.expectSuccess(data);
            
            expect(data.project.name).toBe(projectData.name);
            expect(data.project.port).toBe(3000); // default
            expect(data.project.runtime).toBe('node'); // default
        });

        test('should fail with missing name', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/projects', sessionId, {
                method: 'POST',
                body: JSON.stringify({
                    description: 'Project without name',
                }),
            });

            const data = await TestHelpers.expectJsonResponse(response, 400);
            TestHelpers.expectError(data, 'Name and repository URL required');
        });

        test('should fail with duplicate name for same user', async () => {
            const projectName = TestHelpers.generateProjectName();
            
            // Create first project
            await TestHelpers.createTestProject(projectName, testUser.id);

            // Try to create duplicate
            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/projects', sessionId, {
                method: 'POST',
                body: JSON.stringify({
                    name: projectName,
                    description: 'Duplicate project',
                    repository_url: 'https://github.com/test/duplicate-repo',
                }),
            });

            const data = await TestHelpers.expectJsonResponse(response, 409);
            TestHelpers.expectError(data, 'Project name already exists');
        });

        test('should allow same name for different users', async () => {
            const projectName = TestHelpers.generateProjectName();
            
            // Create project for other user
            const otherUser = await TestHelpers.createTestUser('otheruser2');
            await TestHelpers.createTestProject(projectName, otherUser.id);

            // Current user should be able to use same name
            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/projects', sessionId, {
                method: 'POST',
                body: JSON.stringify({
                    name: projectName,
                    description: 'Same name different user',
                    repository_url: 'https://github.com/test/same-name-repo',
                }),
            });

            const data = await TestHelpers.expectJsonResponse(response, 201);
            TestHelpers.expectSuccess(data);
        });

        test('should validate port range', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/projects', sessionId, {
                method: 'POST',
                body: JSON.stringify({
                    name: TestHelpers.generateProjectName(),
                    port: 99999, // Invalid port
                }),
            });

            const data = await TestHelpers.expectJsonResponse(response, 400);
            TestHelpers.expectError(data);
        });

        test('should validate runtime options', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/projects', sessionId, {
                method: 'POST',
                body: JSON.stringify({
                    name: TestHelpers.generateProjectName(),
                    runtime: 'invalidruntime',
                }),
            });

            const data = await TestHelpers.expectJsonResponse(response, 400);
            TestHelpers.expectError(data);
        });

        test('should require authentication', async () => {
            const response = await TestHelpers.makeRequest('/api/new/projects', {
                method: 'POST',
                body: JSON.stringify(TEST_DATA.VALID_PROJECT),
            });

            const data = await TestHelpers.expectJsonResponse(response, 401);
            TestHelpers.expectError(data, 'Authentication required');
        });
    });

    describe('GET /api/new/projects/:id', () => {
        test('should return project details', async () => {
            const project = await TestHelpers.createTestProject('detailproject', testUser.id);

            const response = await TestHelpers.makeAuthenticatedRequest(`/api/new/projects/${project.id}`, sessionId);

            const data = await TestHelpers.expectJsonResponse(response);
            TestHelpers.expectSuccess(data);
            
            expect(data.project).toBeDefined();
            expect(data.project.id).toBe(project.id);
            expect(data.project.name).toBe(project.name);
            expect(data.project.created_by).toBe(testUser.id);
        });

        test('should return 404 for non-existent project', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/projects/999999', sessionId);

            const data = await TestHelpers.expectJsonResponse(response, 404);
            TestHelpers.expectError(data, 'Project not found');
        });

        test('should not allow access to other users projects', async () => {
            const otherUser = await TestHelpers.createTestUser('otheruser3');
            const otherProject = await TestHelpers.createTestProject('otherproject', otherUser.id);

            const response = await TestHelpers.makeAuthenticatedRequest(`/api/new/projects/${otherProject.id}`, sessionId);

            const data = await TestHelpers.expectJsonResponse(response, 404);
            TestHelpers.expectError(data, 'Project not found');
        });

        test('should require authentication', async () => {
            const response = await TestHelpers.makeRequest('/api/new/projects/1');

            const data = await TestHelpers.expectJsonResponse(response, 401);
            TestHelpers.expectError(data, 'Authentication required');
        });
    });

    describe('PUT /api/new/projects/:id', () => {
        test('should update project', async () => {
            const project = await TestHelpers.createTestProject('updateproject', testUser.id);

            const updateData = {
                description: 'Updated description',
                port: 4000,
                runtime: 'python',
            };

            const response = await TestHelpers.makeAuthenticatedRequest(`/api/new/projects/${project.id}`, sessionId, {
                method: 'PUT',
                body: JSON.stringify(updateData),
            });

            const data = await TestHelpers.expectJsonResponse(response);
            TestHelpers.expectSuccess(data);
            
            expect(data.project.description).toBe(updateData.description);
            expect(data.project.port).toBe(updateData.port);
            expect(data.project.runtime).toBe(updateData.runtime);
        });

        test('should not allow updating project name to existing name', async () => {
            const project1 = await TestHelpers.createTestProject('project1', testUser.id);
            const project2 = await TestHelpers.createTestProject('project2', testUser.id);

            const response = await TestHelpers.makeAuthenticatedRequest(`/api/new/projects/${project2.id}`, sessionId, {
                method: 'PUT',
                body: JSON.stringify({
                    name: 'project1', // Try to use existing name
                }),
            });

            const data = await TestHelpers.expectJsonResponse(response, 409);
            TestHelpers.expectError(data, 'Project name already exists');
        });

        test('should return 404 for non-existent project', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/projects/999999', sessionId, {
                method: 'PUT',
                body: JSON.stringify({ description: 'Update' }),
            });

            const data = await TestHelpers.expectJsonResponse(response, 404);
            TestHelpers.expectError(data, 'Project not found');
        });
    });

    describe('DELETE /api/new/projects/:id', () => {
        test('should delete project', async () => {
            const project = await TestHelpers.createTestProject('deleteproject', testUser.id);

            const response = await TestHelpers.makeAuthenticatedRequest(`/api/new/projects/${project.id}`, sessionId, {
                method: 'DELETE',
            });

            const data = await TestHelpers.expectJsonResponse(response);
            TestHelpers.expectSuccess(data);

            // Verify project was deleted
            const dbProject = await TestHelpers.getProjectByName('deleteproject', testUser.id);
            expect(dbProject).toBeNull();
        });

        test('should return 404 for non-existent project', async () => {
            const response = await TestHelpers.makeAuthenticatedRequest('/api/new/projects/999999', sessionId, {
                method: 'DELETE',
            });

            const data = await TestHelpers.expectJsonResponse(response, 404);
            TestHelpers.expectError(data, 'Project not found');
        });

        test('should not allow deleting other users projects', async () => {
            const otherUser = await TestHelpers.createTestUser('otheruser4');
            const otherProject = await TestHelpers.createTestProject('otherproject', otherUser.id);

            const response = await TestHelpers.makeAuthenticatedRequest(`/api/new/projects/${otherProject.id}`, sessionId, {
                method: 'DELETE',
            });

            const data = await TestHelpers.expectJsonResponse(response, 404);
            TestHelpers.expectError(data, 'Project not found');
        });
    });
});
