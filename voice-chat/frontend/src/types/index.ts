export interface Participant {
  id: string;
  name: string;
  isMuted: boolean;
  isScreenSharing: boolean;
  joinedAt: Date;
  isConnected?: boolean;
  lastSeen?: Date;
}

export interface RoomState {
  id: string;
  participants: Participant[];
  isConnected: boolean;
  error?: string;
  loading: boolean;
}

export interface RoomViewProps {
  roomId: string;
  isConnected: boolean;
  participants: Participant[];
  currentUser?: Participant;
  onLeaveRoom: () => void;
}

export interface MediaControlsProps {
  isMuted: boolean;
  isScreenSharing: boolean;
  onToggleMute: () => void;
  onToggleScreenShare: () => void;
  disabled?: boolean;
}

export interface ParticipantsListProps {
  participants: Participant[];
  currentUserId?: string;
  maxParticipants?: number;
}

export interface LoadingSpinnerProps {
  message?: string;
}

export interface ErrorAlertProps {
  message: string;
  onRetry?: () => void;
}

// Socket.IO関連の型定義
export interface ConnectionState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  socket: any | null; // Socket.IO Socketインスタンス
  reconnectAttempts: number;
}

export interface UseSocketConnection {
  connectionState: ConnectionState;
  connect: (roomId: string) => void;
  disconnect: () => void;
  emit: (event: string, data: any) => void;
  addEventListener: (event: string, handler: Function) => void;
  removeEventListener: (event: string, handler: Function) => void;
}

// ルーム管理用の拡張型
export interface ExtendedRoomState {
  roomId: string | null;
  participants: Participant[];
  currentUser: Participant | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  screenSharingUser: string | null;
}

export interface RoomContextValue {
  state: ExtendedRoomState;
  actions: {
    joinRoom: (roomId: string, userName: string) => void;
    leaveRoom: () => void;
    toggleMute: () => void;
    toggleScreenShare: () => void;
    clearError: () => void;
    handleUserJoined: (participant: Participant) => void;
    handleUserLeft: (userId: string) => void;
    handleUserMuted: (userId: string, isMuted: boolean) => void;
    handleRoomJoined: (roomId: string, participants: Participant[]) => void;
    setCurrentUser: (user: Participant) => void;
  };
}

// Socket.IOイベントデータ型
export interface JoinRoomData {
  roomId: string;
  userId: string;
  userName: string;
}

export interface RoomJoinedData {
  roomId: string;
  participants: Participant[];
  currentUser: Participant;
}

export interface UserJoinedData {
  participant: Participant;
}

export interface UserLeftData {
  userId: string;
}

export interface UserMutedData {
  userId: string;
  isMuted: boolean;
}