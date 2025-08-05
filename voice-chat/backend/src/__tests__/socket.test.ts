import { App } from '../app';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { AddressInfo } from 'net';

describe('Socket.IO Integration Tests', () => {
  let app: App;
  let serverUrl: string;
  let clientSocket: ClientSocket;

  beforeEach((done) => {
    app = new App({
      port: 0, // Use random port
      corsOrigins: ['http://localhost:3000']
    });

    // Start the server and get the actual port
    app.httpServer.listen(0, () => {
      const address = app.httpServer.address() as AddressInfo;
      serverUrl = `http://localhost:${address.port}`;
      done();
    });
  });

  afterEach(async () => {
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
    await app.stop();
  });

  describe('Socket.IO Connection', () => {
    it('should accept socket connections', (done) => {
      clientSocket = ioClient(serverUrl, {
        transports: ['websocket'],
        reconnection: false
      });

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        done();
      });

      clientSocket.on('connect_error', (error) => {
        done(error);
      });
    });

    it('should handle multiple simultaneous connections', (done) => {
      const clients: ClientSocket[] = [];
      let connectedCount = 0;
      const totalClients = 3;

      for (let i = 0; i < totalClients; i++) {
        const client = ioClient(serverUrl, {
          transports: ['websocket'],
          reconnection: false
        });

        clients.push(client);

        client.on('connect', () => {
          connectedCount++;
          if (connectedCount === totalClients) {
            // All clients connected
            clients.forEach(c => {
              expect(c.connected).toBe(true);
              c.disconnect();
            });
            done();
          }
        });

        client.on('connect_error', (error) => {
          done(error);
        });
      }
    });

    it('should handle disconnection properly', (done) => {
      clientSocket = ioClient(serverUrl, {
        transports: ['websocket'],
        reconnection: false
      });

      clientSocket.on('connect', () => {
        clientSocket.disconnect();
      });

      clientSocket.on('disconnect', (reason) => {
        expect(reason).toBe('io client disconnect');
        expect(clientSocket.connected).toBe(false);
        done();
      });
    });
  });

  describe('Socket.IO Error Handling', () => {
    it('should handle socket errors gracefully', (done) => {
      clientSocket = ioClient(serverUrl, {
        transports: ['websocket'],
        reconnection: false
      });

      clientSocket.on('connect', () => {
        // Emit an error event to test error handling
        clientSocket.emit('error', new Error('Test error'));
        
        // Give server time to process
        setTimeout(() => {
          // Server should still be responsive
          clientSocket.emit('ping');
          done();
        }, 100);
      });
    });
  });
});