import { Server as SocketIOServer, Socket } from 'socket.io';
import { RoomManager } from './RoomManager';
import { ScreenShareManager } from './ScreenShareManager';
import {
  OfferMessage,
  AnswerMessage,
  ICECandidateMessage,
  InvalidDestinationError,
  SignalingValidationError,
} from '../types/signaling';
import {
  ScreenShareRequest,
  ScreenShareAlreadyActiveError,
  ScreenShareNotActiveError,
  UnauthorizedScreenShareError,
} from '../types/screenShare';

export class SignalingHandler {
  private io: SocketIOServer;
  private roomManager: RoomManager;
  private screenShareManager: ScreenShareManager;

  constructor(io: SocketIOServer, roomManager: RoomManager) {
    this.io = io;
    this.roomManager = roomManager;
    this.screenShareManager = ScreenShareManager.getInstance(roomManager);
  }

  public setupSignalingHandlers(socket: Socket): void {
    // WebRTC Offer handling
    socket.on('offer', async (data: OfferMessage) => {
      try {
        this.validateSignalingMessage(data, socket.id);
        await this.relayOfferMessage(socket, data);
      } catch (error) {
        this.handleSignalingError(socket, 'offer-error', error);
      }
    });

    // WebRTC Answer handling
    socket.on('answer', async (data: AnswerMessage) => {
      try {
        this.validateSignalingMessage(data, socket.id);
        await this.relayAnswerMessage(socket, data);
      } catch (error) {
        this.handleSignalingError(socket, 'answer-error', error);
      }
    });

    // ICE Candidate handling
    socket.on('ice-candidate', async (data: ICECandidateMessage) => {
      try {
        this.validateICECandidateMessage(data, socket.id);
        await this.relayICECandidate(socket, data);
      } catch (error) {
        this.handleSignalingError(socket, 'ice-candidate-error', error);
      }
    });

    // Mute/Unmute handling
    socket.on(
      'toggle-mute',
      async (data: { roomId: string; participantId: string; muted: boolean }) => {
        try {
          this.validateMuteMessage(data, socket.id);
          await this.relayMuteStatus(socket, data);
        } catch (error) {
          this.handleSignalingError(socket, 'mute-error', error);
        }
      }
    );

    // Screen Share Request handling
    socket.on('request-screen-share', async (data: ScreenShareRequest) => {
      try {
        this.validateScreenShareRequest(data, socket.id);
        const event = await this.screenShareManager.requestScreenShare(data);

        // Notify the requester of success
        socket.emit('screen-share-started', event);

        // Notify all other participants in the room
        socket.to(data.roomId).emit('screen-share-started', event);

        console.log(
          `Screen share request handled for ${data.participantId} in room ${data.roomId}`
        );
      } catch (error) {
        this.handleScreenShareError(socket, 'screen-share-error', error);
      }
    });

    // Screen Share Stop handling
    socket.on('stop-screen-share', async (data: ScreenShareRequest) => {
      try {
        this.validateScreenShareRequest(data, socket.id);
        const event = await this.screenShareManager.stopScreenShare(data);

        // Notify the requester of success
        socket.emit('screen-share-stopped', event);

        // Notify all other participants in the room
        socket.to(data.roomId).emit('screen-share-stopped', event);

        console.log(`Screen share stop handled for ${data.participantId} in room ${data.roomId}`);
      } catch (error) {
        this.handleScreenShareError(socket, 'screen-share-error', error);
      }
    });
  }

  private async relayOfferMessage(socket: Socket, data: OfferMessage): Promise<void> {
    const { roomId, from, to, offer } = data;

    // Validate participants are in the room
    this.validateParticipantsInRoom(roomId, from, to);

    // Find the target socket
    const targetSocket = this.findSocketByParticipantId(roomId, to);
    if (!targetSocket) {
      throw new InvalidDestinationError(to, roomId);
    }

    // Relay the offer
    targetSocket.emit('offer', {
      from,
      offer,
      roomId,
    });

    // Confirm to sender
    socket.emit('offer-sent', { to, roomId });

    console.log(`Relayed offer from ${from} to ${to} in room ${roomId}`);
  }

