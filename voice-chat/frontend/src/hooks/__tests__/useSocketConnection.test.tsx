import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { useSocketConnection } from '../useSocketConnection';

// Socket.IOのモック
const mockSocket = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  connected: false,
  id: 'mock-socket-id',
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}));

describe('useSocketConnection Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSocket.connected = false;
  });

  test('初期状態が正しく設定される', () => {
    const { result } = renderHook(() => useSocketConnection());
    
    expect(result.current.connectionState.isConnected).toBe(false);
    expect(result.current.connectionState.isConnecting).toBe(false);
    expect(result.current.connectionState.error).toBe(null);
    expect(result.current.connectionState.socket).toBe(null);
    expect(result.current.connectionState.reconnectAttempts).toBe(0);
  });

  test('connect関数が正しく動作する', async () => {
    const { result } = renderHook(() => useSocketConnection());
    
    act(() => {
      result.current.connect('test-room');
    });
    
    expect(result.current.connectionState.isConnecting).toBe(true);
  });

  test('接続成功時に状態が更新される', async () => {
    const { result } = renderHook(() => useSocketConnection());
    
    act(() => {
      result.current.connect('test-room');
    });
    
    // Mock socket connect event
    act(() => {
      const connectHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connect'
      )?.[1];
      connectHandler?.();
    });
    
    expect(result.current.connectionState.isConnected).toBe(true);
    expect(result.current.connectionState.isConnecting).toBe(false);
    expect(result.current.connectionState.error).toBe(null);
  });

  test('接続エラー時に状態が更新される', async () => {
    const { result } = renderHook(() => useSocketConnection());
    const error = new Error('Connection failed');
    
    act(() => {
      result.current.connect('test-room');
    });
    
    // Mock socket connect_error event
    act(() => {
      const errorHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connect_error'
      )?.[1];
      errorHandler?.(error);
    });
    
    expect(result.current.connectionState.isConnected).toBe(false);
    expect(result.current.connectionState.isConnecting).toBe(false);
    expect(result.current.connectionState.error).toBe('Connection failed');
  });

  test('disconnect関数が正しく動作する', () => {
    const { result } = renderHook(() => useSocketConnection());
    
    // Setup connected state
    act(() => {
      result.current.connect('test-room');
      const connectHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connect'
      )?.[1];
      connectHandler?.();
    });
    
    act(() => {
      result.current.disconnect();
    });
    
    expect(mockSocket.disconnect).toHaveBeenCalled();
    expect(result.current.connectionState.isConnected).toBe(false);
  });

  test('emit関数が正しく動作する', () => {
    const { result } = renderHook(() => useSocketConnection());
    
    act(() => {
      result.current.connect('test-room');
    });
    
    // Mock the socket as connected
    mockSocket.connected = true;
    
    act(() => {
      const connectHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connect'
      )?.[1];
      connectHandler?.();
    });
    
    const testData = { userId: 'test-user' };
    
    act(() => {
      result.current.emit('test-event', testData);
    });
    
    expect(mockSocket.emit).toHaveBeenCalledWith('test-event', testData);
  });
});