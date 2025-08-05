export interface ScreenShareRequest {
  roomId: string;
  participantId: string;
}

export interface ScreenShareState {
  isActive: boolean;
  participantId?: string;
  startedAt?: Date;
}

export interface ScreenShareEvent {
  roomId: string;
  participantId: string;
  isSharing: boolean;
}

export class ScreenShareError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = 'ScreenShareError';
  }
}

export class ScreenShareAlreadyActiveError extends ScreenShareError {
  constructor(currentSharingParticipant: string) {
    super(
      `Screen sharing is already active by participant: ${currentSharingParticipant}`,
      'SCREEN_SHARE_ALREADY_ACTIVE'
    );
  }
}

export class ScreenShareNotActiveError extends ScreenShareError {
  constructor(roomId: string) {
    super(`No active screen sharing in room: ${roomId}`, 'SCREEN_SHARE_NOT_ACTIVE');
  }
}

export class UnauthorizedScreenShareError extends ScreenShareError {
  constructor(participantId: string) {
    super(
      `Participant ${participantId} is not authorized to stop screen sharing`,
      'UNAUTHORIZED_SCREEN_SHARE_STOP'
    );
  }
}
