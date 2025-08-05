export interface Participant {
  id: string;
  socketId: string;
  joinedAt: Date;
  muted?: boolean;
}

export interface Room {
  id: string;
  participants: Map<string, Participant>;
  screenSharingParticipantId?: string;
  createdAt: Date;
}

export interface SessionRecord {
  id?: string;
  participantId: string;
  socketId: string;
  roomId: string;
  joinedAt: Date;
  leftAt?: Date;
  userAgent?: string;
  ipAddress?: string;
}

export class RoomFullError extends Error {
  constructor(roomId: string, maxParticipants: number) {
    super(`Room ${roomId} is full. Maximum participants: ${maxParticipants}`);
    this.name = 'RoomFullError';
  }
}

export class DuplicateParticipantError extends Error {
  constructor(participantId: string, roomId: string) {
    super(`Participant ${participantId} is already in room ${roomId}`);
    this.name = 'DuplicateParticipantError';
  }
}

export class ParticipantNotFoundError extends Error {
  constructor(participantId: string, roomId: string) {
    super(`Participant ${participantId} not found in room ${roomId}`);
    this.name = 'ParticipantNotFoundError';
  }
}
