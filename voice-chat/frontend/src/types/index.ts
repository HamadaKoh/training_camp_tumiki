export interface Participant {
  id: string;
  name: string;
  isMuted: boolean;
  isScreenSharing: boolean;
  joinedAt: Date;
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