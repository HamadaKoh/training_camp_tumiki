import { ScreenShareManager } from '../services/ScreenShareManager';
import { RoomManager } from '../services/RoomManager';
import {
  ScreenShareAlreadyActiveError,
  ScreenShareNotActiveError,
  UnauthorizedScreenShareError
} from '../types/screenShare';

describe('ScreenShareManager', () => {
  let screenShareManager: ScreenShareManager;
  let roomManager: RoomManager;

  beforeEach(() => {
    // Reset the singleton instance for each test
    (ScreenShareManager as any).instance = undefined;
    (RoomManager as any).instance = undefined;
    
    roomManager = RoomManager.getInstance();
    screenShareManager = ScreenShareManager.getInstance(roomManager);
    
    // Reset manager state
    screenShareManager.reset();
  });

  afterEach(() => {
    // Clean up singletons
    (ScreenShareManager as any).instance = undefined;
    (RoomManager as any).instance = undefined;
  });

  describe('getInstance', () => {
    it('should create singleton instance with RoomManager', () => {
      const instance1 = ScreenShareManager.getInstance(roomManager);
      const instance2 = ScreenShareManager.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    it('should throw error if no RoomManager provided on first call', () => {
      (ScreenShareManager as any).instance = undefined;
      
      expect(() => {
        ScreenShareManager.getInstance();
      }).toThrow('RoomManager is required for first initialization');
    });
  });

  describe('requestScreenShare', () => {
    beforeEach(async () => {
      // Add participants to room
      await roomManager.addParticipant('room-1', 'user-1', 'socket-1');
      await roomManager.addParticipant('room-1', 'user-2', 'socket-2');
    });

    it('should allow screen sharing when no one is sharing', async () => {
      const request = { roomId: 'room-1', participantId: 'user-1' };
      
      const event = await screenShareManager.requestScreenShare(request);
      
      expect(event.roomId).toBe('room-1');
      expect(event.participantId).toBe('user-1');
      expect(event.isSharing).toBe(true);
      
      expect(screenShareManager.isScreenSharingActive('room-1')).toBe(true);
      expect(screenShareManager.getScreenSharingParticipant('room-1')).toBe('user-1');
    });

    it('should prevent concurrent screen sharing by different participants', async () => {
      const request1 = { roomId: 'room-1', participantId: 'user-1' };
      const request2 = { roomId: 'room-1', participantId: 'user-2' };
      
      // First request should succeed
      await screenShareManager.requestScreenShare(request1);
      
      // Second request should fail
      await expect(screenShareManager.requestScreenShare(request2))
        .rejects.toThrow(ScreenShareAlreadyActiveError);
    });

    it('should allow same participant to request screen sharing again', async () => {
      const request = { roomId: 'room-1', participantId: 'user-1' };
      
      // First request
      await screenShareManager.requestScreenShare(request);
      
      // Same participant requests again - should succeed
      const event = await screenShareManager.requestScreenShare(request);
      
      expect(event.roomId).toBe('room-1');
      expect(event.participantId).toBe('user-1');
      expect(event.isSharing).toBe(true);
    });

    it('should throw error for non-existent room', async () => {
      const request = { roomId: 'non-existent-room', participantId: 'user-1' };
      
      await expect(screenShareManager.requestScreenShare(request))
        .rejects.toThrow('Room non-existent-room does not exist');
    });

    it('should throw error for participant not in room', async () => {
      const request = { roomId: 'room-1', participantId: 'user-3' };
      
      await expect(screenShareManager.requestScreenShare(request))
        .rejects.toThrow('Participant user-3 is not in room room-1');
    });

    it('should update room state with screen sharing participant', async () => {
      const request = { roomId: 'room-1', participantId: 'user-1' };
      
      await screenShareManager.requestScreenShare(request);
      
      const room = roomManager.getRoom('room-1');
      expect(room?.screenSharingParticipantId).toBe('user-1');
    });
  });

  describe('stopScreenShare', () => {
    beforeEach(async () => {
      await roomManager.addParticipant('room-1', 'user-1', 'socket-1');
      await roomManager.addParticipant('room-1', 'user-2', 'socket-2');
      
      // Start screen sharing
      const request = { roomId: 'room-1', participantId: 'user-1' };
      await screenShareManager.requestScreenShare(request);
    });

    it('should stop screen sharing successfully', async () => {
      const request = { roomId: 'room-1', participantId: 'user-1' };
      
      const event = await screenShareManager.stopScreenShare(request);
      
      expect(event.roomId).toBe('room-1');
      expect(event.participantId).toBe('user-1');
      expect(event.isSharing).toBe(false);
      
      expect(screenShareManager.isScreenSharingActive('room-1')).toBe(false);
      expect(screenShareManager.getScreenSharingParticipant('room-1')).toBe(null);
    });

    it('should prevent unauthorized stop by other participants', async () => {
      const request = { roomId: 'room-1', participantId: 'user-2' };
      
      await expect(screenShareManager.stopScreenShare(request))
        .rejects.toThrow(UnauthorizedScreenShareError);
    });

    it('should throw error when no screen sharing is active', async () => {
      // Stop first screen sharing
      await screenShareManager.stopScreenShare({ roomId: 'room-1', participantId: 'user-1' });
      
      // Try to stop again
      const request = { roomId: 'room-1', participantId: 'user-1' };
      
      await expect(screenShareManager.stopScreenShare(request))
        .rejects.toThrow(ScreenShareNotActiveError);
    });

    it('should update room state when stopping', async () => {
      const request = { roomId: 'room-1', participantId: 'user-1' };
      
      await screenShareManager.stopScreenShare(request);
      
      const room = roomManager.getRoom('room-1');
      expect(room?.screenSharingParticipantId).toBeUndefined();
    });
  });

  describe('forceStopScreenShare', () => {
    beforeEach(async () => {
      await roomManager.addParticipant('room-1', 'user-1', 'socket-1');
      
      // Start screen sharing
      const request = { roomId: 'room-1', participantId: 'user-1' };
      await screenShareManager.requestScreenShare(request);
    });

    it('should force stop screen sharing for participant', async () => {
      const event = await screenShareManager.forceStopScreenShare('room-1', 'user-1');
      
      expect(event?.roomId).toBe('room-1');
      expect(event?.participantId).toBe('user-1');
      expect(event?.isSharing).toBe(false);
      
      expect(screenShareManager.isScreenSharingActive('room-1')).toBe(false);
    });

    it('should return null if participant is not sharing', async () => {
      const event = await screenShareManager.forceStopScreenShare('room-1', 'user-2');
      
      expect(event).toBeNull();
    });

    it('should return null if no active screen sharing', async () => {
      // Stop sharing first
      await screenShareManager.stopScreenShare({ roomId: 'room-1', participantId: 'user-1' });
      
      const event = await screenShareManager.forceStopScreenShare('room-1', 'user-1');
      
      expect(event).toBeNull();
    });
  });

  describe('state queries', () => {
    beforeEach(async () => {
      await roomManager.addParticipant('room-1', 'user-1', 'socket-1');
      await roomManager.addParticipant('room-2', 'user-2', 'socket-2');
    });

    it('should return correct screen sharing state', async () => {
      expect(screenShareManager.isScreenSharingActive('room-1')).toBe(false);
      expect(screenShareManager.getScreenSharingParticipant('room-1')).toBe(null);
      
      // Start sharing
      await screenShareManager.requestScreenShare({ roomId: 'room-1', participantId: 'user-1' });
      
      expect(screenShareManager.isScreenSharingActive('room-1')).toBe(true);
      expect(screenShareManager.getScreenSharingParticipant('room-1')).toBe('user-1');
      
      // Other room should be unaffected
      expect(screenShareManager.isScreenSharingActive('room-2')).toBe(false);
    });

    it('should return all active screen shares', async () => {
      await screenShareManager.requestScreenShare({ roomId: 'room-1', participantId: 'user-1' });
      await screenShareManager.requestScreenShare({ roomId: 'room-2', participantId: 'user-2' });
      
      const activeShares = screenShareManager.getAllActiveScreenShares();
      
      expect(activeShares).toHaveLength(2);
      expect(activeShares).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ roomId: 'room-1', participantId: 'user-1' }),
          expect.objectContaining({ roomId: 'room-2', participantId: 'user-2' })
        ])
      );
    });

    it('should get screen share state for room', async () => {
      let state = screenShareManager.getScreenShareState('room-1');
      expect(state).toBeNull();
      
      await screenShareManager.requestScreenShare({ roomId: 'room-1', participantId: 'user-1' });
      
      state = screenShareManager.getScreenShareState('room-1');
      expect(state?.isActive).toBe(true);
      expect(state?.participantId).toBe('user-1');
      expect(state?.startedAt).toBeInstanceOf(Date);
    });
  });

  describe('cleanup', () => {
    beforeEach(async () => {
      await roomManager.addParticipant('room-1', 'user-1', 'socket-1');
      await screenShareManager.requestScreenShare({ roomId: 'room-1', participantId: 'user-1' });
    });

    it('should clean up room screen sharing state', () => {
      expect(screenShareManager.isScreenSharingActive('room-1')).toBe(true);
      
      screenShareManager.cleanupRoom('room-1');
      
      expect(screenShareManager.isScreenSharingActive('room-1')).toBe(false);
      expect(screenShareManager.getScreenShareState('room-1')).toBeNull();
    });
  });
});