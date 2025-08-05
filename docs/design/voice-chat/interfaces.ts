// ==========================================
// エンティティ定義
// ==========================================

export interface Participant {
  id: string;
  socketId: string;
  joinedAt: Date;
  isMuted: boolean;
  isSharingScreen: boolean;
  connectionQuality: ConnectionQuality;
}

export interface Room {
  id: string;
  participants: Map<string, Participant>;
  screenSharingParticipantId: string | null;
  createdAt: Date;
  maxParticipants: number;
}

export interface Session {
  id: string;
  participantId: string;
  socketId: string;
  roomId: string;
  joinedAt: Date;
  leftAt?: Date;
}

// ==========================================
// WebRTC関連の型定義
// ==========================================

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface WebRTCConfig {
  iceServers: IceServer[];
  iceCandidatePoolSize?: number;
}

export interface MediaConstraints {
  audio: boolean | MediaTrackConstraints;
  video: boolean | MediaTrackConstraints;
}

export interface PeerConnection {
  participantId: string;
  connection: RTCPeerConnection;
  audioStream?: MediaStream;
  screenStream?: MediaStream;
}

// ==========================================
// Socket.IOイベントの型定義
// ==========================================

// クライアント → サーバー
export interface ClientToServerEvents {
  'join-room': (callback: (response: JoinRoomResponse) => void) => void;
  'leave-room': () => void;
  'toggle-mute': (isMuted: boolean) => void;
  'request-screen-share': (callback: (response: ScreenShareResponse) => void) => void;
  'stop-screen-share': () => void;
  'offer': (data: SignalData) => void;
  'answer': (data: SignalData) => void;
  'ice-candidate': (data: IceCandidateData) => void;
  'report-metrics': (metrics: ConnectionMetrics) => void;
}

// サーバー → クライアント
export interface ServerToClientEvents {
  'room-joined': (data: RoomJoinedData) => void;
  'user-joined': (participant: Participant) => void;
  'user-left': (participantId: string) => void;
  'user-muted': (data: MuteStatusData) => void;
  'screen-share-started': (participantId: string) => void;
  'screen-share-stopped': (participantId: string) => void;
  'offer': (data: SignalData) => void;
  'answer': (data: SignalData) => void;
  'ice-candidate': (data: IceCandidateData) => void;
  'connection-quality': (quality: ConnectionQuality) => void;
  'error': (error: ErrorData) => void;
}

// ==========================================
// API リクエスト/レスポンス型定義
// ==========================================

export interface JoinRoomResponse {
  success: boolean;
  participant?: Participant;
  participants?: Participant[];
  error?: ErrorData;
}

export interface ScreenShareResponse {
  success: boolean;
  granted: boolean;
  error?: ErrorData;
}

export interface RoomJoinedData {
  roomId: string;
  participant: Participant;
  participants: Participant[];
}

export interface SignalData {
  from: string;
  to: string;
  signal: RTCSessionDescriptionInit;
}

export interface IceCandidateData {
  from: string;
  to: string;
  candidate: RTCIceCandidateInit;
}

export interface MuteStatusData {
  participantId: string;
  isMuted: boolean;
}

export interface ConnectionMetrics {
  participantId: string;
  latency: number;
  packetLoss: number;
  jitter?: number;
  bandwidth?: {
    audio?: number;
    video?: number;
  };
}

export interface ErrorData {
  code: ErrorCode;
  message: string;
  details?: any;
}

// ==========================================
// Enum定義
// ==========================================

export enum ConnectionQuality {
  EXCELLENT = 'excellent',
  GOOD = 'good',
  FAIR = 'fair',
  POOR = 'poor',
  DISCONNECTED = 'disconnected'
}

export enum ErrorCode {
  // 接続エラー
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  SIGNALING_ERROR = 'SIGNALING_ERROR',
  WEBRTC_ERROR = 'WEBRTC_ERROR',
  
  // 権限エラー
  MEDIA_PERMISSION_DENIED = 'MEDIA_PERMISSION_DENIED',
  SCREEN_SHARE_PERMISSION_DENIED = 'SCREEN_SHARE_PERMISSION_DENIED',
  
  // ルームエラー
  ROOM_FULL = 'ROOM_FULL',
  ROOM_NOT_FOUND = 'ROOM_NOT_FOUND',
  
  // 画面共有エラー
  SCREEN_SHARE_IN_USE = 'SCREEN_SHARE_IN_USE',
  SCREEN_SHARE_NOT_SUPPORTED = 'SCREEN_SHARE_NOT_SUPPORTED',
  
  // その他
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

// ==========================================
// 状態管理の型定義
// ==========================================

export interface AppState {
  connectionState: ConnectionState;
  currentParticipant: Participant | null;
  participants: Map<string, Participant>;
  peerConnections: Map<string, PeerConnection>;
  localAudioStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  isScreenSharing: boolean;
  screenSharingParticipantId: string | null;
  errors: ErrorData[];
}

export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  IN_CALL = 'in_call',
  ERROR = 'error'
}

// ==========================================
// UIコンポーネントProps型定義
// ==========================================

export interface RoomViewProps {
  onJoin: () => void;
  onLeave: () => void;
  connectionState: ConnectionState;
}

export interface ParticipantsListProps {
  participants: Participant[];
  currentParticipantId: string | null;
  screenSharingParticipantId: string | null;
}

export interface MediaControlsProps {
  isMuted: boolean;
  isScreenSharing: boolean;
  canScreenShare: boolean;
  onToggleMute: () => void;
  onToggleScreenShare: () => void;
}

export interface ConnectionStatusProps {
  connectionQuality: ConnectionQuality;
  participantCount: number;
}

// ==========================================
// 設定関連の型定義
// ==========================================

export interface AppConfig {
  serverUrl: string;
  maxParticipants: number;
  enableLogging: boolean;
  iceServers: IceServer[];
  mediaConstraints: MediaConstraints;
  reconnectAttempts: number;
  reconnectDelay: number;
}

export interface AudioSettings {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  sampleRate?: number;
}

export interface ScreenShareSettings {
  maxWidth?: number;
  maxHeight?: number;
  maxFrameRate?: number;
}

// ==========================================
// ユーティリティ型定義
// ==========================================

export type SocketId = string;
export type ParticipantId = string;
export type RoomId = string;

export interface Logger {
  debug: (message: string, data?: any) => void;
  info: (message: string, data?: any) => void;
  warn: (message: string, data?: any) => void;
  error: (message: string, error?: any) => void;
}