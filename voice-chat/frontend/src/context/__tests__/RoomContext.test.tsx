import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { RoomProvider, useRoom } from '../RoomContext';
import { Participant } from '../../types';

// テスト用コンポーネント
const TestComponent = () => {
  const { state, actions } = useRoom();
  
  return (
    <div>
      <div data-testid="room-id">{state.roomId || ''}</div>
      <div data-testid="participants-count">{state.participants.length}</div>
      <div data-testid="is-connected">{state.isConnected.toString()}</div>
      <div data-testid="is-connecting">{state.isConnecting.toString()}</div>
      <button onClick={() => actions.joinRoom('test-room', 'Test User')}>
        Join Room
      </button>
      <button onClick={() => actions.toggleMute()}>
        Toggle Mute
      </button>
      <button onClick={() => actions.toggleScreenShare()}>
        Toggle Screen Share
      </button>
    </div>
  );
};

describe('RoomContext', () => {
  test('初期状態が正しく設定される', () => {
    render(
      <RoomProvider>
        <TestComponent />
      </RoomProvider>
    );
    
    expect(screen.getByTestId('room-id')).toHaveTextContent('');
    expect(screen.getByTestId('participants-count')).toHaveTextContent('0');
    expect(screen.getByTestId('is-connected')).toHaveTextContent('false');
  });

  test('joinRoom関数が正しく動作する', async () => {
    render(
      <RoomProvider>
        <TestComponent />
      </RoomProvider>
    );
    
    const joinButton = screen.getByRole('button', { name: /join room/i });
    fireEvent.click(joinButton);
    
    await waitFor(() => {
      expect(screen.getByTestId('is-connecting')).toHaveTextContent('true');
    });
  });

  test('参加者追加時に状態が更新される', () => {
    const { result } = renderHook(() => useRoom(), { wrapper: RoomProvider });
    
    const newParticipant: Participant = {
      id: 'user-1',
      name: 'Alice',
      isMuted: false,
      isScreenSharing: false,
      joinedAt: new Date(),
      isConnected: true,
    };
    
    act(() => {
      result.current.actions.handleUserJoined(newParticipant);
    });
    
    expect(result.current.state.participants).toHaveLength(1);
    expect(result.current.state.participants[0]).toEqual(newParticipant);
  });

  test('参加者退出時に状態が更新される', () => {
    const { result } = renderHook(() => useRoom(), { wrapper: RoomProvider });
    
    const participants: Participant[] = [
      { id: 'user-1', name: 'Alice', isMuted: false, isScreenSharing: false, joinedAt: new Date(), isConnected: true },
      { id: 'user-2', name: 'Bob', isMuted: false, isScreenSharing: false, joinedAt: new Date(), isConnected: true },
    ];
    
    act(() => {
      result.current.actions.handleRoomJoined('test-room', participants);
    });
    
    act(() => {
      result.current.actions.handleUserLeft('user-1');
    });
    
    expect(result.current.state.participants).toHaveLength(1);
    expect(result.current.state.participants[0].id).toBe('user-2');
  });

  test('toggleMute関数が正しく動作する', () => {
    const { result } = renderHook(() => useRoom(), { wrapper: RoomProvider });
    
    const currentUser: Participant = {
      id: 'current-user',
      name: 'Current User',
      isMuted: false,
      isScreenSharing: false,
      joinedAt: new Date(),
      isConnected: true,
    };
    
    act(() => {
      result.current.actions.setCurrentUser(currentUser);
    });
    
    act(() => {
      result.current.actions.toggleMute();
    });
    
    expect(result.current.state.currentUser?.isMuted).toBe(true);
  });

  test('toggleScreenShare関数が正しく動作する', () => {
    const { result } = renderHook(() => useRoom(), { wrapper: RoomProvider });
    
    const currentUser: Participant = {
      id: 'current-user',
      name: 'Current User',
      isMuted: false,
      isScreenSharing: false,
      joinedAt: new Date(),
      isConnected: true,
    };
    
    act(() => {
      result.current.actions.setCurrentUser(currentUser);
    });
    
    act(() => {
      result.current.actions.toggleScreenShare();
    });
    
    expect(result.current.state.currentUser?.isScreenSharing).toBe(true);
    expect(result.current.state.screenSharingUser).toBe('current-user');
  });

  test('他のユーザーのミュート状態が同期される', () => {
    const { result } = renderHook(() => useRoom(), { wrapper: RoomProvider });
    
    const participants: Participant[] = [
      { id: 'user-1', name: 'Alice', isMuted: false, isScreenSharing: false, joinedAt: new Date(), isConnected: true },
    ];
    
    act(() => {
      result.current.actions.handleRoomJoined('test-room', participants);
    });
    
    act(() => {
      result.current.actions.handleUserMuted('user-1', true);
    });
    
    const updatedParticipant = result.current.state.participants.find(p => p.id === 'user-1');
    expect(updatedParticipant?.isMuted).toBe(true);
  });
});