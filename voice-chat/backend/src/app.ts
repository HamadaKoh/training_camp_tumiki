import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { RoomManager } from './services/RoomManager';
import { SignalingHandler } from './services/SignalingHandler';
import { ScreenShareManager } from './services/ScreenShareManager';
import { RoomFullError, DuplicateParticipantError } from './types/room';

export interface AppConfig {
  corsOrigins: string[];
  port: number;
}

export class App {
  public app: Application;
  public httpServer: ReturnType<typeof createServer>;
  public io: SocketIOServer;
  private config: AppConfig;
  private roomManager: RoomManager;
  private signalingHandler: SignalingHandler;
  private screenShareManager: ScreenShareManager;

  constructor(config: AppConfig) {
    this.config = config;
    this.app = express();
    this.httpServer = createServer(this.app);
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: this.config.corsOrigins,
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });
    this.roomManager = RoomManager.getInstance();
    this.screenShareManager = ScreenShareManager.getInstance(this.roomManager);
    this.signalingHandler = new SignalingHandler(this.io, this.roomManager);

    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketIO();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // CORS configuration
    this.app.use(
      cors({
        origin: (origin, callback) => {
          // Allow requests with no origin (e.g., mobile apps, Postman)
          if (!origin) return callback(null, true);

          if (this.config.corsOrigins.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error('Not allowed by CORS'));
          }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
      })
    );

    // Body parsing middleware
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging middleware
    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (_req: Request, res: Response) => {
      res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    });

    // Signaling statistics endpoint
    this.app.get('/stats', (_req: Request, res: Response) => {
      const stats = this.signalingHandler.getSignalingStats();
      res.status(200).json({
        ...stats,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    });

    // 404 handler
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.path} not found`,
      });
    });
  }

  private setupSocketIO(): void {
    // Socket.IO connection handler
    this.io.on('connection', (socket) => {
      console.log(`New socket connection: ${socket.id}`);

      // Setup signaling handlers for this socket
      this.signalingHandler.setupSignalingHandlers(socket);

      // Handle room joining
      socket.on('join-room', async (data: { roomId: string; participantId: string }) => {
        try {
          const { roomId, participantId } = data;

          // Get user agent and IP from socket
          const userAgent = socket.handshake.headers['user-agent'];
          const ipAddress = socket.handshake.address;

          // Add participant to room
          await this.roomManager.addParticipant(
            roomId,
            participantId,
            socket.id,
            userAgent,
            ipAddress
          );

          // Join Socket.IO room
          socket.join(roomId);

          // Get updated participant list
          const participants = this.roomManager.getRoomParticipants(roomId);

          // Notify all room members
          this.io.to(roomId).emit('participant-joined', {
            participantId,
            participants: participants.map((p) => ({
              id: p.id,
              muted: p.muted,
            })),
          });

          // Send success response to joining participant
          socket.emit('join-room-success', {
            roomId,
            participants: participants.map((p) => ({
              id: p.id,
              muted: p.muted,
            })),
          });

          console.log(`Participant ${participantId} joined room ${roomId}`);
        } catch (error) {
          if (error instanceof RoomFullError) {
            socket.emit('join-room-error', {
              error: 'ROOM_FULL',
              message: error.message,
            });
          } else if (error instanceof DuplicateParticipantError) {
            socket.emit('join-room-error', {
              error: 'DUPLICATE_PARTICIPANT',
              message: error.message,
            });
          } else {
            console.error('Error joining room:', error);
            socket.emit('join-room-error', {
              error: 'UNKNOWN_ERROR',
              message: 'Failed to join room',
            });
          }
        }
      });

      // Handle room leaving
      socket.on('leave-room', async (data: { roomId: string; participantId: string }) => {
        try {
          const { roomId, participantId } = data;

          await this.roomManager.removeParticipant(roomId, participantId);
          socket.leave(roomId);

          // Get updated participant list
          const participants = this.roomManager.getRoomParticipants(roomId);

          // Notify remaining room members
          this.io.to(roomId).emit('participant-left', {
            participantId,
            participants: participants.map((p) => ({
              id: p.id,
              muted: p.muted,
            })),
          });

          socket.emit('leave-room-success');

          console.log(`Participant ${participantId} left room ${roomId}`);
        } catch (error) {
          console.error('Error leaving room:', error);
          socket.emit('leave-room-error', {
            error: 'UNKNOWN_ERROR',
            message: 'Failed to leave room',
          });
        }
      });

      socket.on('disconnect', async (reason) => {
        console.log(`Socket disconnected: ${socket.id}, reason: ${reason}`);

        // Find and remove participant from their room
        const participantInfo = this.roomManager.getParticipantBySocketId(socket.id);
        if (participantInfo) {
          try {
            // Handle screen sharing cleanup if participant was sharing
            const screenShareEvent = await this.screenShareManager.forceStopScreenShare(
              participantInfo.roomId,
              participantInfo.participant.id
            );

            if (screenShareEvent) {
              // Notify remaining room members that screen sharing stopped
              this.io.to(participantInfo.roomId).emit('screen-share-stopped', screenShareEvent);
              console.log(
                `Force stopped screen sharing for disconnected participant ${participantInfo.participant.id}`
              );
            }

            await this.roomManager.removeParticipant(
              participantInfo.roomId,
              participantInfo.participant.id
            );

            // Get updated participant list
            const participants = this.roomManager.getRoomParticipants(participantInfo.roomId);

            // Notify remaining room members
            this.io.to(participantInfo.roomId).emit('participant-left', {
              participantId: participantInfo.participant.id,
              participants: participants.map((p) => ({
                id: p.id,
                muted: p.muted,
              })),
            });
          } catch (error) {
            console.error('Error handling disconnect:', error);
          }
        }
      });

      socket.on('error', (error) => {
        console.error(`Socket error for ${socket.id}:`, error);
      });
    });

    // Socket.IO middleware for authentication (if needed in future)
    this.io.use((_socket, next) => {
      // TODO: Add authentication logic here
      next();
    });
  }

  private setupErrorHandling(): void {
    // Global error handler
    this.app.use((err: Error, _req: Request, res: Response, _next: NextFunction): void => {
      console.error('Error:', err);

      // Handle CORS errors specifically
      if (err.message === 'Not allowed by CORS') {
        res.status(403).json({
          error: 'CORS Error',
          message: 'Origin not allowed',
        });
        return;
      }

      // Generic error response
      res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
      });
    });
  }

  public start(): void {
    this.httpServer.listen(this.config.port, () => {
      console.log(`Server is running on port ${this.config.port}`);
      console.log(`Health check available at http://localhost:${this.config.port}/health`);
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      this.io.close(() => {
        this.httpServer.close(() => {
          console.log('Server stopped');
          resolve();
        });
      });
    });
  }
}
