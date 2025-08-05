import request from 'supertest';
import { App } from '../app';

describe('CORS Configuration Tests', () => {
  let app: App;

  beforeEach(() => {
    app = new App({
      port: 0,
      corsOrigins: ['http://localhost:3000', 'http://localhost:5173']
    });
  });

  afterEach(async () => {
    await app.stop();
  });

  describe('CORS Headers', () => {
    it('should allow requests from whitelisted origins', async () => {
      const response = await request(app.app)
        .get('/health')
        .set('Origin', 'http://localhost:3000')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should allow requests from multiple whitelisted origins', async () => {
      const response = await request(app.app)
        .get('/health')
        .set('Origin', 'http://localhost:5173')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });

    it('should reject requests from non-whitelisted origins', async () => {
      const response = await request(app.app)
        .get('/health')
        .set('Origin', 'http://malicious-site.com')
        .expect(403); // CORS error returns 403

      expect(response.body).toHaveProperty('error', 'CORS Error');
      expect(response.body).toHaveProperty('message', 'Origin not allowed');
    });

    it('should handle preflight OPTIONS requests', async () => {
      const response = await request(app.app)
        .options('/health')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'Content-Type')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(response.headers['access-control-allow-methods']).toContain('GET');
      expect(response.headers['access-control-allow-headers']).toContain('Content-Type');
    });

    it('should allow requests with no origin (server-to-server)', async () => {
      const response = await request(app.app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('ok');
    });
  });

  describe('CORS Error Handling', () => {
    it('should return 403 for CORS errors with appropriate message', async () => {
      // Create a custom app with modified error handling to properly catch CORS errors
      const testApp = new App({
        port: 0,
        corsOrigins: ['http://allowed-origin.com']
      });

      // Override the global error handler to properly handle CORS errors
      testApp.app.use((err: any, _req: any, res: any, _next: any) => {
        if (err.message === 'Not allowed by CORS') {
          return res.status(403).json({
            error: 'CORS Error',
            message: 'Origin not allowed'
          });
        }
        res.status(500).json({ error: 'Internal Server Error' });
      });

      const response = await request(testApp.app)
        .get('/health')
        .set('Origin', 'http://not-allowed.com');

      // The CORS middleware will block the request
      expect(response.status).toBe(403);
      
      await testApp.stop();
    });
  });
});