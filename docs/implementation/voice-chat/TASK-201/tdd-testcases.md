# TASK-201: React基本構成とUI実装 - テストケース

## テスト戦略
- **単体テスト**: 各コンポーネントの独立した動作を検証
- **統合テスト**: コンポーネント間の連携を検証
- **アクセシビリティテスト**: a11y要件の確認
- **レスポンシブテスト**: 画面サイズ対応の確認

## 1. RoomViewコンポーネント テストケース

### 基本レンダリング
```typescript
describe('RoomView Component', () => {
  test('正常にレンダリングされる', () => {
    // Given: 基本的なプロパティ
    const props = {
      roomId: 'test-room',
      isConnected: true,
      participants: [],
      onLeaveRoom: jest.fn()
    };
    
    // When: コンポーネントをレンダリング
    render(<RoomView {...props} />);
    
    // Then: 基本要素が表示される
    expect(screen.getByText('test-room')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /退室/i })).toBeInTheDocument();
  });

  test('参加者リストが表示される', () => {
    // Given: 参加者データ
    const participants = [
      { id: '1', name: 'Alice', isMuted: false, isScreenSharing: false, joinedAt: new Date() },
      { id: '2', name: 'Bob', isMuted: true, isScreenSharing: false, joinedAt: new Date() }
    ];
    
    // When: 参加者ありでレンダリング
    render(<RoomView roomId="test" isConnected={true} participants={participants} onLeaveRoom={jest.fn()} />);
    
    // Then: 参加者が表示される
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  test('退室ボタンクリックでコールバックが呼ばれる', () => {
    // Given: モックコールバック
    const onLeaveRoom = jest.fn();
    
    // When: 退室ボタンをクリック
    render(<RoomView roomId="test" isConnected={true} participants={[]} onLeaveRoom={onLeaveRoom} />);
    fireEvent.click(screen.getByRole('button', { name: /退室/i }));
    
    // Then: コールバックが呼ばれる
    expect(onLeaveRoom).toHaveBeenCalledTimes(1);
  });
});
```

### 接続状態テスト
```typescript
describe('RoomView Connection States', () => {
  test('未接続時は適切なメッセージを表示', () => {
    render(<RoomView roomId="test" isConnected={false} participants={[]} onLeaveRoom={jest.fn()} />);
    expect(screen.getByText(/接続中/i)).toBeInTheDocument();
  });

  test('接続済み時は通常のUIを表示', () => {
    render(<RoomView roomId="test" isConnected={true} participants={[]} onLeaveRoom={jest.fn()} />);
    expect(screen.getByRole('button', { name: /退室/i })).toBeInTheDocument();
  });
});
```

## 2. MediaControlsコンポーネント テストケース

### 基本機能テスト
```typescript
describe('MediaControls Component', () => {
  test('ミュートボタンが正常に動作する', () => {
    // Given: ミュート状態とコールバック
    const onToggleMute = jest.fn();
    
    // When: ミュートボタンをクリック
    render(<MediaControls isMuted={false} isScreenSharing={false} onToggleMute={onToggleMute} onToggleScreenShare={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /ミュート/i }));
    
    // Then: コールバックが呼ばれる
    expect(onToggleMute).toHaveBeenCalledTimes(1);
  });

  test('画面共有ボタンが正常に動作する', () => {
    // Given: 画面共有状態とコールバック
    const onToggleScreenShare = jest.fn();
    
    // When: 画面共有ボタンをクリック
    render(<MediaControls isMuted={false} isScreenSharing={false} onToggleMute={jest.fn()} onToggleScreenShare={onToggleScreenShare} />);
    fireEvent.click(screen.getByRole('button', { name: /画面共有/i }));
    
    // Then: コールバックが呼ばれる
    expect(onToggleScreenShare).toHaveBeenCalledTimes(1);
  });

  test('無効化状態では操作できない', () => {
    // Given: 無効化されたコントロール
    const onToggleMute = jest.fn();
    
    // When: 無効化されたボタンをクリック
    render(<MediaControls isMuted={false} isScreenSharing={false} onToggleMute={onToggleMute} onToggleScreenShare={jest.fn()} disabled={true} />);
    const muteButton = screen.getByRole('button', { name: /ミュート/i });
    
    // Then: ボタンが無効化されている
    expect(muteButton).toBeDisabled();
  });
});
```

### 状態表示テスト
```typescript
describe('MediaControls State Display', () => {
  test('ミュート中は適切なアイコンを表示', () => {
    render(<MediaControls isMuted={true} isScreenSharing={false} onToggleMute={jest.fn()} onToggleScreenShare={jest.fn()} />);
    expect(screen.getByRole('button', { name: /ミュート解除/i })).toBeInTheDocument();
  });

  test('画面共有中は適切なアイコンを表示', () => {
    render(<MediaControls isMuted={false} isScreenSharing={true} onToggleMute={jest.fn()} onToggleScreenShare={jest.fn()} />);
    expect(screen.getByRole('button', { name: /画面共有停止/i })).toBeInTheDocument();
  });
});
```

## 3. ParticipantsListコンポーネント テストケース

