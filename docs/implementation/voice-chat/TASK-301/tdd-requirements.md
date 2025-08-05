# TASK-301: WebRTC接続管理実装 - 要件定義

## 概要

WebRTC接続管理機能を実装し、複数ピア間での音声通話を可能にする。

## 要件リンク

- REQ-003: WebRTC P2P音声通話
- REQ-401: WebRTC接続管理

## 依存タスク

- TASK-202: Socket.IO接続とイベント管理 ✅

## 実装詳細

### 1. PeerConnectionManager実装

#### 1.1 基本機能
- RTCPeerConnection インスタンス管理
- 複数ピアとの接続管理
- 接続状態の監視と管理

#### 1.2 ICEサーバー設定
- STUN サーバー設定
- TURN サーバー設定（オプション）
- デフォルト設定の提供

#### 1.3 メディアストリーム取得
- getUserMedia API を使用した音声ストリーム取得
- デバイス許可の管理
- ストリーム品質の設定

#### 1.4 Offer/Answer生成処理
- createOffer() の実装
- createAnswer() の実装
- SDP の設定と交換

#### 1.5 ICE候補収集処理
- onicecandidate イベントハンドリング
- ICE候補の収集と送信
- 接続確立の管理

### 2. フック実装 (useWebRTC)

#### 2.1 インターface
```typescript
interface UseWebRTCReturn {
  // 接続管理
  peers: Map<string, RTCPeerConnection>
  connectionStatus: Record<string, RTCPeerConnectionState>
  
  // メディア管理
  localStream: MediaStream | null
  remoteStreams: Map<string, MediaStream>
  
  // 制御関数
  initializeConnection: (userId: string) => Promise<void>
  createOffer: (userId: string) => Promise<RTCSessionDescriptionInit>
  handleAnswer: (userId: string, answer: RTCSessionDescriptionInit) => Promise<void>
  handleOffer: (userId: string, offer: RTCSessionDescriptionInit) => Promise<RTCSessionDescriptionInit>
  addIceCandidate: (userId: string, candidate: RTCIceCandidate) => Promise<void>
  cleanup: (userId?: string) => void
}
```

#### 2.2 状態管理
- 接続状態の追跡
- エラー状態の管理
- 再接続処理

### 3. UI/UX要件

#### 3.1 マイク許可要求ダイアログ
- ブラウザネイティブのダイアログ使用
- 許可拒否時の適切なエラー表示

#### 3.2 接続品質インジケーター
- 接続状態の視覚的表示
- 遅延やパケットロスの表示（将来拡張）

#### 3.3 音声レベルメーター
- 音声入力レベルの可視化
- リアルタイム更新

### 4. テスト要件

#### 4.1 単体テスト
- PeerConnectionManager クラス
- useWebRTC フック
- ICE サーバー設定
- エラーハンドリング

#### 4.2 統合テスト
- P2P接続確立フロー
- 複数ピア接続
- Socket.IO との連携

#### 4.3 ブラウザ互換性テスト
- Chrome, Firefox, Safari
- モバイルブラウザ

### 5. エラーハンドリング

#### 5.1 マイク許可拒否
- エラーメッセージの表示
- リトライ機能の提供

#### 5.2 ICE接続失敗
- TURN サーバーへのフォールバック
- 接続タイムアウト処理

#### 5.3 メディアデバイスエラー
- デバイス使用中エラー
- デバイス未接続エラー

### 6. パフォーマンス要件

#### 6.1 遅延
- 音声遅延: 200ms以内（目標）
- 接続確立時間: 3秒以内

#### 6.2 リソース使用量
- メモリ使用量の最適化
- CPU 使用率の監視

### 7. セキュリティ要件

#### 7.1 HTTPS必須
- WebRTC は HTTPS 環境でのみ動作
- 開発環境での対応

#### 7.2 Origin 検証
- 許可されたオリジンからのみ接続受付

## 完了条件

1. **基本機能**
   - [ ] P2P音声通話が確立される
   - [ ] 複数ピア接続が管理される
   - [ ] 音声が双方向で送受信される

2. **エラーハンドリング**
   - [ ] マイク許可拒否が適切に処理される
   - [ ] ICE接続失敗が処理される
   - [ ] メディアデバイスエラーが処理される

3. **UI/UX**
   - [ ] マイク許可要求が表示される
   - [ ] 接続品質が表示される
   - [ ] 音声レベルが表示される

4. **テスト**
   - [ ] 単体テストが通る
   - [ ] 統合テストが通る
   - [ ] ブラウザ互換性が確認される

## 技術仕様

### WebRTC Configuration
```typescript
const config: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ],
  iceCandidatePoolSize: 10
}
```

### Media Constraints
```typescript
const constraints: MediaStreamConstraints = {
  video: false,
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  }
}
```

## 実装優先順位

1. **High Priority**
   - PeerConnectionManager基本実装
   - useWebRTC フック
   - 基本的な接続確立

2. **Medium Priority**
   - エラーハンドリング
   - UI/UX要件
   - 接続品質表示

3. **Low Priority**
   - パフォーマンス最適化
   - 詳細なメトリクス収集

## 制約事項

- 時間制約: 30分以内での実装
- MVP 優先: 最小限の動作を確保
- 品質より速度: 完璧を求めない