import request from 'supertest';
import { App } from '../app';

describe('Health Check Endpoint', () => {
  let app: App;

  beforeEach(() => {
    app = new App({
      port: 0, // Use random port for testing
      corsOrigins: ['http://localhost:3000']
    });
  });

  afterEach(async () => {
    await app.stop();
  });

  describe('GET /health', () => {
    it('should return 200 status with health information', async () => {
      const response = await request(app.app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(typeof response.body.uptime).toBe('number');
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return valid ISO timestamp', async () => {
      const response = await request(app.app)
        .get('/health')
        .expect(200);

      const timestamp = new Date(response.body.timestamp);
      expect(timestamp).toBeInstanceOf(Date);
      expect(timestamp.getTime()).not.toBeNaN();
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app.app)
        .get('/unknown-route')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Not Found');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('GET /unknown-route');
    });

    it('should return 404 for POST to unknown routes', async () => {
      const response = await request(app.app)
        .post('/another-unknown')
        .expect(404);

      expect(response.body.message).toContain('POST /another-unknown');
    });
  });
});