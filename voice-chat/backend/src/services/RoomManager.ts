import { Pool } from 'pg';
import { pool } from '../config/database';
import {
  Room,
  Participant,
  SessionRecord,
  RoomFullError,
  DuplicateParticipantError,
  ParticipantNotFoundError,
} from '../types/room';

export class RoomManager {
  private static instance: RoomManager;
  private rooms: Map<string, Room> = new Map();
  private readonly maxParticipantsPerRoom = 10;
  private dbPool: Pool;

  private constructor(dbPool: Pool = pool) {
    this.dbPool = dbPool;
  }

  public static getInstance(dbPool?: Pool): RoomManager {
    if (!RoomManager.instance) {
      RoomManager.instance = new RoomManager(dbPool);
    }
    return RoomManager.instance;
  }

  public async addParticipant(
    roomId: string,
    participantId: string,
    socketId: string,
    userAgent?: string,
    ipAddress?: string
  ): Promise<Participant> {
    // Get or create room
    let room = this.rooms.get(roomId);
    if (!room) {
      room = {
        id: roomId,
        participants: new Map(),
        createdAt: new Date(),
      };
      this.rooms.set(roomId, room);
    }

    // Check if room is full
    if (room.participants.size >= this.maxParticipantsPerRoom) {
      throw new RoomFullError(roomId, this.maxParticipantsPerRoom);
    }

    // Check for duplicate participant
    if (room.participants.has(participantId)) {
      throw new DuplicateParticipantError(participantId, roomId);
    }

    // Create participant
    const participant: Participant = {
      id: participantId,
      socketId,
      joinedAt: new Date(),
      muted: false,
    };

    // Add to room
    room.participants.set(participantId, participant);

    // Record session in database
    await this.recordSessionStart({
      participantId,
      socketId,
      roomId,
      joinedAt: participant.joinedAt,
      userAgent,
      ipAddress,
    });

    // Log event
    await this.logEvent(socketId, 'join_room', {
      participantId,
      roomId,
      participantCount: room.participants.size,
    });

    return participant;
  }

  public async removeParticipant(roomId: string, participantId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new ParticipantNotFoundError(participantId, roomId);
    }

    const participant = room.participants.get(participantId);
    if (!participant) {
      throw new ParticipantNotFoundError(participantId, roomId);
    }

    // Remove from room
    room.participants.delete(participantId);

    // If participant was screen sharing, clear it
    if (room.screenSharingParticipantId === participantId) {
      room.screenSharingParticipantId = undefined;
    }

    // Record session end in database
    await this.recordSessionEnd(participant.socketId);

    // Log event
    await this.logEvent(participant.socketId, 'leave_room', {
      participantId,
      roomId,
      participantCount: room.participants.size,
    });

    // Clean up empty rooms
    if (room.participants.size === 0) {
      this.rooms.delete(roomId);
    }
  }

  public getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  public getRoomParticipants(roomId: string): Participant[] {
    const room = this.rooms.get(roomId);
    if (!room) {
      return [];
    }
    return Array.from(room.participants.values());
  }

  public getParticipantBySocketId(
    socketId: string
  ): { participant: Participant; roomId: string } | undefined {
    for (const [roomId, room] of this.rooms) {
      for (const participant of room.participants.values()) {
        if (participant.socketId === socketId) {
          return { participant, roomId };
        }
      }
    }
    return undefined;
  }

  public isRoomFull(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) {
      return false;
    }
    return room.participants.size >= this.maxParticipantsPerRoom;
  }

  public getRoomCount(roomId: string): number {
    const room = this.rooms.get(roomId);
    return room ? room.participants.size : 0;
  }

  public getAllRooms(): string[] {
    return Array.from(this.rooms.keys());
  }

  // Database operations
  private async recordSessionStart(session: SessionRecord): Promise<void> {
    const query = `
      INSERT INTO sessions (participant_id, socket_id, room_id, joined_at, user_agent, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `;

    try {
      await this.dbPool.query(query, [
        session.participantId,
        session.socketId,
        session.roomId,
        session.joinedAt,
        session.userAgent || null,
        session.ipAddress || null,
      ]);
    } catch (error) {
      console.error('Failed to record session start:', error);
      // Don't throw - we don't want DB errors to prevent joining
    }
  }

  private async recordSessionEnd(socketId: string): Promise<void> {
    const query = `
      UPDATE sessions 
      SET left_at = CURRENT_TIMESTAMP 
      WHERE socket_id = $1 AND left_at IS NULL
    `;

    try {
      await this.dbPool.query(query, [socketId]);
    } catch (error) {
      console.error('Failed to record session end:', error);
      // Don't throw - we don't want DB errors to prevent leaving
    }
  }

  private async logEvent(sessionId: string, eventType: string, eventData: Record<string, unknown>): Promise<void> {
    const query = `
      INSERT INTO event_logs (session_id, event_type, event_data)
      SELECT id, $2, $3
      FROM sessions
      WHERE socket_id = $1 AND left_at IS NULL
      ORDER BY joined_at DESC
      LIMIT 1
    `;

    try {
      await this.dbPool.query(query, [sessionId, eventType, JSON.stringify(eventData)]);
    } catch (error) {
      console.error('Failed to log event:', error);
      // Don't throw - logging errors shouldn't affect functionality
    }
  }

  // Testing helper - reset state
  public reset(): void {
    this.rooms.clear();
  }
}
