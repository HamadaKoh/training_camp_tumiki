# TASK-201: React基本構成とUI実装 - RED Phase

## 目的
失敗するテストを作成し、テストが期待通りに失敗することを確認する。

## 実装手順

### 1. テスト環境のセットアップ ✅
- Vitest + React Testing Library
- 型定義の作成
- テスト設定ファイル

### 2. 失敗するテストの作成

## RoomView コンポーネント テスト

```typescript
// src/components/RoomView/__tests__/RoomView.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { RoomView } from '../index';
import { RoomViewProps } from '../../../types';

describe('RoomView Component', () => {
  const defaultProps: RoomViewProps = {
    roomId: 'test-room',
    isConnected: true,
    participants: [],
    onLeaveRoom: vi.fn()
  };

  test('正常にレンダリングされる', () => {
    render(<RoomView {...defaultProps} />);
    
    expect(screen.getByText('test-room')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /退室/i })).toBeInTheDocument();
  });

  test('参加者リストが表示される', () => {
    const participants = [
      { id: '1', name: 'Alice', isMuted: false, isScreenSharing: false, joinedAt: new Date() },
      { id: '2', name: 'Bob', isMuted: true, isScreenSharing: false, joinedAt: new Date() }
    ];
    
    render(<RoomView {...defaultProps} participants={participants} />);
    
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  test('退室ボタンクリックでコールバックが呼ばれる', () => {
    const onLeaveRoom = vi.fn();
    
    render(<RoomView {...defaultProps} onLeaveRoom={onLeaveRoom} />);
    fireEvent.click(screen.getByRole('button', { name: /退室/i }));
    
    expect(onLeaveRoom).toHaveBeenCalledTimes(1);
  });

  test('未接続時は適切なメッセージを表示', () => {
    render(<RoomView {...defaultProps} isConnected={false} />);
    expect(screen.getByText(/接続中/i)).toBeInTheDocument();
  });
});
```

## MediaControls コンポーネント テスト

```typescript
// src/components/MediaControls/__tests__/MediaControls.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { MediaControls } from '../index';
import { MediaControlsProps } from '../../../types';

describe('MediaControls Component', () => {
  const defaultProps: MediaControlsProps = {
    isMuted: false,
    isScreenSharing: false,
    onToggleMute: vi.fn(),
    onToggleScreenShare: vi.fn()
  };

  test('ミュートボタンが正常に動作する', () => {
    const onToggleMute = vi.fn();
    
    render(<MediaControls {...defaultProps} onToggleMute={onToggleMute} />);
    fireEvent.click(screen.getByRole('button', { name: /ミュート/i }));
    
    expect(onToggleMute).toHaveBeenCalledTimes(1);
  });

  test('画面共有ボタンが正常に動作する', () => {
    const onToggleScreenShare = vi.fn();
    
    render(<MediaControls {...defaultProps} onToggleScreenShare={onToggleScreenShare} />);
    fireEvent.click(screen.getByRole('button', { name: /画面共有/i }));
    
    expect(onToggleScreenShare).toHaveBeenCalledTimes(1);
  });

  test('無効化状態では操作できない', () => {
    render(<MediaControls {...defaultProps} disabled={true} />);
    
    const muteButton = screen.getByRole('button', { name: /ミュート/i });
    expect(muteButton).toBeDisabled();
  });

  test('ミュート中は適切なアイコンを表示', () => {
    render(<MediaControls {...defaultProps} isMuted={true} />);
    expect(screen.getByRole('button', { name: /ミュート解除/i })).toBeInTheDocument();
  });

  test('画面共有中は適切なアイコンを表示', () => {
    render(<MediaControls {...defaultProps} isScreenSharing={true} />);
    expect(screen.getByRole('button', { name: /画面共有停止/i })).toBeInTheDocument();
  });
});
```

## ParticipantsList コンポーネント テスト

```typescript
// src/components/ParticipantsList/__tests__/ParticipantsList.test.tsx
import { render, screen } from '@testing-library/react';
import { ParticipantsList } from '../index';
import { ParticipantsListProps } from '../../../types';

describe('ParticipantsList Component', () => {
  test('参加者リストを正しく表示', () => {
    const participants = [
      { id: '1', name: 'Alice', isMuted: false, isScreenSharing: false, joinedAt: new Date() },
      { id: '2', name: 'Bob', isMuted: true, isScreenSharing: true, joinedAt: new Date() }
    ];
    
    render(<ParticipantsList participants={participants} />);
    
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
    
    const aliceElement = screen.getByText('Alice').closest('li');
    expect(aliceElement).toHaveClass('current-user');
  });

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

## 共通コンポーネント テスト

### LoadingSpinner

```typescript
// src/components/common/LoadingSpinner/__tests__/LoadingSpinner.test.tsx
import { render, screen } from '@testing-library/react';
import { LoadingSpinner } from '../index';

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
// src/components/common/ErrorAlert/__tests__/ErrorAlert.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorAlert } from '../index';

describe('ErrorAlert Component', () => {
  test('エラーメッセージが表示される', () => {
    render(<ErrorAlert message="接続エラーが発生しました" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('接続エラーが発生しました')).toBeInTheDocument();
  });

  test('再試行ボタンが動作する', () => {
    const onRetry = vi.fn();
    render(<ErrorAlert message="エラー" onRetry={onRetry} />);
    
    fireEvent.click(screen.getByRole('button', { name: /再試行/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test('再試行ボタンが表示されない場合', () => {
    render(<ErrorAlert message="エラー" />);
    expect(screen.queryByRole('button', { name: /再試行/i })).not.toBeInTheDocument();
  });
});
```

## テスト実行結果（期待される失敗）

テストを実行すると、以下のエラーが発生することを確認：

```bash
npm test

# 期待される結果:
❌ RoomView Component › 正常にレンダリングされる
  Cannot resolve component RoomView

❌ MediaControls Component › ミュートボタンが正常に動作する  
  Cannot resolve component MediaControls

❌ ParticipantsList Component › 参加者リストを正しく表示
  Cannot resolve component ParticipantsList

❌ LoadingSpinner Component › ローディングスピナーが表示される
  Cannot resolve component LoadingSpinner

❌ ErrorAlert Component › エラーメッセージが表示される
  Cannot resolve component ErrorAlert
```

## 確認事項

1. ✅ 各コンポーネントのテストファイルが作成されている
2. ✅ テストが期待通りに失敗している（コンポーネントが存在しないため）
3. ✅ 型定義が正しく設定されている
4. ✅ テスト環境が正常に動作している

次のステップ: GREEN Phase - 失敗するテストを通すための最小限の実装を行う。