  private async relayAnswerMessage(socket: Socket, data: AnswerMessage): Promise<void> {
    const { roomId, from, to, answer } = data;

    // Validate participants are in the room
    this.validateParticipantsInRoom(roomId, from, to);

    // Find the target socket
    const targetSocket = this.findSocketByParticipantId(roomId, to);
    if (!targetSocket) {
      throw new InvalidDestinationError(to, roomId);
    }

    // Relay the answer
    targetSocket.emit('answer', {
      from,
      answer,
      roomId,
    });

    // Confirm to sender
    socket.emit('answer-sent', { to, roomId });

    console.log(`Relayed answer from ${from} to ${to} in room ${roomId}`);
  }

  private async relayICECandidate(_socket: Socket, data: ICECandidateMessage): Promise<void> {
    const { roomId, from, to, candidate } = data;

    // Validate participants are in the room
    this.validateParticipantsInRoom(roomId, from, to);

    // Find the target socket
    const targetSocket = this.findSocketByParticipantId(roomId, to);
    if (!targetSocket) {
      throw new InvalidDestinationError(to, roomId);
    }

    // Relay the ICE candidate
    targetSocket.emit('ice-candidate', {
      from,
      candidate,
      roomId,
    });

    console.log(`Relayed ICE candidate from ${from} to ${to} in room ${roomId}`);
  }

  private async relayMuteStatus(
    socket: Socket,
    data: { roomId: string; participantId: string; muted: boolean }
  ): Promise<void> {
    const { roomId, participantId, muted } = data;

    // Validate participant is in the room
    const room = this.roomManager.getRoom(roomId);
    if (!room || !room.participants.has(participantId)) {
      throw new InvalidDestinationError(participantId, roomId);
    }

    // Update participant mute status
    const participant = room.participants.get(participantId)!;
    participant.muted = muted;

    // Broadcast mute status to all other participants in the room
    socket.to(roomId).emit('participant-muted', {
      participantId,
      muted,
      roomId,
    });

    // Confirm to sender
    socket.emit('mute-toggled', { participantId, muted, roomId });

    console.log(`Participant ${participantId} ${muted ? 'muted' : 'unmuted'} in room ${roomId}`);
  }

  private validateSignalingMessage(data: OfferMessage | AnswerMessage, socketId: string): void {
    if (!data.roomId || !data.from || !data.to) {
      throw new SignalingValidationError('Missing required fields: roomId, from, to');
    }

    if (data.from === data.to) {
      throw new SignalingValidationError('Cannot send signaling message to self');
    }

    // Verify that the sender matches the socket's participant
    const participantInfo = this.roomManager.getParticipantBySocketId(socketId);
    if (!participantInfo || participantInfo.participant.id !== data.from) {
      throw new SignalingValidationError('Sender does not match socket participant');
    }

    if (participantInfo.roomId !== data.roomId) {
      throw new SignalingValidationError('Sender not in specified room');
    }
  }

  private validateICECandidateMessage(data: ICECandidateMessage, socketId: string): void {
    if (!data.roomId || !data.from || !data.to || !data.candidate) {
      throw new SignalingValidationError('Missing required fields: roomId, from, to, candidate');
    }

    if (data.from === data.to) {
      throw new SignalingValidationError('Cannot send ICE candidate to self');
    }

    // Verify that the sender matches the socket's participant
    const participantInfo = this.roomManager.getParticipantBySocketId(socketId);
    if (!participantInfo || participantInfo.participant.id !== data.from) {
      throw new SignalingValidationError('Sender does not match socket participant');
    }

    if (participantInfo.roomId !== data.roomId) {
      throw new SignalingValidationError('Sender not in specified room');
    }

    // Validate ICE candidate structure
    if (typeof data.candidate.candidate !== 'string') {
      throw new SignalingValidationError('Invalid ICE candidate format');
    }
  }

