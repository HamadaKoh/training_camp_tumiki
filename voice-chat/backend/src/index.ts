import { config } from 'dotenv';
import { App } from './app';
import { initializeDatabase } from './config/database';

// Load environment variables
config();

// Configuration
const PORT = parseInt(process.env.PORT || '3000', 10);
const CORS_ORIGINS = process.env.CORS_ORIGINS?.split(',') || [
  'http://localhost:5173',
  'http://localhost:3000',
];

// Create and start the application
const appConfig = {
  port: PORT,
  corsOrigins: CORS_ORIGINS,
};

// Initialize database first
initializeDatabase().then(() => {
  const app = new App(appConfig);
  app.start();

  // Store app instance for graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM signal received: closing HTTP server');
    await app.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT signal received: closing HTTP server');
    await app.stop();
    process.exit(0);
  });
});
