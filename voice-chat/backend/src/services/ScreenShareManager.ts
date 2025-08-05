import { RoomManager } from './RoomManager';
import {
  ScreenShareRequest,
  ScreenShareState,
  ScreenShareEvent,
  ScreenShareAlreadyActiveError,
  ScreenShareNotActiveError,
  UnauthorizedScreenShareError,
} from '../types/screenShare';

export class ScreenShareManager {
  private static instance: ScreenShareManager;
  private roomManager: RoomManager;
  private screenShareStates: Map<string, ScreenShareState> = new Map();

  private constructor(roomManager: RoomManager) {
    this.roomManager = roomManager;
  }

  public static getInstance(roomManager?: RoomManager): ScreenShareManager {
    if (!ScreenShareManager.instance) {
      if (!roomManager) {
        throw new Error('RoomManager is required for first initialization');
      }
      ScreenShareManager.instance = new ScreenShareManager(roomManager);
    }
    return ScreenShareManager.instance;
  }

  public async requestScreenShare(request: ScreenShareRequest): Promise<ScreenShareEvent> {
    const { roomId, participantId } = request;

    // Validate that participant is in the room
    const room = this.roomManager.getRoom(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} does not exist`);
    }

    if (!room.participants.has(participantId)) {
      throw new Error(`Participant ${participantId} is not in room ${roomId}`);
    }

    // Check if screen sharing is already active in this room
    const currentState = this.screenShareStates.get(roomId);
    if (currentState && currentState.isActive && currentState.participantId !== participantId) {
      throw new ScreenShareAlreadyActiveError(currentState.participantId!);
    }

    // Set screen sharing state
    const newState: ScreenShareState = {
      isActive: true,
      participantId,
      startedAt: new Date(),
    };

    this.screenShareStates.set(roomId, newState);

    // Update room state
    room.screenSharingParticipantId = participantId;

    console.log(`Screen sharing started by ${participantId} in room ${roomId}`);

    return {
      roomId,
      participantId,
      isSharing: true,
    };
  }

  public async stopScreenShare(request: ScreenShareRequest): Promise<ScreenShareEvent> {
    const { roomId, participantId } = request;

    // Validate that participant is in the room
    const room = this.roomManager.getRoom(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} does not exist`);
    }

    if (!room.participants.has(participantId)) {
      throw new Error(`Participant ${participantId} is not in room ${roomId}`);
    }

    // Check if screen sharing is active
    const currentState = this.screenShareStates.get(roomId);
    if (!currentState || !currentState.isActive) {
      throw new ScreenShareNotActiveError(roomId);
    }

    // Check if the participant is authorized to stop (only the sharing participant can stop)
    if (currentState.participantId !== participantId) {
      throw new UnauthorizedScreenShareError(participantId);
    }

    // Stop screen sharing
    const stoppedState: ScreenShareState = {
      isActive: false,
    };

    this.screenShareStates.set(roomId, stoppedState);

    // Update room state
    room.screenSharingParticipantId = undefined;

    console.log(`Screen sharing stopped by ${participantId} in room ${roomId}`);

    return {
      roomId,
      participantId,
      isSharing: false,
    };
  }

  public async forceStopScreenShare(
    roomId: string,
    participantId: string
  ): Promise<ScreenShareEvent | null> {
    const currentState = this.screenShareStates.get(roomId);
    if (!currentState || !currentState.isActive || currentState.participantId !== participantId) {
      return null; // No active screen sharing by this participant
    }

    // Stop screen sharing (forced, e.g., when participant disconnects)
    const stoppedState: ScreenShareState = {
      isActive: false,
    };

    this.screenShareStates.set(roomId, stoppedState);

    // Update room state
    const room = this.roomManager.getRoom(roomId);
    if (room) {
      room.screenSharingParticipantId = undefined;
    }

    console.log(`Screen sharing force stopped for ${participantId} in room ${roomId}`);

    return {
      roomId,
      participantId,
      isSharing: false,
    };
  }

  public getScreenShareState(roomId: string): ScreenShareState | null {
    return this.screenShareStates.get(roomId) || null;
  }

  public isScreenSharingActive(roomId: string): boolean {
    const state = this.screenShareStates.get(roomId);
    return state ? state.isActive : false;
  }

  public getScreenSharingParticipant(roomId: string): string | null {
    const state = this.screenShareStates.get(roomId);
    return state && state.isActive ? state.participantId || null : null;
  }

  public getAllActiveScreenShares(): Array<{
    roomId: string;
    participantId: string;
    startedAt: Date;
  }> {
    const activeShares: Array<{ roomId: string; participantId: string; startedAt: Date }> = [];

    for (const [roomId, state] of this.screenShareStates) {
      if (state.isActive && state.participantId && state.startedAt) {
        activeShares.push({
          roomId,
          participantId: state.participantId,
          startedAt: state.startedAt,
        });
      }
    }

    return activeShares;
  }

  public cleanupRoom(roomId: string): void {
    this.screenShareStates.delete(roomId);
  }

  // Testing helper
  public reset(): void {
    this.screenShareStates.clear();
  }
}
