import { App } from '../app';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { AddressInfo } from 'net';

describe('Screen Share Integration Tests', () => {
  let app: App;
  let serverUrl: string;
  let client1: ClientSocket;
  let client2: ClientSocket;
  let client3: ClientSocket | undefined;

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
    // Disconnect all clients
    [client1, client2, client3].forEach(client => {
      if (client && client.connected) {
        client.disconnect();
      }
    });

    await app.stop();
  });

  describe('Screen Share Request Flow', () => {
    it('should handle screen share request successfully', (done) => {
      client1 = ioClient(serverUrl, { transports: ['websocket'] });

      client1.on('connect', () => {
        client1.emit('join-room', { roomId: 'test-room', participantId: 'user-1' });
      });

      client1.on('join-room-success', () => {
        client1.emit('request-screen-share', {
          roomId: 'test-room',
          participantId: 'user-1'
        });
      });

      client1.on('screen-share-started', (event) => {
        expect(event.roomId).toBe('test-room');
        expect(event.participantId).toBe('user-1');
        expect(event.isSharing).toBe(true);
        done();
      });

      client1.on('screen-share-error', (error) => {
        done.fail(`Screen share error: ${error.message}`);
      });
    });

    it('should notify other participants when screen sharing starts', (done) => {
      let participantsJoined = 0;
      
      client1 = ioClient(serverUrl, { transports: ['websocket'] });
      client2 = ioClient(serverUrl, { transports: ['websocket'] });

      // Join room setup
      client1.on('connect', () => {
        client1.emit('join-room', { roomId: 'test-room', participantId: 'user-1' });
      });

      client2.on('connect', () => {
        client2.emit('join-room', { roomId: 'test-room', participantId: 'user-2' });
      });

      const checkJoins = () => {
        participantsJoined++;
        if (participantsJoined === 2) {
          // User-1 starts screen sharing
          client1.emit('request-screen-share', {
            roomId: 'test-room',
            participantId: 'user-1'
          });
        }
      };

      client1.on('join-room-success', checkJoins);
      client2.on('join-room-success', checkJoins);

      // User-2 should receive notification
      client2.on('screen-share-started', (event) => {
        expect(event.roomId).toBe('test-room');
        expect(event.participantId).toBe('user-1');
        expect(event.isSharing).toBe(true);
        done();
      });
    });

    it('should prevent concurrent screen sharing', (done) => {
      let participantsJoined = 0;
      let user1Started = false;
      
      client1 = ioClient(serverUrl, { transports: ['websocket'] });
      client2 = ioClient(serverUrl, { transports: ['websocket'] });

      // Join room setup
      client1.on('connect', () => {
        client1.emit('join-room', { roomId: 'test-room', participantId: 'user-1' });
      });

      client2.on('connect', () => {
        client2.emit('join-room', { roomId: 'test-room', participantId: 'user-2' });
      });

      const checkJoins = () => {
        participantsJoined++;
        if (participantsJoined === 2) {
          // Both users try to start screen sharing
          client1.emit('request-screen-share', {
            roomId: 'test-room',
            participantId: 'user-1'
          });
          
          setTimeout(() => {
            client2.emit('request-screen-share', {
              roomId: 'test-room',
              participantId: 'user-2'
            });
          }, 50);
        }
      };

      client1.on('join-room-success', checkJoins);
      client2.on('join-room-success', checkJoins);

      client1.on('screen-share-started', () => {
        user1Started = true;
      });

      client2.on('screen-share-error', (error) => {
        expect(error.error).toBe('SCREEN_SHARE_ALREADY_ACTIVE');
        expect(error.message).toContain('Screen sharing is already active');
        expect(user1Started).toBe(true);
        done();
      });
    });
  });

  describe('Screen Share Stop Flow', () => {
    it('should handle screen share stop successfully', (done) => {
      client1 = ioClient(serverUrl, { transports: ['websocket'] });

      client1.on('connect', () => {
        client1.emit('join-room', { roomId: 'test-room', participantId: 'user-1' });
      });

      client1.on('join-room-success', () => {
        client1.emit('request-screen-share', {
          roomId: 'test-room',
          participantId: 'user-1'
        });
      });

      client1.on('screen-share-started', () => {
        client1.emit('stop-screen-share', {
          roomId: 'test-room',
          participantId: 'user-1'
        });
      });

      client1.on('screen-share-stopped', (event) => {
        expect(event.roomId).toBe('test-room');
        expect(event.participantId).toBe('user-1');
        expect(event.isSharing).toBe(false);
        done();
      });
    });

    it('should notify other participants when screen sharing stops', (done) => {
      let participantsJoined = 0;
      
      client1 = ioClient(serverUrl, { transports: ['websocket'] });
      client2 = ioClient(serverUrl, { transports: ['websocket'] });

      // Join room setup
      client1.on('connect', () => {
        client1.emit('join-room', { roomId: 'test-room', participantId: 'user-1' });
      });

      client2.on('connect', () => {
        client2.emit('join-room', { roomId: 'test-room', participantId: 'user-2' });
      });

      const checkJoins = () => {
        participantsJoined++;
        if (participantsJoined === 2) {
          client1.emit('request-screen-share', {
            roomId: 'test-room',
            participantId: 'user-1'
          });
        }
      };

      client1.on('join-room-success', checkJoins);
      client2.on('join-room-success', checkJoins);

      client1.on('screen-share-started', () => {
        client1.emit('stop-screen-share', {
          roomId: 'test-room',
          participantId: 'user-1'
        });
      });

      // User-2 should receive stop notification
      client2.on('screen-share-stopped', (event) => {
        expect(event.roomId).toBe('test-room');
        expect(event.participantId).toBe('user-1');
        expect(event.isSharing).toBe(false);
        done();
      });
    });

    it('should prevent unauthorized stop by other participants', (done) => {
      let participantsJoined = 0;
      
      client1 = ioClient(serverUrl, { transports: ['websocket'] });
      client2 = ioClient(serverUrl, { transports: ['websocket'] });

      // Join room setup
      client1.on('connect', () => {
        client1.emit('join-room', { roomId: 'test-room', participantId: 'user-1' });
      });

      client2.on('connect', () => {
        client2.emit('join-room', { roomId: 'test-room', participantId: 'user-2' });
      });

      const checkJoins = () => {
        participantsJoined++;
        if (participantsJoined === 2) {
          client1.emit('request-screen-share', {
            roomId: 'test-room',
            participantId: 'user-1'
          });
        }
      };

      client1.on('join-room-success', checkJoins);
      client2.on('join-room-success', checkJoins);

      client1.on('screen-share-started', () => {
        // User-2 tries to stop User-1's screen sharing
        client2.emit('stop-screen-share', {
          roomId: 'test-room',
          participantId: 'user-2'
        });
      });

      client2.on('screen-share-error', (error) => {
        expect(error.error).toBe('UNAUTHORIZED_SCREEN_SHARE_STOP');
        expect(error.message).toContain('not authorized to stop');
        done();
      });
    });
  });

  describe('Screen Share Disconnect Handling', () => {
    it('should stop screen sharing when sharing participant disconnects', (done) => {
      let participantsJoined = 0;
      
      client1 = ioClient(serverUrl, { transports: ['websocket'] });
      client2 = ioClient(serverUrl, { transports: ['websocket'] });

      // Join room setup
      client1.on('connect', () => {
        client1.emit('join-room', { roomId: 'test-room', participantId: 'user-1' });
      });

      client2.on('connect', () => {
        client2.emit('join-room', { roomId: 'test-room', participantId: 'user-2' });
      });

      const checkJoins = () => {
        participantsJoined++;
        if (participantsJoined === 2) {
          client1.emit('request-screen-share', {
            roomId: 'test-room',
            participantId: 'user-1'
          });
        }
      };

      client1.on('join-room-success', checkJoins);
      client2.on('join-room-success', checkJoins);

      client1.on('screen-share-started', () => {
        // Simulate User-1 disconnecting
        client1.disconnect();
      });

      // User-2 should receive screen share stopped notification
      client2.on('screen-share-stopped', (event) => {
        expect(event.roomId).toBe('test-room');
        expect(event.participantId).toBe('user-1');
        expect(event.isSharing).toBe(false);
        done();
      });
    });
  });

  describe('Screen Share Error Handling', () => {
    it('should handle invalid screen share request', (done) => {
      client1 = ioClient(serverUrl, { transports: ['websocket'] });

      client1.on('connect', () => {
        client1.emit('join-room', { roomId: 'test-room', participantId: 'user-1' });
      });

      client1.on('join-room-success', () => {
        // Try to start screen sharing for different participant
        client1.emit('request-screen-share', {
          roomId: 'test-room',
          participantId: 'user-2' // Different participant
        });
      });

      client1.on('screen-share-error', (error) => {
        expect(error.error).toBe('VALIDATION_ERROR');
        expect(error.message).toContain('does not match socket participant');
        done();
      });
    });

    it('should handle screen share request for non-existent room', (done) => {
      client1 = ioClient(serverUrl, { transports: ['websocket'] });

      client1.on('connect', () => {
        client1.emit('join-room', { roomId: 'test-room', participantId: 'user-1' });
      });

      client1.on('join-room-success', () => {
        // Try to start screen sharing in different room
        client1.emit('request-screen-share', {
          roomId: 'other-room',
          participantId: 'user-1'
        });
      });

      client1.on('screen-share-error', (error) => {
        expect(error.error).toBe('VALIDATION_ERROR');
        expect(error.message).toContain('not in specified room');
        done();
      });
    });

    it('should handle stop request when no screen sharing is active', (done) => {
      client1 = ioClient(serverUrl, { transports: ['websocket'] });

      client1.on('connect', () => {
        client1.emit('join-room', { roomId: 'test-room', participantId: 'user-1' });
      });

      client1.on('join-room-success', () => {
        // Try to stop screen sharing without starting
        client1.emit('stop-screen-share', {
          roomId: 'test-room',
          participantId: 'user-1'
        });
      });

      client1.on('screen-share-error', (error) => {
        expect(error.error).toBe('SCREEN_SHARE_NOT_ACTIVE');
        expect(error.message).toContain('No active screen sharing');
        done();
      });
    });
  });

  describe('Multiple Participants Screen Share', () => {
    it('should allow new participant to share after previous one stops', (done) => {
      let participantsJoined = 0;
      let user1Stopped = false;
      
      client1 = ioClient(serverUrl, { transports: ['websocket'] });
      client2 = ioClient(serverUrl, { transports: ['websocket'] });

      // Join room setup
      client1.on('connect', () => {
        client1.emit('join-room', { roomId: 'test-room', participantId: 'user-1' });
      });

      client2.on('connect', () => {
        client2.emit('join-room', { roomId: 'test-room', participantId: 'user-2' });
      });

      const checkJoins = () => {
        participantsJoined++;
        if (participantsJoined === 2) {
          client1.emit('request-screen-share', {
            roomId: 'test-room',
            participantId: 'user-1'
          });
        }
      };

      client1.on('join-room-success', checkJoins);
      client2.on('join-room-success', checkJoins);

      client1.on('screen-share-started', () => {
        client1.emit('stop-screen-share', {
          roomId: 'test-room',
          participantId: 'user-1'
        });
      });

      client1.on('screen-share-stopped', () => {
        user1Stopped = true;
        // User-2 tries to start sharing after User-1 stops
        client2.emit('request-screen-share', {
          roomId: 'test-room',
          participantId: 'user-2'
        });
      });

      client2.on('screen-share-started', (event) => {
        expect(user1Stopped).toBe(true);
        expect(event.roomId).toBe('test-room');
        expect(event.participantId).toBe('user-2');
        expect(event.isSharing).toBe(true);
        done();
      });
    });
  });
});