# TASK-202: Socket.IO接続とイベント管理 - テストケース

## テスト戦略
- **単体テスト**: Hooks、Context、Utility関数
- **統合テスト**: Socket.IOクライアントとサーバーとの通信
- **モックテスト**: Socket.IOのモック化による制御されたテスト環境
- **E2Eテスト**: 実際の接続フローのテスト

## 1. useSocketConnection Hook テストケース

### 基本接続テスト
```typescript
describe('useSocketConnection Hook', () => {
  beforeEach(() => {
    // Socket.IOのモックセットアップ
    mockSocket = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      connected: false,
    };
    (io as any).mockReturnValue(mockSocket);
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
    
    // When
    act(() => {
      result.current.connect('test-room');
    });
    
    // Then
    expect(result.current.connectionState.isConnecting).toBe(true);
    expect(io).toHaveBeenCalledWith(process.env.VITE_WS_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
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
      )[1];
      connectHandler();
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
      )[1];
      errorHandler(error);
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
      )[1];
      connectHandler();
    });
    
    // When
    act(() => {
      result.current.disconnect();
    });
    
    // Then
    expect(mockSocket.disconnect).toHaveBeenCalled();
    expect(result.current.connectionState.isConnected).toBe(false);
  });

  test('emit関数が正しく動作する', () => {
    const { result } = renderHook(() => useSocketConnection());
    
    act(() => {
      result.current.connect('test-room');
      const connectHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connect'
      )[1];
      connectHandler();
    });
    
    const testData = { userId: 'test-user' };
    
    act(() => {
      result.current.emit('test-event', testData);
    });
    
    expect(mockSocket.emit).toHaveBeenCalledWith('test-event', testData);
  });
});
```

### 再接続テスト
```typescript
describe('useSocketConnection Reconnection', () => {
  test('自動再接続が動作する', async () => {
    const { result } = renderHook(() => useSocketConnection());
    
    act(() => {
      result.current.connect('test-room');
    });
    
    // Simulate disconnect
    act(() => {
      const disconnectHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'disconnect'
      )[1];
      disconnectHandler('transport close');
    });
    
    expect(result.current.connectionState.isConnected).toBe(false);
    expect(result.current.connectionState.reconnectAttempts).toBe(1);
  });

  test('最大再接続回数に達したらエラーになる', async () => {
    const { result } = renderHook(() => useSocketConnection());
    
    act(() => {
      result.current.connect('test-room');
    });
    
    // Simulate 5 failed reconnection attempts
    for (let i = 0; i < 5; i++) {
      act(() => {
        const errorHandler = mockSocket.on.mock.calls.find(
          call => call[0] === 'connect_error'
        )[1];
        errorHandler(new Error('Connection failed'));
      });
    }
    
    expect(result.current.connectionState.error).toContain('最大再接続回数');
    expect(result.current.connectionState.reconnectAttempts).toBe(5);
  });
});
```

## 2. RoomContext テストケース

### 基本状態管理テスト
```typescript
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
    
    // Wait for async operations
    await waitFor(() => {
      expect(screen.getByTestId('is-connecting')).toHaveTextContent('true');
    });
  });

  test('参加者追加時に状態が更新される', () => {
    const { result } = renderHook(() => useRoom(), { wrapper: RoomProvider });
    
    const newParticipant = {
      id: 'user-1',
      name: 'Alice',
      isMuted: false,
      isScreenSharing: false,
      joinedAt: new Date(),
      isConnected: true,
    };
    
    act(() => {
      // Simulate user-joined event
      result.current.actions.handleUserJoined(newParticipant);
    });
    
    expect(result.current.state.participants).toHaveLength(1);
    expect(result.current.state.participants[0]).toEqual(newParticipant);
  });

  test('参加者退出時に状態が更新される', () => {
    const { result } = renderHook(() => useRoom(), { wrapper: RoomProvider });
    
    // Setup participants
    const participants = [
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
});
```

### メディア制御テスト
```typescript
describe('RoomContext Media Controls', () => {
  test('toggleMute関数が正しく動作する', () => {
    const { result } = renderHook(() => useRoom(), { wrapper: RoomProvider });
    
    // Setup current user
    const currentUser = {
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
    
    const currentUser = {
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
    
    const participants = [
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
```

## 3. Socket.IO統合テストケース