  private validateMuteMessage(
    data: { roomId: string; participantId: string; muted: boolean },
    socketId: string
  ): void {
    if (!data.roomId || !data.participantId || typeof data.muted !== 'boolean') {
      throw new SignalingValidationError('Missing required fields: roomId, participantId, muted');
    }

    // Verify that the sender matches the participant being muted/unmuted
    const participantInfo = this.roomManager.getParticipantBySocketId(socketId);
    if (!participantInfo || participantInfo.participant.id !== data.participantId) {
      throw new SignalingValidationError('Can only toggle own mute status');
    }

    if (participantInfo.roomId !== data.roomId) {
      throw new SignalingValidationError('Participant not in specified room');
    }
  }

  private validateParticipantsInRoom(roomId: string, from: string, to: string): void {
    const room = this.roomManager.getRoom(roomId);
    if (!room) {
      throw new InvalidDestinationError(to, roomId);
    }

    if (!room.participants.has(from)) {
      throw new InvalidDestinationError(from, roomId);
    }

    if (!room.participants.has(to)) {
      throw new InvalidDestinationError(to, roomId);
    }
  }

  private findSocketByParticipantId(roomId: string, participantId: string): Socket | null {
    const room = this.roomManager.getRoom(roomId);
    if (!room) {
      return null;
    }

    const participant = room.participants.get(participantId);
    if (!participant) {
      return null;
    }

    return this.io.sockets.sockets.get(participant.socketId) || null;
  }

  private validateScreenShareRequest(data: ScreenShareRequest, socketId: string): void {
    if (!data.roomId || !data.participantId) {
      throw new SignalingValidationError('Missing required fields: roomId, participantId');
    }

    // Verify that the sender matches the socket's participant
    const participantInfo = this.roomManager.getParticipantBySocketId(socketId);
    if (!participantInfo || participantInfo.participant.id !== data.participantId) {
      throw new SignalingValidationError('Screen share request does not match socket participant');
    }

    if (participantInfo.roomId !== data.roomId) {
      throw new SignalingValidationError('Participant not in specified room');
    }
  }

  private handleSignalingError(socket: Socket, eventName: string, error: unknown): void {
    console.error(`Signaling error (${eventName}):`, error);

    let errorMessage = 'Unknown signaling error';
    let errorCode = 'UNKNOWN_ERROR';

    if (error instanceof InvalidDestinationError) {
      errorMessage = error.message;
      errorCode = 'INVALID_DESTINATION';
    } else if (error instanceof SignalingValidationError) {
      errorMessage = error.message;
      errorCode = 'VALIDATION_ERROR';
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    socket.emit(eventName, {
      error: errorCode,
      message: errorMessage,
    });
  }

  private handleScreenShareError(socket: Socket, eventName: string, error: unknown): void {
    console.error(`Screen share error (${eventName}):`, error);

    let errorMessage = 'Unknown screen share error';
    let errorCode = 'UNKNOWN_ERROR';

    if (error instanceof ScreenShareAlreadyActiveError) {
      errorMessage = error.message;
      errorCode = 'SCREEN_SHARE_ALREADY_ACTIVE';
    } else if (error instanceof ScreenShareNotActiveError) {
      errorMessage = error.message;
      errorCode = 'SCREEN_SHARE_NOT_ACTIVE';
    } else if (error instanceof UnauthorizedScreenShareError) {
      errorMessage = error.message;
      errorCode = 'UNAUTHORIZED_SCREEN_SHARE_STOP';
    } else if (error instanceof SignalingValidationError) {
      errorMessage = error.message;
      errorCode = 'VALIDATION_ERROR';
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    socket.emit(eventName, {
      error: errorCode,
      message: errorMessage,
    });
  }

  // Utility method for load testing
  public getConnectedSocketsCount(): number {
    return this.io.sockets.sockets.size;
  }

  // Get signaling statistics
  public getSignalingStats(): {
    connectedSockets: number;
    activeRooms: number;
    totalParticipants: number;
  } {
    const rooms = this.roomManager.getAllRooms();
    const totalParticipants = rooms.reduce((sum, roomId) => {
      return sum + this.roomManager.getRoomCount(roomId);
    }, 0);

    return {
      connectedSockets: this.getConnectedSocketsCount(),
      activeRooms: rooms.length,
      totalParticipants,
    };
  }
}
