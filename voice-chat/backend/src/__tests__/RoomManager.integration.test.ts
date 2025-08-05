import { RoomManager } from '../services/RoomManager';
import { Pool } from 'pg';

// Only run these tests if TEST_DATABASE_URL is set
const skipDatabaseTests = !process.env.TEST_DATABASE_URL;

// Use test database if available
const testPool = skipDatabaseTests 
  ? undefined 
  : new Pool({ connectionString: process.env.TEST_DATABASE_URL });

(skipDatabaseTests ? describe.skip : describe)('RoomManager Database Integration', () => {
  let roomManager: RoomManager;

  beforeAll(async () => {
    if (testPool) {
      // Clean up test database
      await testPool.query('DELETE FROM event_logs');
      await testPool.query('DELETE FROM sessions');
    }
  });

  beforeEach(async () => {
    if (testPool) {
      // Reset singleton and create new instance with test pool
      RoomManager['instance'] = undefined as any;
      roomManager = RoomManager.getInstance(testPool);
      roomManager.reset();
      
      // Clean up before each test
      await testPool.query('DELETE FROM event_logs');
      await testPool.query('DELETE FROM sessions');
    }
  });

  afterAll(async () => {
    if (testPool) {
      await testPool.end();
    }
  });

  describe('session recording', () => {
    it('should create session record when participant joins', async () => {
      const roomId = 'test-room';
      const participantId = 'user-123';
      const socketId = 'socket-abc';
      const userAgent = 'Test User Agent';
      const ipAddress = '127.0.0.1';

      await roomManager.addParticipant(roomId, participantId, socketId, userAgent, ipAddress);

      // Verify session was created
      const result = await testPool!.query(
        'SELECT * FROM sessions WHERE participant_id = $1',
        [participantId]
      );

      expect(result.rows).toHaveLength(1);
      const session = result.rows[0];
      expect(session.participant_id).toBe(participantId);
      expect(session.socket_id).toBe(socketId);
      expect(session.room_id).toBe(roomId);
      expect(session.user_agent).toBe(userAgent);
      expect(session.ip_address).toBe(ipAddress);
      expect(session.left_at).toBeNull();
    });

    it('should update session when participant leaves', async () => {
      const roomId = 'test-room';
      const participantId = 'user-123';
      const socketId = 'socket-abc';

      await roomManager.addParticipant(roomId, participantId, socketId);
      await roomManager.removeParticipant(roomId, participantId);

      // Verify session was updated
      const result = await testPool!.query(
        'SELECT * FROM sessions WHERE participant_id = $1',
        [participantId]
      );

      expect(result.rows).toHaveLength(1);
      const session = result.rows[0];
      expect(session.left_at).not.toBeNull();
    });
  });

  describe('event logging', () => {
    it('should log join_room event', async () => {
      const roomId = 'test-room';
      const participantId = 'user-123';
      const socketId = 'socket-abc';

      await roomManager.addParticipant(roomId, participantId, socketId);

      // Wait a bit for async logging
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify event was logged
      const result = await testPool!.query(
        `SELECT el.* FROM event_logs el
         JOIN sessions s ON el.session_id = s.id
         WHERE s.participant_id = $1 AND el.event_type = 'join_room'`,
        [participantId]
      );

      expect(result.rows).toHaveLength(1);
      const event = result.rows[0];
      expect(event.event_data).toMatchObject({
        participantId,
        roomId,
        participantCount: 1
      });
    });

    it('should log leave_room event', async () => {
      const roomId = 'test-room';
      const participantId = 'user-123';
      const socketId = 'socket-abc';

      await roomManager.addParticipant(roomId, participantId, socketId);
      await roomManager.removeParticipant(roomId, participantId);

      // Wait a bit for async logging and trigger
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify leave event was logged
      const result = await testPool!.query(
        `SELECT el.* FROM event_logs el
         JOIN sessions s ON el.session_id = s.id
         WHERE s.participant_id = $1 AND el.event_type = 'leave_room'`,
        [participantId]
      );

      expect(result.rows).toHaveLength(1);
      const event = result.rows[0];
      expect(event.event_data).toMatchObject({
        participantId,
        roomId,
        participantCount: 0
      });
    });
  });

  describe('multiple participants', () => {
    it('should handle multiple participants joining and leaving', async () => {
      const roomId = 'test-room';
      const participants = [
        { id: 'user-1', socketId: 'socket-1' },
        { id: 'user-2', socketId: 'socket-2' },
        { id: 'user-3', socketId: 'socket-3' }
      ];

      // Add all participants
      for (const p of participants) {
        await roomManager.addParticipant(roomId, p.id, p.socketId);
      }

      // Verify all sessions exist
      const joinResult = await testPool!.query(
        'SELECT COUNT(*) FROM sessions WHERE room_id = $1 AND left_at IS NULL',
        [roomId]
      );
      expect(joinResult.rows[0].count).toBe('3');

      // Remove one participant
      await roomManager.removeParticipant(roomId, participants[1].id);

      // Verify active sessions
      const activeResult = await testPool!.query(
        'SELECT COUNT(*) FROM sessions WHERE room_id = $1 AND left_at IS NULL',
        [roomId]
      );
      expect(activeResult.rows[0].count).toBe('2');
    });
  });
});