# TASK-202: Socket.IO接続とイベント管理 - 要件定義

## 概要
フロントエンドでSocket.IOクライアントを設定し、サーバーとの双方向通信を実現する。リアルタイムイベント管理と状態同期を実装する。

## 技術仕様
- **Socket.IO Client**: 4.7.2
- **状態管理**: React Context API + useReducer
- **自動再接続**: Socket.IO標準機能 + カスタムロジック
- **型安全性**: TypeScript interface定義

## 実装要件

### 1. Socket.IO接続管理

#### ConnectionManager Hook
```typescript
interface ConnectionState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  socket: Socket | null;
  reconnectAttempts: number;
}

interface UseSocketConnection {
  connectionState: ConnectionState;
  connect: (roomId: string) => void;
  disconnect: () => void;
  emit: (event: string, data: any) => void;
}
```

#### 機能要件
- Socket.IOサーバーへの接続・切断
- 自動再接続（最大5回、指数バックオフ）
- 接続エラーハンドリング
- 接続状態の監視

### 2. イベント管理

#### 送信イベント
```typescript
// ルーム参加
socket.emit('join-room', { roomId: string, userId: string, userName: string });

// ルーム退出
socket.emit('leave-room', { roomId: string, userId: string });

// シグナリングメッセージ
socket.emit('offer', { targetId: string, offer: RTCSessionDescription });
socket.emit('answer', { targetId: string, answer: RTCSessionDescription });
socket.emit('ice-candidate', { targetId: string, candidate: RTCIceCandidate });

// メディア制御
socket.emit('toggle-mute', { userId: string, isMuted: boolean });
socket.emit('toggle-screen-share', { userId: string, isSharing: boolean });
```

#### 受信イベント
```typescript
// 接続管理
socket.on('connect', () => void);
socket.on('disconnect', (reason: string) => void);
socket.on('connect_error', (error: Error) => void);

// ルーム管理
socket.on('room-joined', (data: { roomId: string, participants: Participant[] }) => void);
socket.on('user-joined', (data: { participant: Participant }) => void);
socket.on('user-left', (data: { userId: string }) => void);
socket.on('room-full', () => void);

// メディア状態同期
socket.on('user-muted', (data: { userId: string, isMuted: boolean }) => void);
socket.on('screen-share-started', (data: { userId: string }) => void);
socket.on('screen-share-stopped', (data: { userId: string }) => void);

// シグナリング
socket.on('offer', (data: { fromId: string, offer: RTCSessionDescription }) => void);
socket.on('answer', (data: { fromId: string, answer: RTCSessionDescription }) => void);
socket.on('ice-candidate', (data: { fromId: string, candidate: RTCIceCandidate }) => void);
```

### 3. 状態管理 (Context API)

#### RoomContext
```typescript
interface RoomState {
  roomId: string | null;
  participants: Participant[];
  currentUser: Participant | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  screenSharingUser: string | null;
}

interface RoomContextValue {
  state: RoomState;
  actions: {
    joinRoom: (roomId: string, userName: string) => void;
    leaveRoom: () => void;
    toggleMute: () => void;
    toggleScreenShare: () => void;
    clearError: () => void;
  };
}
```

#### State Reducer
```typescript
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
  | { type: 'CLEAR_ERROR' };
```

### 4. UI/UX要件

#### 接続状態インジケーター
- 接続中: パルスアニメーション付きアイコン
- 接続済み: 緑色のアイコン
- 切断中: 赤色のアイコン
- 再接続中: スピナー付きアイコン

#### 再接続中の通知
- トースト通知で再接続試行を表示
- 再接続回数と残り試行回数を表示
- 手動再接続ボタン

#### 参加者の入退室アニメーション
- フェードイン/フェードアウト
- スライドアニメーション
- 参加者数の変化アニメーション

### 5. エラーハンドリング

#### 接続エラー
- ネットワークエラー
- サーバーエラー（500, 503）
- 認証エラー
- タイムアウトエラー

#### 運用エラー
- ルーム満員
- 無効なルームID
- 重複接続
- 予期しない切断

#### エラー回復
- 自動再接続
- 状態の復元
- ユーザー通知
- 手動回復オプション

## データ型定義

```typescript
// 拡張Participant型
interface Participant {
  id: string;
  name: string;
  isMuted: boolean;
  isScreenSharing: boolean;
  joinedAt: Date;
  isConnected: boolean; // 新規追加
  lastSeen?: Date; // 新規追加
}

// Socket.IOイベント型
interface SocketEvents {
  // Client to Server
  'join-room': (data: JoinRoomData) => void;
  'leave-room': (data: LeaveRoomData) => void;
  'toggle-mute': (data: ToggleMuteData) => void;
  'toggle-screen-share': (data: ToggleScreenShareData) => void;
  'offer': (data: OfferData) => void;
  'answer': (data: AnswerData) => void;
  'ice-candidate': (data: IceCandidateData) => void;

  // Server to Client
  'room-joined': (data: RoomJoinedData) => void;
  'user-joined': (data: UserJoinedData) => void;
  'user-left': (data: UserLeftData) => void;
  'user-muted': (data: UserMutedData) => void;
  'screen-share-started': (data: ScreenShareStartedData) => void;
  'screen-share-stopped': (data: ScreenShareStoppedData) => void;
  'room-full': () => void;
  'connect': () => void;
  'disconnect': (reason: string) => void;
  'connect_error': (error: Error) => void;
}

// イベントデータ型
interface JoinRoomData {
  roomId: string;
  userId: string;
  userName: string;
}

interface RoomJoinedData {
  roomId: string;
  participants: Participant[];
  currentUser: Participant;
}

// ... 他のデータ型
```

## 受け入れ基準

### 必須機能
1. ✅ Socket.IOサーバーとの接続・切断
2. ✅ ルーム参加・退出の管理
3. ✅ 参加者リストのリアルタイム同期
4. ✅ 自動再接続機能
5. ✅ 接続状態の表示

### 信頼性
1. ✅ ネットワーク断絶からの回復
2. ✅ サーバー再起動時の自動再接続
3. ✅ エラー状態の適切な表示
4. ✅ 状態の一貫性維持

### ユーザビリティ
1. ✅ 接続状態の視覚的フィードバック
2. ✅ スムーズな参加者変更アニメーション
3. ✅ 分かりやすいエラーメッセージ
4. ✅ 迅速な状態更新

### パフォーマンス
1. ✅ 効率的なイベント処理
2. ✅ 不要な再レンダリング防止
3. ✅ メモリリークの防止
4. ✅ 適切なイベントクリーンアップ

## 実装の制約

### セキュリティ
- Socket.IO接続の検証
- 不正なイベントの防止
- XSS対策

### パフォーマンス
- イベントリスナーの適切な管理
- Stale Closureの回避
- Effect依存関係の最適化

### 拡張性
- 新しいイベント型の追加容易性
- プラグイン機能の準備
- 複数ルーム対応準備