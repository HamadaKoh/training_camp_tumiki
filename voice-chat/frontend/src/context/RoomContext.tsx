import React, { createContext, useContext, useReducer, useCallback } from 'react';
import { ExtendedRoomState, RoomContextValue, Participant } from '../types';
import { useSocketConnection } from '../hooks';

// Initial state
const initialState: ExtendedRoomState = {
  roomId: null,
  participants: [],
  currentUser: null,
  isConnected: false,
  isConnecting: false,
  error: null,
  screenSharingUser: null,
};

// Action types
type RoomAction = 
  | { type: 'CONNECT_START' }
  | { type: 'CONNECT_SUCCESS'; payload: { roomId: string; participants: Participant[] } }
  | { type: 'CONNECT_ERROR'; payload: { error: string } }
  | { type: 'DISCONNECT' }
  | { type: 'USER_JOINED'; payload: { participant: Participant } }
  | { type: 'USER_LEFT'; payload: { userId: string } }
  | { type: 'USER_MUTED'; payload: { userId: string; isMuted: boolean } }
  | { type: 'SCREEN_SHARE_START'; payload: { userId: string } }
  | { type: 'SCREEN_SHARE_STOP'; payload: { userId: string } }
  | { type: 'SET_CURRENT_USER'; payload: { user: Participant } }
  | { type: 'TOGGLE_MUTE' }
  | { type: 'TOGGLE_SCREEN_SHARE' }
  | { type: 'CLEAR_ERROR' };

// Reducer
const roomReducer = (state: ExtendedRoomState, action: RoomAction): ExtendedRoomState => {
  switch (action.type) {
    case 'CONNECT_START':
      return {
        ...state,
        isConnecting: true,
        error: null,
      };

    case 'CONNECT_SUCCESS':
      return {
        ...state,
        roomId: action.payload.roomId,
        participants: action.payload.participants,
        isConnected: true,
        isConnecting: false,
        error: null,
      };

    case 'CONNECT_ERROR':
      return {
        ...state,
        isConnected: false,
        isConnecting: false,
        error: action.payload.error,
      };

    case 'DISCONNECT':
      return {
        ...initialState,
      };

    case 'USER_JOINED':
      return {
        ...state,
        participants: [...state.participants, action.payload.participant],
      };

    case 'USER_LEFT':
      return {
        ...state,
        participants: state.participants.filter(p => p.id !== action.payload.userId),
        screenSharingUser: state.screenSharingUser === action.payload.userId ? null : state.screenSharingUser,
      };

    case 'USER_MUTED':
      return {
        ...state,
        participants: state.participants.map(p => 
          p.id === action.payload.userId 
            ? { ...p, isMuted: action.payload.isMuted }
            : p
        ),
        currentUser: state.currentUser?.id === action.payload.userId
          ? { ...state.currentUser, isMuted: action.payload.isMuted }
          : state.currentUser,
      };

    case 'SCREEN_SHARE_START':
      return {
        ...state,
        screenSharingUser: action.payload.userId,
        participants: state.participants.map(p =>
          p.id === action.payload.userId
            ? { ...p, isScreenSharing: true }
            : { ...p, isScreenSharing: false }
        ),
        currentUser: state.currentUser?.id === action.payload.userId
          ? { ...state.currentUser, isScreenSharing: true }
          : state.currentUser ? { ...state.currentUser, isScreenSharing: false } : null,
      };

    case 'SCREEN_SHARE_STOP':
      return {
        ...state,
        screenSharingUser: null,
        participants: state.participants.map(p => ({ ...p, isScreenSharing: false })),
        currentUser: state.currentUser ? { ...state.currentUser, isScreenSharing: false } : null,
      };

    case 'SET_CURRENT_USER':
      return {
        ...state,
        currentUser: action.payload.user,
      };

    case 'TOGGLE_MUTE':
      if (!state.currentUser) return state;
      const newMutedState = !state.currentUser.isMuted;
      return {
        ...state,
        currentUser: { ...state.currentUser, isMuted: newMutedState },
        participants: state.participants.map(p =>
          p.id === state.currentUser!.id
            ? { ...p, isMuted: newMutedState }
            : p
        ),
      };

    case 'TOGGLE_SCREEN_SHARE':
      if (!state.currentUser) return state;
      const newSharingState = !state.currentUser.isScreenSharing;
      return {
        ...state,
        currentUser: { ...state.currentUser, isScreenSharing: newSharingState },
        screenSharingUser: newSharingState ? state.currentUser.id : null,
        participants: state.participants.map(p =>
          p.id === state.currentUser!.id
            ? { ...p, isScreenSharing: newSharingState }
            : { ...p, isScreenSharing: false }
        ),
      };

    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null,
      };

    default:
      return state;
  }
};

// Context
const RoomContext = createContext<RoomContextValue | undefined>(undefined);

// Provider
interface RoomProviderProps {
  children: React.ReactNode;
}

export const RoomProvider: React.FC<RoomProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(roomReducer, initialState);
  const socketConnection = useSocketConnection();

  const actions = {
    joinRoom: useCallback((roomId: string, userName: string) => {
      dispatch({ type: 'CONNECT_START' });
      
      // Create current user
      const currentUser: Participant = {
        id: `user-${Date.now()}`,
        name: userName,
        isMuted: false,
        isScreenSharing: false,
        joinedAt: new Date(),
        isConnected: true,
      };
      
      dispatch({ type: 'SET_CURRENT_USER', payload: { user: currentUser } });
      
      // Mock successful connection for testing
      setTimeout(() => {
        dispatch({ 
          type: 'CONNECT_SUCCESS', 
          payload: { roomId, participants: [currentUser] } 
        });
      }, 100);
    }, []),

    leaveRoom: useCallback(() => {
      dispatch({ type: 'DISCONNECT' });
      socketConnection.disconnect();
    }, [socketConnection]),

    toggleMute: useCallback(() => {
      dispatch({ type: 'TOGGLE_MUTE' });
    }, []),

    toggleScreenShare: useCallback(() => {
      dispatch({ type: 'TOGGLE_SCREEN_SHARE' });
    }, []),

    clearError: useCallback(() => {
      dispatch({ type: 'CLEAR_ERROR' });
    }, []),

    handleUserJoined: useCallback((participant: Participant) => {
      dispatch({ type: 'USER_JOINED', payload: { participant } });
    }, []),

    handleUserLeft: useCallback((userId: string) => {
      dispatch({ type: 'USER_LEFT', payload: { userId } });
    }, []),

    handleUserMuted: useCallback((userId: string, isMuted: boolean) => {
      dispatch({ type: 'USER_MUTED', payload: { userId, isMuted } });
    }, []),

    handleRoomJoined: useCallback((roomId: string, participants: Participant[]) => {
      dispatch({ type: 'CONNECT_SUCCESS', payload: { roomId, participants } });
    }, []),

    setCurrentUser: useCallback((user: Participant) => {
      dispatch({ type: 'SET_CURRENT_USER', payload: { user } });
    }, []),
  };

  const value: RoomContextValue = {
    state,
    actions,
  };

  return (
    <RoomContext.Provider value={value}>
      {children}
    </RoomContext.Provider>
  );
};

// Hook
export const useRoom = (): RoomContextValue => {
  const context = useContext(RoomContext);
  if (context === undefined) {
    throw new Error('useRoom must be used within a RoomProvider');
  }
  return context;
};