### 基本機能テスト
```typescript
describe('ParticipantsList Component', () => {
  test('参加者リストを正しく表示', () => {
    // Given: 参加者データ
    const participants = [
      { id: '1', name: 'Alice', isMuted: false, isScreenSharing: false, joinedAt: new Date() },
      { id: '2', name: 'Bob', isMuted: true, isScreenSharing: true, joinedAt: new Date() }
    ];
    
    // When: コンポーネントをレンダリング
    render(<ParticipantsList participants={participants} />);
    
    // Then: 参加者が表示される
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('参加者: 2人')).toBeInTheDocument();
  });

  test('空のリストでも正常に表示', () => {
    render(<ParticipantsList participants={[]} />);
    expect(screen.getByText('参加者: 0人')).toBeInTheDocument();
  });

  test('現在のユーザーをハイライト表示', () => {
    const participants = [
      { id: '1', name: 'Alice', isMuted: false, isScreenSharing: false, joinedAt: new Date() },
      { id: '2', name: 'Bob', isMuted: true, isScreenSharing: false, joinedAt: new Date() }
    ];
    
    render(<ParticipantsList participants={participants} currentUserId="1" />);
    
    // Alice（現在のユーザー）が特別にスタイリングされている
    const aliceElement = screen.getByText('Alice').closest('li');
    expect(aliceElement).toHaveClass('current-user');
  });
});
```

### 状態アイコンテスト
```typescript
describe('ParticipantsList Status Icons', () => {
  test('ミュート状態アイコンを表示', () => {
    const participants = [
      { id: '1', name: 'Alice', isMuted: true, isScreenSharing: false, joinedAt: new Date() }
    ];
    
    render(<ParticipantsList participants={participants} />);
    expect(screen.getByLabelText('ミュート中')).toBeInTheDocument();
  });

  test('画面共有状態アイコンを表示', () => {
    const participants = [
      { id: '1', name: 'Alice', isMuted: false, isScreenSharing: true, joinedAt: new Date() }
    ];
    
    render(<ParticipantsList participants={participants} />);
    expect(screen.getByLabelText('画面共有中')).toBeInTheDocument();
  });
});
```

## 4. 共通コンポーネント テストケース

### LoadingSpinner
```typescript
describe('LoadingSpinner Component', () => {
  test('ローディングスピナーが表示される', () => {
    render(<LoadingSpinner />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByLabelText(/読み込み中/i)).toBeInTheDocument();
  });

  test('カスタムメッセージが表示される', () => {
    render(<LoadingSpinner message="接続中..." />);
    expect(screen.getByText('接続中...')).toBeInTheDocument();
  });
});
```

### ErrorAlert
```typescript
describe('ErrorAlert Component', () => {
  test('エラーメッセージが表示される', () => {
    render(<ErrorAlert message="接続エラーが発生しました" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('接続エラーが発生しました')).toBeInTheDocument();
  });

  test('再試行ボタンが動作する', () => {
    const onRetry = jest.fn();
    render(<ErrorAlert message="エラー" onRetry={onRetry} />);
    
    fireEvent.click(screen.getByRole('button', { name: /再試行/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
```

## 5. アクセシビリティ テストケース

```typescript
describe('Accessibility Tests', () => {
  test('キーボードナビゲーションが動作する', () => {
    render(<MediaControls isMuted={false} isScreenSharing={false} onToggleMute={jest.fn()} onToggleScreenShare={jest.fn()} />);
    
    const muteButton = screen.getByRole('button', { name: /ミュート/i });
    muteButton.focus();
    expect(muteButton).toHaveFocus();
    
    // Tabキーで次のボタンに移動
    fireEvent.keyDown(muteButton, { key: 'Tab' });
    const shareButton = screen.getByRole('button', { name: /画面共有/i });
    expect(shareButton).toHaveFocus();
  });

  test('ARIA属性が適切に設定されている', () => {
    render(<MediaControls isMuted={true} isScreenSharing={false} onToggleMute={jest.fn()} onToggleScreenShare={jest.fn()} />);
    
    const muteButton = screen.getByRole('button', { name: /ミュート解除/i });
    expect(muteButton).toHaveAttribute('aria-pressed', 'true');
  });
});
```

## 6. レスポンシブ テストケース

```typescript
describe('Responsive Design Tests', () => {
  test('モバイル画面でレイアウトが調整される', () => {
    // モバイル画面サイズに設定
    Object.defineProperty(window, 'innerWidth', { value: 375 });
    Object.defineProperty(window, 'innerHeight', { value: 667 });
    
    render(<RoomView roomId="test" isConnected={true} participants={[]} onLeaveRoom={jest.fn()} />);
    
    const container = screen.getByTestId('room-view-container');
    expect(container).toHaveClass('mobile-layout');
  });

  test('デスクトップ画面で適切なレイアウト', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1200 });
    
    render(<RoomView roomId="test" isConnected={true} participants={[]} onLeaveRoom={jest.fn()} />);
    
    const container = screen.getByTestId('room-view-container');
    expect(container).toHaveClass('desktop-layout');
  });
});
```

## テスト実行要件

### 必須テストカバレッジ
- **ステートメント**: 90%以上
- **ブランチ**: 85%以上
- **関数**: 95%以上
- **ライン**: 90%以上

### テスト実行コマンド
```bash
# 全テスト実行
npm test

# カバレッジ付きテスト
npm run test:coverage

# ウォッチモード
npm run test:watch

# アクセシビリティテスト
npm run test:a11y
```

## エッジケース

### エラー処理
1. 不正なプロパティが渡された場合
2. ネットワークエラーが発生した場合
3. 予期しないデータ形式の場合

### パフォーマンス
1. 大量の参加者がいる場合（100人以上）
2. 頻繁な状態更新が発生する場合
3. メモリリークの検証