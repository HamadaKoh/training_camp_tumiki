import { App } from '../app';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { AddressInfo } from 'net';

describe('Signaling Integration Tests', () => {
  let app: App;
  let serverUrl: string;
  let client1: ClientSocket;
  let client2: ClientSocket;
  let client3: ClientSocket;

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

  describe('WebRTC Signaling Flow', () => {
    it('should handle complete offer-answer signaling flow', (done) => {
      let participantsJoined = 0;
      let offerReceived = false;
      let answerReceived = false;

      // Setup clients
      client1 = ioClient(serverUrl, { transports: ['websocket'] });
      client2 = ioClient(serverUrl, { transports: ['websocket'] });

      // Client 1 joins room
      client1.on('connect', () => {
        client1.emit('join-room', { roomId: 'test-room', participantId: 'user-1' });
      });

      client1.on('join-room-success', () => {
        participantsJoined++;
        if (participantsJoined === 2) {
          startSignaling();
        }
      });

      // Client 2 joins room
      client2.on('connect', () => {
        client2.emit('join-room', { roomId: 'test-room', participantId: 'user-2' });
      });

      client2.on('join-room-success', () => {
        participantsJoined++;
        if (participantsJoined === 2) {
          startSignaling();
        }
      });

      // Setup signaling handlers
      client2.on('offer', (data) => {
        expect(data.from).toBe('user-1');
        expect(data.offer.type).toBe('offer');
        expect(data.offer.sdp).toBe('test-offer-sdp');
        offerReceived = true;

        // Send answer back
        client2.emit('answer', {
          roomId: 'test-room',
          from: 'user-2',
          to: 'user-1',
          answer: { type: 'answer', sdp: 'test-answer-sdp' }
        });
      });

      client1.on('answer', (data) => {
        expect(data.from).toBe('user-2');
        expect(data.answer.type).toBe('answer');
        expect(data.answer.sdp).toBe('test-answer-sdp');
        answerReceived = true;

        // Check if both offer and answer were received
        if (offerReceived && answerReceived) {
          done();
        }
      });

      function startSignaling() {
        // Client 1 sends offer to Client 2
        client1.emit('offer', {
          roomId: 'test-room',
          from: 'user-1',
          to: 'user-2',
          offer: { type: 'offer', sdp: 'test-offer-sdp' }
        });
      }
    });

    it('should handle ICE candidate exchange', (done) => {
      let participantsJoined = 0;
      // let candidateReceived = false;

      client1 = ioClient(serverUrl, { transports: ['websocket'] });
      client2 = ioClient(serverUrl, { transports: ['websocket'] });

      // Join room setup
      client1.on('connect', () => {
        client1.emit('join-room', { roomId: 'test-room', participantId: 'user-1' });
      });

      client2.on('connect', () => {
        client2.emit('join-room', { roomId: 'test-room', participantId: 'user-2' });
      });

      client1.on('join-room-success', () => {
        participantsJoined++;
        if (participantsJoined === 2) {
          startICEExchange();
        }
      });

      client2.on('join-room-success', () => {
        participantsJoined++;
        if (participantsJoined === 2) {
          startICEExchange();
        }
      });

      // ICE candidate handling
      client2.on('ice-candidate', (data) => {
        expect(data.from).toBe('user-1');
        expect(data.candidate.candidate).toContain('candidate:');
        expect(data.candidate.sdpMLineIndex).toBe(0);
        // candidateReceived = true;
        done();
      });

      function startICEExchange() {
        client1.emit('ice-candidate', {
          roomId: 'test-room',
          from: 'user-1',
          to: 'user-2',
          candidate: {
            candidate: 'candidate:1 1 UDP 2113667326 192.168.1.100 54400 typ host',
            sdpMLineIndex: 0,
            sdpMid: '0'
          }
        });
      }
    });
  });

  describe('Mute Status Synchronization', () => {
    it('should synchronize mute status across participants', (done) => {
      let participantsJoined = 0;

      client1 = ioClient(serverUrl, { transports: ['websocket'] });
      client2 = ioClient(serverUrl, { transports: ['websocket'] });

      // Join room
      client1.on('connect', () => {
        client1.emit('join-room', { roomId: 'test-room', participantId: 'user-1' });
      });

      client2.on('connect', () => {
        client2.emit('join-room', { roomId: 'test-room', participantId: 'user-2' });
      });

      client1.on('join-room-success', () => {
        participantsJoined++;
        if (participantsJoined === 2) {
          testMute();
        }
      });

      client2.on('join-room-success', () => {
        participantsJoined++;
        if (participantsJoined === 2) {
          testMute();
        }
      });

      // Mute status handling
      client2.on('participant-muted', (data) => {
        expect(data.participantId).toBe('user-1');
        expect(data.muted).toBe(true);
        expect(data.roomId).toBe('test-room');
        done();
      });

      function testMute() {
        client1.emit('toggle-mute', {
          roomId: 'test-room',
          participantId: 'user-1',
          muted: true
        });
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle signaling to non-existent participant', (done) => {
      client1 = ioClient(serverUrl, { transports: ['websocket'] });

      client1.on('connect', () => {
        client1.emit('join-room', { roomId: 'test-room', participantId: 'user-1' });
      });

      client1.on('join-room-success', () => {
        // Try to send offer to non-existent participant
        client1.emit('offer', {
          roomId: 'test-room',
          from: 'user-1',
          to: 'non-existent-user',
          offer: { type: 'offer', sdp: 'test-sdp' }
        });
      });

      client1.on('offer-error', (error) => {
        expect(error.error).toBe('INVALID_DESTINATION');
        expect(error.message).toContain('Invalid destination');
        done();
      });
    });

    it('should prevent unauthorized signaling', (done) => {
      client1 = ioClient(serverUrl, { transports: ['websocket'] });
      client2 = ioClient(serverUrl, { transports: ['websocket'] });

      client1.on('connect', () => {
        client1.emit('join-room', { roomId: 'test-room', participantId: 'user-1' });
      });

      client2.on('connect', () => {
        client2.emit('join-room', { roomId: 'other-room', participantId: 'user-2' });
      });

      let joinCount = 0;
      const checkJoins = () => {
        joinCount++;
        if (joinCount === 2) {
          // User-1 tries to signal to User-2 in different room
          client1.emit('offer', {
            roomId: 'other-room', // Different room
            from: 'user-1',
            to: 'user-2',
            offer: { type: 'offer', sdp: 'test-sdp' }
          });
        }
      };

      client1.on('join-room-success', checkJoins);
      client2.on('join-room-success', checkJoins);

      client1.on('offer-error', (error) => {
        expect(error.error).toBe('VALIDATION_ERROR');
        expect(error.message).toContain('Sender not in specified room');
        done();
      });
    });
  });

  describe('Multi-participant Signaling', () => {
    it('should handle signaling between multiple participants', (done) => {
      let participantsJoined = 0;
      let offersReceived = 0;
      const expectedOffers = 2; // user-1 to user-2 and user-3

      client1 = ioClient(serverUrl, { transports: ['websocket'] });
      client2 = ioClient(serverUrl, { transports: ['websocket'] });
      client3 = ioClient(serverUrl, { transports: ['websocket'] });

      // Join room
      [client1, client2, client3].forEach((client, index) => {
        client.on('connect', () => {
          client.emit('join-room', { 
            roomId: 'test-room', 
            participantId: `user-${index + 1}` 
          });
        });

        client.on('join-room-success', () => {
          participantsJoined++;
          if (participantsJoined === 3) {
            startMultiSignaling();
          }
        });
      });

      // Setup offer receivers
      [client2, client3].forEach((client) => {
        client.on('offer', (data) => {
          expect(data.from).toBe('user-1');
          expect(data.offer.type).toBe('offer');
          offersReceived++;
          
          if (offersReceived === expectedOffers) {
            done();
          }
        });
      });

      function startMultiSignaling() {
        // User-1 sends offers to both user-2 and user-3
        client1.emit('offer', {
          roomId: 'test-room',
          from: 'user-1',
          to: 'user-2',
          offer: { type: 'offer', sdp: 'test-offer-sdp-1' }
        });

        client1.emit('offer', {
          roomId: 'test-room',
          from: 'user-1',
          to: 'user-3',
          offer: { type: 'offer', sdp: 'test-offer-sdp-2' }
        });
      }
    });
  });
});