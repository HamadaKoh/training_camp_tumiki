# TASK-303: 画面共有機能実装 - 要件定義

## 概要

画面共有機能を実装し、参加者間での画面共有、ストリーム管理、排他制御を可能にする。

## 要件リンク

- REQ-005: 画面共有機能
- REQ-104: 画面共有排他制御
- REQ-203: 画面共有UI

## 依存タスク

- TASK-302: 音声制御機能実装 ✅

## 実装詳細

### 1. 画面共有制御機能 (useScreenShare)

#### 1.1 基本機能
- getDisplayMedia API による画面キャプチャ
- 画面共有ストリーム管理
- replaceTrack による動的ストリーム切り替え
- 共有停止処理
- 排他制御（1人のみ共有可能）

#### 1.2 ストリーム管理
- 画面共有ストリームの取得と管理
- 既存WebRTC接続でのトラック置換
- ストリーム終了時の自動クリーンアップ
- 複数解像度対応

#### 1.3 排他制御
- 同時共有の防止（1人のみ）
- 共有権限の管理
- 共有中の他参加者からのリクエスト拒否
- 共有者の突然の切断対応

### 2. フック実装 (useScreenShare)

#### 2.1 インターフェース
```typescript
interface UseScreenShareReturn {
  // 状態
  isSharing: boolean
  isLoading: boolean
  sharingUserId: string | null
  screenStream: MediaStream | null
  
  // 制御関数
  startScreenShare: () => Promise<void>
  stopScreenShare: () => Promise<void>
  
  // 共有画面表示
  sharedScreenStream: MediaStream | null
}
```

#### 2.2 状態管理
- ローカル画面共有状態
- 現在の共有者情報
- 共有画面ストリーム
- 操作中のローディング状態

#### 2.3 WebRTC統合
- TASK-301, TASK-302で実装した既存機能との連携
- PeerConnection での replaceTrack 実行
- 画面共有ストリームの全参加者への配信

### 3. UI/UX要件

#### 3.1 画面共有プレビュー
- 共有前のプレビュー表示
- 共有する画面/アプリケーションの選択
- プレビューサイズの調整

#### 3.2 共有中インジケーター
- 画面共有中の視覚的表示
- 共有者の識別表示
- 共有時間の表示

#### 3.3 共有画面の最適表示
- アスペクト比の維持
- 画面サイズに応じた自動調整
- フルスクリーン表示オプション

#### 3.4 停止ボタンの強調表示
- 画面共有停止ボタンの明確な表示
- ホットキー対応（Esc キー等）
- 確認ダイアログの表示

### 4. Socket.IOイベント仕様

#### 4.1 送信イベント
```typescript
// 画面共有開始通知
socket.emit('screen-share-started', {
  userId: string,
  timestamp: number
})

// 画面共有停止通知
socket.emit('screen-share-stopped', {
  userId: string,
  timestamp: number
})

// 画面共有リクエスト
socket.emit('screen-share-request', {
  userId: string
})
```

#### 4.2 受信イベント
```typescript
// 他参加者の画面共有開始
socket.on('participant-screen-share-started', (data: {
  userId: string
}) => void)

// 他参加者の画面共有停止
socket.on('participant-screen-share-stopped', (data: {
  userId: string
}) => void)

// 画面共有リクエスト拒否
socket.on('screen-share-request-denied', (data: {
  reason: string,
  currentSharingUserId: string
}) => void)
```

### 5. getDisplayMedia API 仕様

#### 5.1 制約設定
```typescript
const displayMediaConstraints: DisplayMediaStreamConstraints = {
  video: {
    width: { ideal: 1920, max: 1920 },
    height: { ideal: 1080, max: 1080 },
    frameRate: { ideal: 30, max: 60 }
  },
  audio: {
    echoCancellation: true,
    noiseSuppression: true
  }
}
```

#### 5.2 ブラウザ対応
- Chrome 72+: 完全サポート
- Firefox 66+: 完全サポート
- Safari 13+: 基本サポート
- Edge 79+: 完全サポート

### 6. replaceTrack 処理

#### 6.1 ストリーム置換フロー
1. 画面共有ストリーム取得
2. 既存の映像トラック停止
3. 全PeerConnection で replaceTrack 実行
4. 新しいトラックの有効化