### イベント送受信テスト
```typescript
describe('Socket.IO Integration', () => {
  test('join-roomイベントが送信される', async () => {
    const { result } = renderHook(() => useSocketConnection());
    
    act(() => {
      result.current.connect('test-room');
    });
    
    // Simulate successful connection
    act(() => {
      const connectHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connect'
      )[1];
      connectHandler();
    });
    
    const joinData = {
      roomId: 'test-room',
      userId: 'test-user',
      userName: 'Test User',
    };
    
    act(() => {
      result.current.emit('join-room', joinData);
    });
    
    expect(mockSocket.emit).toHaveBeenCalledWith('join-room', joinData);
  });

  test('room-joinedイベントが受信される', async () => {
    const mockHandler = vi.fn();
    const { result } = renderHook(() => useSocketConnection());
    
    act(() => {
      result.current.connect('test-room');
    });
    
    // Setup event listener
    act(() => {
      result.current.addEventListener('room-joined', mockHandler);
    });
    
    const roomData = {
      roomId: 'test-room',
      participants: [
        { id: 'user-1', name: 'Alice', isMuted: false, isScreenSharing: false, joinedAt: new Date(), isConnected: true },
      ],
    };
    
    // Simulate room-joined event
    act(() => {
      const roomJoinedHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'room-joined'
      )[1];
      roomJoinedHandler(roomData);
    });
    
    expect(mockHandler).toHaveBeenCalledWith(roomData);
  });
});
```

## 4. エラーハンドリングテストケース

### ネットワークエラー
```typescript
describe('Error Handling', () => {
  test('ネットワークエラーが適切に処理される', () => {
    const { result } = renderHook(() => useSocketConnection());
    
    act(() => {
      result.current.connect('test-room');
    });
    
    const networkError = new Error('Network Error');
    
    act(() => {
      const errorHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connect_error'
      )[1];
      errorHandler(networkError);
    });
    
    expect(result.current.connectionState.error).toBe('Network Error');
    expect(result.current.connectionState.isConnected).toBe(false);
  });

  test('ルーム満員エラーが処理される', () => {
    const { result } = renderHook(() => useRoom(), { wrapper: RoomProvider });
    
    act(() => {
      const roomFullHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'room-full'
      )[1];
      roomFullHandler();
    });
    
    expect(result.current.state.error).toContain('ルームが満員');
  });

  test('予期しない切断が処理される', () => {
    const { result } = renderHook(() => useSocketConnection());
    
    // Setup connected state
    act(() => {
      result.current.connect('test-room');
      const connectHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connect'
      )[1];
      connectHandler();
    });
    
    // Simulate unexpected disconnect
    act(() => {
      const disconnectHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'disconnect'
      )[1];
      disconnectHandler('transport error');
    });
    
    expect(result.current.connectionState.isConnected).toBe(false);
    expect(result.current.connectionState.reconnectAttempts).toBeGreaterThan(0);
  });
});
```

## 5. UI統合テストケース

### 接続状態表示
```typescript
describe('Connection Status UI', () => {
  test('接続状態インジケーターが正しく表示される', () => {
    render(
      <RoomProvider>
        <ConnectionStatus />
      </RoomProvider>
    );
    
    // 初期状態: 未接続
    expect(screen.getByLabelText('未接続')).toBeInTheDocument();
    
    // 接続中状態をシミュレート
    act(() => {
      // Trigger connecting state
    });
    
    expect(screen.getByLabelText('接続中')).toBeInTheDocument();
  });

  test('再接続通知が表示される', async () => {
    render(
      <RoomProvider>
        <ReconnectionNotification />
      </RoomProvider>
    );
    
    // Simulate reconnection
    act(() => {
      // Trigger reconnection state
    });
    
    await waitFor(() => {
      expect(screen.getByText(/再接続中/i)).toBeInTheDocument();
    });
  });
});
```

### 参加者アニメーション
```typescript
describe('Participant Animations', () => {
  test('参加者追加時にアニメーションが実行される', async () => {
    render(
      <RoomProvider>
        <ParticipantsList participants={[]} />
      </RoomProvider>
    );
    
    const newParticipant = {
      id: 'user-1',
      name: 'Alice',
      isMuted: false,
      isScreenSharing: false,
      joinedAt: new Date(),
      isConnected: true,
    };
    
    // Add participant
    act(() => {
      // Trigger participant addition
    });
    
    // Check for animation classes
    await waitFor(() => {
      const participantElement = screen.getByText('Alice');
      expect(participantElement).toHaveClass('fade-in');
    });
  });

  test('参加者退出時にアニメーションが実行される', async () => {
    const participants = [
      { id: 'user-1', name: 'Alice', isMuted: false, isScreenSharing: false, joinedAt: new Date(), isConnected: true },
    ];
    
    render(
      <RoomProvider>
        <ParticipantsList participants={participants} />
      </RoomProvider>
    );
    
    // Remove participant
    act(() => {
      // Trigger participant removal
    });
    
    await waitFor(() => {
      const participantElement = screen.getByText('Alice');
      expect(participantElement).toHaveClass('fade-out');
    });
  });
});
```

## テスト実行要件

### 必須テストカバレッジ
- **Hooks**: 95%以上
- **Context**: 90%以上
- **統合テスト**: 85%以上
- **エラーハンドリング**: 100%

### テスト実行コマンド
```bash
# Socket.IO関連テスト
npm test -- socket

# 統合テスト
npm test -- integration

# E2Eテスト（要Socket.IOサーバー）
npm run test:e2e
```

## モック要件

### Socket.IOモック
```typescript
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
```

### タイマーモック
```typescript
vi.useFakeTimers();
// テスト後
vi.useRealTimers();
```