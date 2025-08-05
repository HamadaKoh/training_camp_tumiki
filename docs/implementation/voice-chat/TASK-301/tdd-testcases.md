# TASK-301: WebRTC接続管理実装 - テストケース定義

## 概要

WebRTC接続管理機能のテストケースを定義する。単体テスト、統合テスト、エラーケースを含む。

## テスト環境

- Testing Framework: Vitest
- DOM Testing: @testing-library/react
- WebRTC Mocking: Manual mocks

## 1. PeerConnectionManager 単体テスト

### 1.1 初期化テスト

#### Test Case: PCM-001
- **テスト名**: PeerConnectionManager初期化
- **入力**: ICEサーバー設定
- **期待結果**: インスタンスが正常に作成される
- **検証項目**:
  - インスタンスが RTCPeerConnection を持つ
  - ICEサーバー設定が正しく適用される

#### Test Case: PCM-002
- **テスト名**: デフォルト設定での初期化
- **入力**: 設定なし
- **期待結果**: デフォルトICEサーバーで初期化される
- **検証項目**:
  - Google STUN サーバーが設定される

### 1.2 接続管理テスト

#### Test Case: PCM-003
- **テスト名**: ピア接続の追加
- **入力**: ユーザーID
- **期待結果**: 新しいピア接続が作成される
- **検証項目**:
  - peers Map に新しいエントリが追加される
  - RTCPeerConnection が作成される

#### Test Case: PCM-004
- **テスト名**: ピア接続の削除
- **入力**: 既存のユーザーID
- **期待結果**: ピア接続が削除される
- **検証項目**:
  - peers Map からエントリが削除される
  - RTCPeerConnection.close() が呼ばれる

#### Test Case: PCM-005
- **テスト名**: 重複ピア接続の防止
- **入力**: 既存のユーザーID
- **期待結果**: 既存の接続が維持される
- **検証項目**:
  - peers Map のサイズが変わらない
  - 既存の RTCPeerConnection が保持される

### 1.3 Offer/Answer テスト

#### Test Case: PCM-006
- **テスト名**: Offer作成
- **入力**: ユーザーID
- **期待結果**: SDP Offer が生成される
- **検証項目**:
  - createOffer() が呼ばれる
  - setLocalDescription() が呼ばれる
  - SDP文字列が返される

#### Test Case: PCM-007
- **テスト名**: Answer作成
- **入力**: ユーザーID, SDP Offer
- **期待結果**: SDP Answer が生成される
- **検証項目**:
  - setRemoteDescription() が呼ばれる
  - createAnswer() が呼ばれる
  - setLocalDescription() が呼ばれる

#### Test Case: PCM-008
- **テスト名**: Remote SDP設定
- **入力**: ユーザーID, SDP Answer
- **期待結果**: Remote SDP が設定される
- **検証項目**:
  - setRemoteDescription() が呼ばれる

### 1.4 ICE候補テスト

#### Test Case: PCM-009
- **テスト名**: ICE候補追加
- **入力**: ユーザーID, ICE候補
- **期待結果**: ICE候補が追加される
- **検証項目**:
  - addIceCandidate() が呼ばれる

#### Test Case: PCM-010
- **テスト名**: ICE候補イベント処理
- **入力**: ICE候補イベント
- **期待結果**: 候補がSocket.IOで送信される
- **検証項目**:
  - onicecandidate イベントハンドラーが動作
  - Socket.IOのemitが呼ばれる

## 2. useWebRTC フック 単体テスト

### 2.1 初期化テスト

#### Test Case: HOOK-001
- **テスト名**: フック初期化
- **入力**: なし
- **期待結果**: 初期状態が正しく設定される
- **検証項目**:
  - peers が空のMap
  - localStream が null
  - connectionStatus が空のオブジェクト

#### Test Case: HOOK-002
- **テスト名**: メディアストリーム取得
- **入力**: なし
- **期待結果**: 音声ストリームが取得される
- **検証項目**:
  - getUserMedia が呼ばれる
  - localStream が設定される

### 2.2 接続管理テスト

#### Test Case: HOOK-003
- **テスト名**: ピア接続初期化
- **入力**: ユーザーID
- **期待結果**: 新しいピア接続が作成される
- **検証項目**:
  - peers Map に追加される
  - connectionStatus が更新される

#### Test Case: HOOK-004
- **テスト名**: リモートストリーム追加
- **入力**: track イベント
- **期待結果**: リモートストリームが追加される
- **検証項目**:
  - remoteStreams Map に追加される
  - ontrack イベントハンドラーが動作

### 2.3 状態更新テスト

#### Test Case: HOOK-005
- **テスト名**: 接続状態更新
- **入力**: connectionstatechange イベント
- **期待結果**: 接続状態が更新される
- **検証項目**:
  - connectionStatus が更新される
  - 状態変更が通知される

#### Test Case: HOOK-006
- **テスト名**: クリーンアップ処理
- **入力**: ユーザーID
- **期待結果**: リソースがクリーンアップされる
- **検証項目**:
  - RTCPeerConnection.close() が呼ばれる
  - peers Map から削除される
  - remoteStreams Map から削除される

## 3. 統合テスト

