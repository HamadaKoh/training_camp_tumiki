import { SignalingHandler } from '../services/SignalingHandler';
import { RoomManager } from '../services/RoomManager';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { Pool } from 'pg';

// Mock dependencies
const mockPool = {
  query: jest.fn(),
} as unknown as Pool;

const mockSocket = {
  id: 'socket-123',
  emit: jest.fn(),
  to: jest.fn().mockReturnThis(),
  on: jest.fn(),
} as unknown as Socket;

const mockTargetSocket = {
  id: 'socket-456',
  emit: jest.fn(),
} as unknown as Socket;

const mockIO = {
  sockets: {
    sockets: new Map([
      ['socket-123', mockSocket],
      ['socket-456', mockTargetSocket]
    ])
  }
} as unknown as SocketIOServer;

describe('SignalingHandler', () => {
  let signalingHandler: SignalingHandler;
  let roomManager: RoomManager;

  beforeEach(() => {
    // Reset singleton and create new instances
    RoomManager['instance'] = undefined as any;
    roomManager = RoomManager.getInstance(mockPool);
    roomManager.reset();
    signalingHandler = new SignalingHandler(mockIO, roomManager);

    // Clear mock calls
    jest.clearAllMocks();
  });

  describe('setupSignalingHandlers', () => {
    it('should register all signaling event handlers', () => {
      signalingHandler.setupSignalingHandlers(mockSocket);

      expect(mockSocket.on).toHaveBeenCalledWith('offer', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('answer', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('ice-candidate', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('toggle-mute', expect.any(Function));
    });
  });

  describe('offer message handling', () => {
    beforeEach(async () => {
      // Setup room with two participants
      await roomManager.addParticipant('test-room', 'user-1', 'socket-123');
      await roomManager.addParticipant('test-room', 'user-2', 'socket-456');
    });

    it('should relay offer message successfully', async () => {
      const offerData = {
        roomId: 'test-room',
        from: 'user-1',
        to: 'user-2',
        offer: { type: 'offer' as const, sdp: 'test-sdp' }
      };

      // Get the actual handler function and call it
      signalingHandler.setupSignalingHandlers(mockSocket);
      const offerHandler = (mockSocket.on as jest.Mock).mock.calls
        .find(call => call[0] === 'offer')[1];
      
      await offerHandler(offerData);

      // Verify offer was relayed to target
      expect(mockTargetSocket.emit).toHaveBeenCalledWith('offer', {
        from: 'user-1',
        offer: offerData.offer,
        roomId: 'test-room'
      });

      // Verify confirmation was sent to sender
      expect(mockSocket.emit).toHaveBeenCalledWith('offer-sent', {
        to: 'user-2',
        roomId: 'test-room'
      });
    });

    it('should handle invalid destination error', async () => {
      const offerData = {
        roomId: 'test-room',
        from: 'user-1',
        to: 'user-3', // Non-existent user
        offer: { type: 'offer' as const, sdp: 'test-sdp' }
      };

      signalingHandler.setupSignalingHandlers(mockSocket);
      const offerHandler = (mockSocket.on as jest.Mock).mock.calls
        .find(call => call[0] === 'offer')[1];
      
      await offerHandler(offerData);

      // Verify error was sent to sender
      expect(mockSocket.emit).toHaveBeenCalledWith('offer-error', {
        error: 'INVALID_DESTINATION',
        message: expect.stringContaining('Invalid destination')
      });
    });

    it('should handle validation errors', async () => {
      const invalidOfferData = {
        roomId: 'test-room',
        from: 'user-1',
        to: '', // Missing destination
        offer: { type: 'offer' as const, sdp: 'test-sdp' }
      };

      signalingHandler.setupSignalingHandlers(mockSocket);
      const offerHandler = (mockSocket.on as jest.Mock).mock.calls
        .find(call => call[0] === 'offer')[1];
      
      await offerHandler(invalidOfferData);

      expect(mockSocket.emit).toHaveBeenCalledWith('offer-error', {
        error: 'VALIDATION_ERROR',
        message: expect.stringContaining('Missing required fields')
      });
    });
  });

  describe('answer message handling', () => {
    beforeEach(async () => {
      await roomManager.addParticipant('test-room', 'user-1', 'socket-123');
      await roomManager.addParticipant('test-room', 'user-2', 'socket-456');
    });

    it('should relay answer message successfully', async () => {
      const answerData = {
        roomId: 'test-room',
        from: 'user-2',
        to: 'user-1',
        answer: { type: 'answer' as const, sdp: 'test-answer-sdp' }
      };

      // Mock the socket to return user-2's participant info
      const mockSocket2 = { ...mockSocket, id: 'socket-456' } as Socket;
      
      signalingHandler.setupSignalingHandlers(mockSocket2);
      const answerHandler = (mockSocket2.on as jest.Mock).mock.calls
        .find(call => call[0] === 'answer')[1];
      
      await answerHandler(answerData);

      expect(mockSocket.emit).toHaveBeenCalledWith('answer', {
        from: 'user-2',
        answer: answerData.answer,
        roomId: 'test-room'
      });
    });
  });

  describe('ICE candidate handling', () => {
    beforeEach(async () => {
      await roomManager.addParticipant('test-room', 'user-1', 'socket-123');
      await roomManager.addParticipant('test-room', 'user-2', 'socket-456');
    });

    it('should relay ICE candidate successfully', async () => {
      const candidateData = {
        roomId: 'test-room',
        from: 'user-1',
        to: 'user-2',
        candidate: {
          candidate: 'candidate:1 1 UDP 2113667326 192.168.1.100 54400 typ host',
          sdpMLineIndex: 0,
          sdpMid: '0'
        }
      };

      signalingHandler.setupSignalingHandlers(mockSocket);
      const candidateHandler = (mockSocket.on as jest.Mock).mock.calls
        .find(call => call[0] === 'ice-candidate')[1];
      
      await candidateHandler(candidateData);

      expect(mockTargetSocket.emit).toHaveBeenCalledWith('ice-candidate', {
        from: 'user-1',
        candidate: candidateData.candidate,
        roomId: 'test-room'
      });
    });

    it('should validate ICE candidate format', async () => {
      const invalidCandidateData = {
        roomId: 'test-room',
        from: 'user-1',
        to: 'user-2',
        candidate: {
          candidate: 123, // Invalid type
          sdpMLineIndex: 0,
          sdpMid: '0'
        }
      };

      signalingHandler.setupSignalingHandlers(mockSocket);
      const candidateHandler = (mockSocket.on as jest.Mock).mock.calls
        .find(call => call[0] === 'ice-candidate')[1];
      
      await candidateHandler(invalidCandidateData);

      expect(mockSocket.emit).toHaveBeenCalledWith('ice-candidate-error', {
        error: 'VALIDATION_ERROR',
        message: expect.stringContaining('Invalid ICE candidate format')
      });
    });
  });

  describe('mute toggle handling', () => {
    beforeEach(async () => {
      await roomManager.addParticipant('test-room', 'user-1', 'socket-123');
      await roomManager.addParticipant('test-room', 'user-2', 'socket-456');
    });

    it('should handle mute toggle successfully', async () => {
      const muteData = {
        roomId: 'test-room',
        participantId: 'user-1',
        muted: true
      };

      signalingHandler.setupSignalingHandlers(mockSocket);
      const muteHandler = (mockSocket.on as jest.Mock).mock.calls
        .find(call => call[0] === 'toggle-mute')[1];
      
      await muteHandler(muteData);

      // Verify participant was muted
      const room = roomManager.getRoom('test-room');
      const participant = room?.participants.get('user-1');
      expect(participant?.muted).toBe(true);

      // Verify other participants were notified
      expect(mockSocket.to).toHaveBeenCalledWith('test-room');
      expect(mockSocket.emit).toHaveBeenCalledWith('participant-muted', {
        participantId: 'user-1',
        muted: true,
        roomId: 'test-room'
      });

      // Verify confirmation was sent
      expect(mockSocket.emit).toHaveBeenCalledWith('mute-toggled', {
        participantId: 'user-1',
        muted: true,
        roomId: 'test-room'
      });
    });

    it('should prevent participants from muting others', async () => {
      const muteData = {
        roomId: 'test-room',
        participantId: 'user-2', // Trying to mute another user
        muted: true
      };

      signalingHandler.setupSignalingHandlers(mockSocket);
      const muteHandler = (mockSocket.on as jest.Mock).mock.calls
        .find(call => call[0] === 'toggle-mute')[1];
      
      await muteHandler(muteData);

      expect(mockSocket.emit).toHaveBeenCalledWith('mute-error', {
        error: 'VALIDATION_ERROR',
        message: expect.stringContaining('Can only toggle own mute status')
      });
    });
  });

  describe('validation', () => {
    it('should prevent self-signaling', async () => {
      await roomManager.addParticipant('test-room', 'user-1', 'socket-123');

      const selfOfferData = {
        roomId: 'test-room',
        from: 'user-1',
        to: 'user-1', // Self-signaling
        offer: { type: 'offer' as const, sdp: 'test-sdp' }
      };

      signalingHandler.setupSignalingHandlers(mockSocket);
      const offerHandler = (mockSocket.on as jest.Mock).mock.calls
        .find(call => call[0] === 'offer')[1];
      
      await offerHandler(selfOfferData);

      expect(mockSocket.emit).toHaveBeenCalledWith('offer-error', {
        error: 'VALIDATION_ERROR',
        message: expect.stringContaining('Cannot send signaling message to self')
      });
    });

    it('should validate sender is in room', async () => {
      await roomManager.addParticipant('other-room', 'user-1', 'socket-123');
      await roomManager.addParticipant('test-room', 'user-2', 'socket-456');

      const crossRoomOffer = {
        roomId: 'test-room',
        from: 'user-1', // In different room
        to: 'user-2',
        offer: { type: 'offer' as const, sdp: 'test-sdp' }
      };

      signalingHandler.setupSignalingHandlers(mockSocket);
      const offerHandler = (mockSocket.on as jest.Mock).mock.calls
        .find(call => call[0] === 'offer')[1];
      
      await offerHandler(crossRoomOffer);

      expect(mockSocket.emit).toHaveBeenCalledWith('offer-error', {
        error: 'VALIDATION_ERROR',
        message: expect.stringContaining('Sender not in specified room')
      });
    });
  });

  describe('statistics', () => {
    it('should return signaling statistics', async () => {
      await roomManager.addParticipant('room-1', 'user-1', 'socket-123');
      await roomManager.addParticipant('room-1', 'user-2', 'socket-456');
      await roomManager.addParticipant('room-2', 'user-3', 'socket-789');

      const stats = signalingHandler.getSignalingStats();

      expect(stats).toEqual({
        connectedSockets: 2, // Based on mocked sockets
        activeRooms: 2,
        totalParticipants: 3
      });
    });

    it('should return zero stats when no activity', () => {
      const stats = signalingHandler.getSignalingStats();

      expect(stats).toEqual({
        connectedSockets: 2, // Based on mocked sockets
        activeRooms: 0,
        totalParticipants: 0
      });
    });
  });
});