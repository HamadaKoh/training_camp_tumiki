import { App } from '../app';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { AddressInfo } from 'net';

// Load tests - only run when explicitly requested
const runLoadTests = process.env.RUN_LOAD_TESTS === 'true';

(runLoadTests ? describe : describe.skip)('Signaling Load Tests', () => {
  let app: App;
  let serverUrl: string;
  const clients: ClientSocket[] = [];

  beforeAll((done) => {
    app = new App({
      port: 0,
      corsOrigins: ['http://localhost:3000']
    });

    app.httpServer.listen(0, () => {
      const address = app.httpServer.address() as AddressInfo;
      serverUrl = `http://localhost:${address.port}`;
      done();
    });
  }, 10000);

  afterAll(async () => {
    // Disconnect all clients
    clients.forEach(client => {
      if (client && client.connected) {
        client.disconnect();
      }
    });
    clients.length = 0;

    await app.stop();
  }, 10000);

  describe('Multiple Connections', () => {
    it('should handle 10 concurrent connections in same room', (done) => {
      const participantCount = 10;
      let connectedCount = 0;
      let joinedCount = 0;

      const connectionsPromise = Array.from({ length: participantCount }, (_, index) => {
        return new Promise<void>((resolve) => {
          const client = ioClient(serverUrl, { 
            transports: ['websocket'],
            reconnection: false 
          });
          clients.push(client);

          client.on('connect', () => {
            connectedCount++;
            client.emit('join-room', { 
              roomId: 'load-test-room', 
              participantId: `user-${index + 1}` 
            });
          });

          client.on('join-room-success', () => {
            joinedCount++;
            resolve();
          });

          client.on('join-room-error', (error) => {
            console.error(`Join error for user-${index + 1}:`, error);
            resolve(); // Resolve anyway to not block the test
          });
        });
      });

      Promise.all(connectionsPromise).then(() => {
        expect(connectedCount).toBe(participantCount);
        expect(joinedCount).toBe(participantCount);
        done();
      });
    }, 15000);

    it('should handle signaling load with multiple participants', (done) => {
      const senderIndex = 0;
      const receiverCount = Math.min(clients.length - 1, 5); // Test with 5 receivers
      let messagesReceived = 0;
      let messagesSent = 0;

      if (clients.length < 2) {
        done(); // Skip if not enough clients
        return;
      }

      const sender = clients[senderIndex];
      const receivers = clients.slice(1, receiverCount + 1);

      // Setup receivers
      receivers.forEach((receiver, _index) => {
        receiver.on('offer', (data) => {
          expect(data.from).toBe('user-1');
          messagesReceived++;
          
          if (messagesReceived === receiverCount) {
            expect(messagesSent).toBe(receiverCount);
            done();
          }
        });
      });

      // Send offers to all receivers
      receivers.forEach((_receiver, index) => {
        const targetUser = `user-${index + 2}`; // user-2, user-3, etc.
        
        sender.emit('offer', {
          roomId: 'load-test-room',
          from: 'user-1',
          to: targetUser,
          offer: { type: 'offer', sdp: `test-offer-sdp-${index}` }
        });
        messagesSent++;
      });
    }, 10000);
  });

  describe('Rapid Message Exchange', () => {
    it('should handle rapid ICE candidate exchange', (done) => {
      if (clients.length < 2) {
        done();
        return;
      }

      const client1 = clients[0];
      const client2 = clients[1];
      const candidateCount = 10;
      let candidatesReceived = 0;

      client2.on('ice-candidate', (data) => {
        expect(data.from).toBe('user-1');
        candidatesReceived++;

        if (candidatesReceived === candidateCount) {
          done();
        }
      });

      // Send rapid ICE candidates
      for (let i = 0; i < candidateCount; i++) {
        client1.emit('ice-candidate', {
          roomId: 'load-test-room',
          from: 'user-1',
          to: 'user-2',
          candidate: {
            candidate: `candidate:${i} 1 UDP 2113667326 192.168.1.${100 + i} ${54400 + i} typ host`,
            sdpMLineIndex: i % 2,
            sdpMid: `${i % 2}`
          }
        });
      }
    }, 5000);
  });

  describe('Room Capacity', () => {
    it('should enforce maximum room capacity under load', (done) => {
      // Try to add one more participant to a full room
      const extraClient = ioClient(serverUrl, { 
        transports: ['websocket'],
        reconnection: false 
      });

      extraClient.on('connect', () => {
        extraClient.emit('join-room', { 
          roomId: 'load-test-room', 
          participantId: 'user-11' 
        });
      });

      extraClient.on('join-room-error', (error) => {
        expect(error.error).toBe('ROOM_FULL');
        extraClient.disconnect();
        done();
      });

      extraClient.on('join-room-success', () => {
        // This should not happen if room is full
        extraClient.disconnect();
        done(new Error('Room should be full'));
      });
    }, 5000);
  });

  describe('Performance Metrics', () => {
    it('should measure signaling latency', (done) => {
      if (clients.length < 2) {
        done();
        return;
      }

      const client1 = clients[0];
      const client2 = clients[1];
      const testCount = 50;
      const latencies: number[] = [];
      let testIndex = 0;

      client2.on('offer', (data) => {
        const receiveTime = Date.now();
        const sendTime = parseInt(data.offer.sdp.split('-')[1]);
        const latency = receiveTime - sendTime;
        latencies.push(latency);

        if (latencies.length === testCount) {
          const avgLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
          const maxLatency = Math.max(...latencies);
          const minLatency = Math.min(...latencies);

          console.log(`Signaling Performance Metrics:`);
          console.log(`- Average latency: ${avgLatency.toFixed(2)}ms`);
          console.log(`- Min latency: ${minLatency}ms`);
          console.log(`- Max latency: ${maxLatency}ms`);
          console.log(`- Total messages: ${testCount}`);

          // Assert reasonable performance
          expect(avgLatency).toBeLessThan(100); // Average should be under 100ms
          expect(maxLatency).toBeLessThan(1000); // Max should be under 1s

          done();
        }
      });

      // Send rapid offers with timestamps
      const sendNext = () => {
        if (testIndex < testCount) {
          const sendTime = Date.now();
          client1.emit('offer', {
            roomId: 'load-test-room',
            from: 'user-1',
            to: 'user-2',
            offer: { 
              type: 'offer', 
              sdp: `test-${sendTime}-${testIndex}` 
            }
          });
          testIndex++;
          setTimeout(sendNext, 10); // Send every 10ms
        }
      };

      sendNext();
    }, 10000);
  });
});