### 3.1 P2P接続確立テスト

#### Test Case: INT-001
- **テスト名**: 2ピア間接続確立
- **シナリオ**:
  1. ユーザーA がルームに参加
  2. ユーザーB がルームに参加
  3. Offer/Answer 交換
  4. ICE候補交換
  5. 接続確立
- **期待結果**: 両ピア間で音声通話が確立
- **検証項目**:
  - 両方の connectionState が 'connected'
  - 双方向で音声ストリームが受信される

#### Test Case: INT-002
- **テスト名**: 複数ピア接続管理
- **シナリオ**:
  1. ユーザーA がルームに参加
  2. ユーザーB がルームに参加して A と接続
  3. ユーザーC がルームに参加して A, B と接続
- **期待結果**: 全ピア間で接続が確立
- **検証項目**:
  - A は B, C と接続
  - B は A, C と接続
  - C は A, B と接続

### 3.2 Socket.IO連携テスト

#### Test Case: INT-003
- **テスト名**: シグナリングメッセージ送受信
- **シナリオ**:
  1. Offer 生成とSocket.IO送信
  2. Answer 生成と送信
  3. ICE候補送信
- **期待結果**: メッセージが正しく送受信される
- **検証項目**:
  - Socket.IOイベントが正しく発火
  - メッセージが相手に届く

## 4. エラーハンドリングテスト

### 4.1 メディアアクセスエラー

#### Test Case: ERR-001
- **テスト名**: マイク許可拒否
- **入力**: getUserMedia 拒否
- **期待結果**: エラーが適切に処理される
- **検証項目**:
  - エラーメッセージが表示される
  - アプリケーションがクラッシュしない

#### Test Case: ERR-002
- **テスト名**: メディアデバイス未接続
- **入力**: メディアデバイスなし
- **期待結果**: エラーハンドリングが動作
- **検証項目**:
  - 適切なエラーメッセージ
  - フォールバック処理

### 4.2 接続エラー

#### Test Case: ERR-003
- **テスト名**: ICE接続失敗
- **入力**: ICE gathering 失敗
- **期待結果**: 接続エラーが報告される
- **検証項目**:
  - connectionState が 'failed'
  - エラーが通知される

#### Test Case: ERR-004
- **テスト名**: 接続タイムアウト
- **入力**: 長時間の接続試行
- **期待結果**: タイムアウトエラー
- **検証項目**:
  - 適切なタイムアウト処理
  - リソースのクリーンアップ

### 4.3 ネットワークエラー

#### Test Case: ERR-005
- **テスト名**: Socket.IO切断
- **入力**: Socket.IO接続切断
- **期待結果**: WebRTC接続の適切な処理
- **検証項目**:
  - 既存接続の維持または切断
  - 再接続時の処理

## 5. パフォーマンステスト

### 5.1 リソース使用量テスト

#### Test Case: PERF-001
- **テスト名**: メモリリークチェック
- **シナリオ**: 接続確立 → 切断 → 再接続を繰り返し
- **期待結果**: メモリ使用量が増加しない
- **検証項目**:
  - イベントリスナーの適切な削除
  - オブジェクトの適切な解放

### 5.2 接続品質テスト

#### Test Case: PERF-002
- **テスト名**: 接続確立時間測定
- **シナリオ**: Offer生成から接続確立まで
- **期待結果**: 3秒以内で接続確立
- **検証項目**:
  - タイムスタンプの記録
  - 時間測定の精度

## 6. ブラウザ互換性テスト

### 6.1 主要ブラウザテスト

#### Test Case: COMPAT-001
- **テスト名**: Chrome互換性
- **対象**: Chrome 90+
- **期待結果**: 全機能が正常動作

#### Test Case: COMPAT-002
- **テスト名**: Firefox互換性
- **対象**: Firefox 88+
- **期待結果**: 全機能が正常動作

#### Test Case: COMPAT-003
- **テスト名**: Safari互換性
- **対象**: Safari 14+
- **期待結果**: 全機能が正常動作

## テスト実行計画

### Phase 1: 単体テスト (15分)
- PeerConnectionManager テスト
- useWebRTC フック テスト

### Phase 2: 統合テスト (10分)
- P2P接続テスト
- Socket.IO連携テスト

### Phase 3: エラーケーステスト (5分)
- 主要エラーケースのみ

## Mock設定

### WebRTC API Mock
```typescript
// RTCPeerConnection mock
global.RTCPeerConnection = jest.fn().mockImplementation(() => ({
  createOffer: jest.fn(),
  createAnswer: jest.fn(),
  setLocalDescription: jest.fn(),
  setRemoteDescription: jest.fn(),
  addIceCandidate: jest.fn(),
  close: jest.fn(),
  connectionState: 'new',
  onicecandidate: null,
  ontrack: null,
  onconnectionstatechange: null
}))

// getUserMedia mock
global.navigator.mediaDevices = {
  getUserMedia: jest.fn()
}
```

## 成功基準

1. **全単体テストが通る** (95%以上)
2. **統合テストが通る** (主要シナリオ)
3. **エラーハンドリングが動作** (基本ケース)
4. **メモリリークがない**
5. **接続確立時間が3秒以内**