#### 6.2 エラー処理
- replaceTrack 失敗時のロールバック
- 一部接続での失敗時の部分成功処理
- ストリーム取得失敗時のフォールバック

### 7. テスト要件

#### 7.1 単体テスト
- useScreenShare フック
- 画面共有ストリーム管理
- 排他制御ロジック
- エラーハンドリング

#### 7.2 統合テスト
- WebRTC統合（replaceTrack）
- Socket.IOイベント処理
- 複数参加者での動作確認

#### 7.3 画面選択キャンセル処理
- ダイアログキャンセル時の処理
- 部分的な許可での処理
- タイムアウト時の処理

### 8. エラーハンドリング

#### 8.1 共有許可拒否
- ユーザーによる画面共有拒否
- 適切なエラーメッセージ表示
- 状態の一貫性維持

#### 8.2 共有中の切断
- 画面共有者の突然の切断
- 自動的な共有停止処理
- 他参加者への通知

#### 8.3 ブラウザ非対応
- getDisplayMedia API 未対応ブラウザ
- 機能無効化とフォールバック
- 代替手段の提示

### 9. パフォーマンス要件

#### 9.1 共有開始時間
- 画面選択から共有開始: 3秒以内
- replaceTrack 完了: 2秒以内
- 全参加者への配信: 5秒以内

#### 9.2 画面共有品質
- 解像度: 1920x1080 (理想値)
- フレームレート: 30fps (理想値)
- 遅延: 500ms以内

#### 9.3 リソース効率
- CPU使用率の最適化
- メモリ使用量の管理
- ネットワーク帯域の考慮

### 10. セキュリティ要件

#### 10.1 プライバシー保護
- 画面共有前の確認ダイアログ
- 共有中の明確な表示
- 意図しない共有の防止

#### 10.2 アクセス制御
- 許可された参加者のみ共有可能
- 共有権限の管理
- 不正な共有要求の拒否

### 11. アクセシビリティ要件

#### 11.1 キーボード操作
- 画面共有ボタンのキーボードアクセス
- Esc キーでの共有停止
- フォーカス管理

#### 11.2 スクリーンリーダー対応
- 適切なaria-label設定
- 状態変更の音声通知
- 共有状態の明確な伝達

## 完了条件

1. **基本機能**
   - [ ] 画面共有が開始/停止できる
   - [ ] 他の参加者に共有画面が表示される
   - [ ] 排他制御が正しく動作する

2. **UI/UX**
   - [ ] 画面共有プレビューが表示される
   - [ ] 共有中インジケーターが動作する
   - [ ] 停止ボタンが強調表示される

3. **統合**
   - [ ] WebRTC接続との統合が動作
   - [ ] Socket.IOイベントが正しく処理される
   - [ ] 既存の音声機能との共存

4. **エラーハンドリング**
   - [ ] 各種エラーケースが適切に処理される
   - [ ] ユーザーに分かりやすいエラー表示

5. **パフォーマンス**
   - [ ] 画面共有開始が3秒以内
   - [ ] 画面共有遅延が500ms以内

## 技術仕様

### DisplayMedia Constraints
```typescript
const constraints: DisplayMediaStreamConstraints = {
  video: {
    width: { ideal: 1920, max: 1920 },
    height: { ideal: 1080, max: 1080 },  
    frameRate: { ideal: 30, max: 60 }
  },
  audio: {
    echoCancellation: true,
    noiseSuppression: true
  }
}
```

### 状態管理
```typescript
interface ScreenShareState {
  isSharing: boolean
  isLoading: boolean
  sharingUserId: string | null
  screenStream: MediaStream | null
  sharedScreenStream: MediaStream | null
  error: string | null
}
```

## 実装優先順位

1. **High Priority**
   - useScreenShare フック基本実装
   - getDisplayMedia API 使用
   - replaceTrack 統合

2. **Medium Priority**
   - Socket.IO 排他制御
   - エラーハンドリング
   - UI統合準備

3. **Low Priority**
   - 詳細なUI/UX機能
   - パフォーマンス最適化
   - アクセシビリティ強化

## 制約事項

- 時間制約: 30分以内での実装
- MVP 優先: 基本的な画面共有機能を確実に動作させる
- TASK-301, TASK-302への依存: 既存のWebRTC実装を活用
- ブラウザ制限: getDisplayMedia API の対応状況に依存