import { config } from 'dotenv';
import { createApp, createServer } from './app';
import { initializeDatabase } from './config/database';

// Load environment variables
config();

// Configuration
const PORT = parseInt(process.env.PORT || '3000', 10);

// Initialize database first
initializeDatabase().then(() => {
  // Create Express app
  const app = createApp();
  
  // Create HTTP and Socket.IO servers
  const { httpServer, socketIOServer } = createServer(app);
  
  // Start the server
  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  // Store server instance for graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM signal received: closing HTTP server');
    httpServer.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
    socketIOServer.close(() => {
      console.log('Socket.IO server closed');
    });
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT signal received: closing HTTP server');
    httpServer.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
    socketIOServer.close(() => {
      console.log('Socket.IO server closed');
    });
  });
});
