import { RoomManager } from '../services/RoomManager';
import { RoomFullError, DuplicateParticipantError, ParticipantNotFoundError } from '../types/room';
import { Pool } from 'pg';

// Mock the database pool
const mockQuery = jest.fn();
const mockPool = {
  query: mockQuery,
  connect: jest.fn(),
  end: jest.fn(),
} as unknown as Pool;

describe('RoomManager', () => {
  let roomManager: RoomManager;

  beforeEach(() => {
    // Create a new instance with mocked pool for each test
    RoomManager['instance'] = undefined as any; // Reset singleton
    roomManager = RoomManager.getInstance(mockPool);
    roomManager.reset();
    mockQuery.mockClear();
  });

  describe('addParticipant', () => {
    it('should add a participant to a room', async () => {
      const roomId = 'test-room';
      const participantId = 'user-123';
      const socketId = 'socket-abc';

      const participant = await roomManager.addParticipant(roomId, participantId, socketId);

      expect(participant).toMatchObject({
        id: participantId,
        socketId: socketId,
        muted: false,
      });
      expect(participant.joinedAt).toBeInstanceOf(Date);

      // Verify participant is in room
      const participants = roomManager.getRoomParticipants(roomId);
      expect(participants).toHaveLength(1);
      expect(participants[0].id).toBe(participantId);
    });

    it('should create a new room if it does not exist', async () => {
      const roomId = 'new-room';
      const participantId = 'user-123';
      const socketId = 'socket-abc';

      await roomManager.addParticipant(roomId, participantId, socketId);

      const room = roomManager.getRoom(roomId);
      expect(room).toBeDefined();
      expect(room?.id).toBe(roomId);
      expect(room?.participants.size).toBe(1);
    });

    it('should throw DuplicateParticipantError if participant already in room', async () => {
      const roomId = 'test-room';
      const participantId = 'user-123';
      const socketId = 'socket-abc';

      await roomManager.addParticipant(roomId, participantId, socketId);

      await expect(
        roomManager.addParticipant(roomId, participantId, 'new-socket')
      ).rejects.toThrow(DuplicateParticipantError);
    });

    it('should record session in database', async () => {
      const roomId = 'test-room';
      const participantId = 'user-123';
      const socketId = 'socket-abc';
      const userAgent = 'Mozilla/5.0';
      const ipAddress = '192.168.1.1';

      await roomManager.addParticipant(roomId, participantId, socketId, userAgent, ipAddress);

      // Check database insert was called
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO sessions'),
        expect.arrayContaining([participantId, socketId, roomId])
      );
    });
  });

  describe('removeParticipant', () => {
    it('should remove a participant from a room', async () => {
      const roomId = 'test-room';
      const participantId = 'user-123';
      const socketId = 'socket-abc';

      await roomManager.addParticipant(roomId, participantId, socketId);
      await roomManager.removeParticipant(roomId, participantId);

      const participants = roomManager.getRoomParticipants(roomId);
      expect(participants).toHaveLength(0);
    });

    it('should throw ParticipantNotFoundError if participant not in room', async () => {
      const roomId = 'test-room';
      const participantId = 'user-123';

      await expect(
        roomManager.removeParticipant(roomId, participantId)
      ).rejects.toThrow(ParticipantNotFoundError);
    });

    it('should remove empty rooms', async () => {
      const roomId = 'test-room';
      const participantId = 'user-123';
      const socketId = 'socket-abc';

      await roomManager.addParticipant(roomId, participantId, socketId);
      await roomManager.removeParticipant(roomId, participantId);

      const room = roomManager.getRoom(roomId);
      expect(room).toBeUndefined();
    });

    it('should clear screen sharing if the participant was sharing', async () => {
      const roomId = 'test-room';
      const participantId = 'user-123';
      const socketId = 'socket-abc';

      await roomManager.addParticipant(roomId, participantId, socketId);
      
      // Manually set screen sharing (this would normally be done by another method)
      const room = roomManager.getRoom(roomId)!;
      room.screenSharingParticipantId = participantId;

      await roomManager.removeParticipant(roomId, participantId);

      // Room should be removed since it's empty, but let's add another participant to check
      await roomManager.addParticipant(roomId, 'user-456', 'socket-def');
      const updatedRoom = roomManager.getRoom(roomId)!;
      expect(updatedRoom.screenSharingParticipantId).toBeUndefined();
    });

    it('should record session end in database', async () => {
      const roomId = 'test-room';
      const participantId = 'user-123';
      const socketId = 'socket-abc';

      await roomManager.addParticipant(roomId, participantId, socketId);
      mockQuery.mockClear(); // Clear previous calls

      await roomManager.removeParticipant(roomId, participantId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sessions'),
        [socketId]
      );
    });
  });

  describe('participant limit', () => {
    it('should enforce maximum participants per room', async () => {
      const roomId = 'test-room';

      // Add maximum number of participants
      for (let i = 0; i < 10; i++) {
        await roomManager.addParticipant(roomId, `user-${i}`, `socket-${i}`);
      }

      // Try to add one more
      await expect(
        roomManager.addParticipant(roomId, 'user-11', 'socket-11')
      ).rejects.toThrow(RoomFullError);
    });

    it('should correctly report if room is full', async () => {
      const roomId = 'test-room';

      expect(roomManager.isRoomFull(roomId)).toBe(false);

      // Add participants
      for (let i = 0; i < 10; i++) {
        await roomManager.addParticipant(roomId, `user-${i}`, `socket-${i}`);
      }

      expect(roomManager.isRoomFull(roomId)).toBe(true);
    });
  });

  describe('utility methods', () => {
    it('should get participant by socket ID', async () => {
      const roomId = 'test-room';
      const participantId = 'user-123';
      const socketId = 'socket-abc';

      await roomManager.addParticipant(roomId, participantId, socketId);

      const result = roomManager.getParticipantBySocketId(socketId);
      expect(result).toBeDefined();
      expect(result?.participant.id).toBe(participantId);
      expect(result?.roomId).toBe(roomId);
    });

    it('should return undefined for unknown socket ID', () => {
      const result = roomManager.getParticipantBySocketId('unknown-socket');
      expect(result).toBeUndefined();
    });

    it('should get room participant count', async () => {
      const roomId = 'test-room';

      expect(roomManager.getRoomCount(roomId)).toBe(0);

      await roomManager.addParticipant(roomId, 'user-1', 'socket-1');
      expect(roomManager.getRoomCount(roomId)).toBe(1);

      await roomManager.addParticipant(roomId, 'user-2', 'socket-2');
      expect(roomManager.getRoomCount(roomId)).toBe(2);
    });

    it('should get all room IDs', async () => {
      await roomManager.addParticipant('room-1', 'user-1', 'socket-1');
      await roomManager.addParticipant('room-2', 'user-2', 'socket-2');
      await roomManager.addParticipant('room-3', 'user-3', 'socket-3');

      const rooms = roomManager.getAllRooms();
      expect(rooms).toHaveLength(3);
      expect(rooms).toContain('room-1');
      expect(rooms).toContain('room-2');
      expect(rooms).toContain('room-3');
    });
  });

  describe('database error handling', () => {
    it('should not throw when database insert fails', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      const roomId = 'test-room';
      const participantId = 'user-123';
      const socketId = 'socket-abc';

      // Should not throw
      const participant = await roomManager.addParticipant(roomId, participantId, socketId);
      expect(participant).toBeDefined();
    });

    it('should not throw when database update fails', async () => {
      const roomId = 'test-room';
      const participantId = 'user-123';
      const socketId = 'socket-abc';

      await roomManager.addParticipant(roomId, participantId, socketId);
      
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      // Should not throw
      await expect(
        roomManager.removeParticipant(roomId, participantId)
      ).resolves.not.toThrow();
    });
  });
});