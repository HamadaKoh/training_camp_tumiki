# TASK-303: 画面共有機能実装 - テストケース定義

## 概要

画面共有機能のテストケースを定義する。getDisplayMedia API、replaceTrack処理、排他制御、ストリーム管理のテストを含む。

## テスト環境

- Testing Framework: Vitest
- DOM Testing: @testing-library/react
- WebRTC Mocking: Manual mocks
- DisplayMedia Mocking: navigator.mediaDevices.getDisplayMedia

## 1. useScreenShare フック 単体テスト

### 1.1 初期化テスト

#### Test Case: SCREEN-001
- **テスト名**: useScreenShare初期化
- **入力**: なし
- **期待結果**: 初期状態が正しく設定される
- **検証項目**:
  - isSharing が false
  - isLoading が false
  - sharingUserId が null
  - screenStream が null
  - sharedScreenStream が null

#### Test Case: SCREEN-002
- **テスト名**: WebRTC統合確認
- **前提条件**: useWebRTC, useAudioControls が利用可能
- **期待結果**: 既存フックとの連携が初期化される
- **検証項目**:
  - useWebRTC が呼び出される
  - peers が取得される

### 1.2 画面共有開始テスト

#### Test Case: SCREEN-003
- **テスト名**: 画面共有開始
- **操作**: startScreenShare() 実行
- **期待結果**: 画面共有が開始される
- **検証項目**:
  - getDisplayMedia が呼ばれる
  - isSharing が true になる
  - screenStream が設定される
  - Socket.IOイベントが送信される

#### Test Case: SCREEN-004
- **テスト名**: replaceTrack実行
- **前提条件**: 既存のPeerConnection存在
- **操作**: startScreenShare() 実行
- **期待結果**: 全接続でreplaceTrackが実行される
- **検証項目**:
  - 各PeerConnectionでreplaceTrackが呼ばれる
  - 映像トラックが画面共有ストリームに置換される

#### Test Case: SCREEN-005
- **テスト名**: 画面共有停止
- **前提条件**: 画面共有中
- **操作**: stopScreenShare() 実行
- **期待結果**: 画面共有が停止される
- **検証項目**:
  - isSharing が false になる
  - screenStream が null になる
  - 元の映像ストリームに復元される
  - Socket.IOイベントが送信される

### 1.3 排他制御テスト

#### Test Case: SCREEN-006
- **テスト名**: 同時共有防止
- **前提条件**: 他参加者が画面共有中
- **操作**: startScreenShare() 実行
- **期待結果**: 画面共有が拒否される
- **検証項目**:
  - エラーが発生する
  - isSharing が false のまま
  - 適切なエラーメッセージが表示される

#### Test Case: SCREEN-007
- **テスト名**: 共有者の切断処理
- **前提条件**: 他参加者が画面共有中
- **操作**: 共有者の切断イベント受信
- **期待結果**: 共有状態がリセットされる
- **検証項目**:
  - sharingUserId が null になる
  - sharedScreenStream が null になる
  - 新しい共有が可能になる

### 1.4 ローディング状態テスト

#### Test Case: SCREEN-008
- **テスト名**: 画面共有開始中のローディング
- **操作**: startScreenShare() 実行中
- **期待結果**: ローディング状態が管理される
- **検証項目**:
  - isLoading が true になる
  - 操作完了後に false になる

#### Test Case: SCREEN-009
- **テスト名**: 同時操作の防止
- **操作**: ローディング中に再度 startScreenShare() 実行
- **期待結果**: 2回目の操作が無視される
- **検証項目**:
  - 重複操作が実行されない
  - エラーが発生しない

## 2. ストリーム管理テスト

### 2.1 DisplayMedia API テスト

#### Test Case: STREAM-001
- **テスト名**: getDisplayMedia呼び出し
- **操作**: startScreenShare() 実行
- **期待結果**: getDisplayMediaが正しく呼ばれる
- **検証項目**:
  - navigator.mediaDevices.getDisplayMedia が呼ばれる
  - 適切な制約が渡される

#### Test Case: STREAM-002
- **テスト名**: 画面共有ストリーム取得
- **前提条件**: getDisplayMedia成功
- **期待結果**: ストリームが正しく管理される
- **検証項目**:
  - screenStream が設定される
  - ストリームにvideoトラックが含まれる

#### Test Case: STREAM-003
- **テスト名**: ストリーム停止処理
- **操作**: stopScreenShare() 実行
- **期待結果**: ストリームが適切に停止される
- **検証項目**:
  - ストリームのトラックが停止される
  - screenStream が null になる

#### Test Case: STREAM-004
- **テスト名**: ストリーム自動停止検知
- **操作**: ユーザーがブラウザUIで共有停止
- **期待結果**: 自動的に停止状態になる
- **検証項目**:
  - onended イベントが検知される
  - isSharing が false になる

### 2.2 ReplaceTrack処理テスト

#### Test Case: REPLACE-001
- **テスト名**: 映像トラック置換
- **前提条件**: 既存のPeerConnection + 映像トラック
- **操作**: 画面共有開始
- **期待結果**: トラックが置換される
- **検証項目**:
  - sender.replaceTrack が呼ばれる
  - 新しいトラックが画面共有ストリーム

#### Test Case: REPLACE-002
- **テスト名**: 複数接続でのトラック置換
- **前提条件**: 複数のPeerConnection存在
- **操作**: 画面共有開始
- **期待結果**: 全接続でトラックが置換される
- **検証項目**:
  - 各接続でreplaceTrackが実行される
  - 失敗した接続があっても他は継続される

#### Test Case: REPLACE-003
- **テスト名**: トラック復元処理
- **操作**: 画面共有停止
- **期待結果**: 元の映像トラックに復元される
- **検証項目**:
  - 元のlocalStreamのトラックに戻る
  - 復元が全接続で実行される

#### Test Case: REPLACE-004
- **テスト名**: replaceTrack失敗処理
- **前提条件**: replaceTrackでエラー発生
- **期待結果**: エラーが適切に処理される
- **検証項目**:
  - エラーが捕捉される
  - 部分的な成功/失敗が管理される

## 3. Socket.IO統合テスト

### 3.1 送信イベントテスト

#### Test Case: SOCKET-001
- **テスト名**: 画面共有開始通知
- **操作**: startScreenShare() 実行
- **期待結果**: Socket.IOイベントが送信される
- **検証項目**:
  - 'screen-share-started' イベント送信
  - 正確なデータ形式
  - タイムスタンプ含有

#### Test Case: SOCKET-002
- **テスト名**: 画面共有停止通知
- **操作**: stopScreenShare() 実行
- **期待結果**: Socket.IOイベントが送信される
- **検証項目**:
  - 'screen-share-stopped' イベント送信
  - 正確なユーザーID

### 3.2 受信イベントテスト

#### Test Case: SOCKET-003
- **テスト名**: 他参加者の画面共有開始受信
- **操作**: 'participant-screen-share-started' イベント受信
- **期待結果**: 共有状態が更新される
- **検証項目**:
  - sharingUserId が更新される
  - UI状態が反映される

#### Test Case: SOCKET-004
- **テスト名**: 他参加者の画面共有停止受信
- **操作**: 'participant-screen-share-stopped' イベント受信
- **期待結果**: 共有状態がリセットされる
- **検証項目**:
  - sharingUserId が null になる
  - sharedScreenStream が null になる

#### Test Case: SOCKET-005
- **テスト名**: 画面共有リクエスト拒否受信
- **操作**: 'screen-share-request-denied' イベント受信
- **期待結果**: 拒否が適切に処理される
- **検証項目**:
  - エラーメッセージが表示される
  - 現在の共有者情報が表示される

## 4. エラーハンドリングテスト

### 4.1 DisplayMedia エラー

#### Test Case: ERROR-001
- **テスト名**: 画面共有許可拒否
- **前提条件**: getDisplayMediaでユーザー拒否
- **操作**: startScreenShare() 実行
- **期待結果**: エラーが適切に処理される
- **検証項目**:
  - エラーメッセージが表示される
  - isSharing が false のまま
  - 状態が一貫性を保つ

#### Test Case: ERROR-002
- **テスト名**: getDisplayMedia API未対応
- **前提条件**: getDisplayMedia が undefined
- **操作**: startScreenShare() 実行
- **期待結果**: 非対応エラーが処理される
- **検証項目**:
  - 適切なエラーメッセージ
  - フォールバック処理

### 4.2 WebRTC統合エラー

#### Test Case: ERROR-003
- **テスト名**: PeerConnection未初期化エラー
- **前提条件**: WebRTC未初期化
- **操作**: startScreenShare() 実行
- **期待結果**: エラーが適切に処理される
- **検証項目**:
  - エラー処理が実行される
  - 初期化の促しが表示される

#### Test Case: ERROR-004
- **テスト名**: replaceTrack失敗
- **前提条件**: replaceTrackでエラー
- **操作**: 画面共有開始
- **期待結果**: 失敗が適切に処理される
- **検証項目**:
  - エラーログが出力される
  - 部分的な成功が維持される

### 4.3 排他制御エラー

#### Test Case: ERROR-005
- **テスト名**: 同時共有試行エラー
- **前提条件**: 他参加者が共有中
- **操作**: startScreenShare() 実行
- **期待結果**: 排他制御エラーが処理される
- **検証項目**:
  - 適切なエラーメッセージ
  - 現在の共有者情報表示

#### Test Case: ERROR-006
- **テスト名**: ネットワーク切断時の処理
- **前提条件**: Socket.IO切断状態
- **操作**: startScreenShare() 実行
- **期待結果**: ローカル状態は更新され、再接続時に同期
- **検証項目**:
  - ローカル状態変更
  - 再接続時の状態同期

## 5. パフォーマンステスト

### 5.1 共有開始速度テスト

#### Test Case: PERF-001
- **テスト名**: 画面共有開始時間
- **操作**: startScreenShare() 実行
- **期待結果**: 3秒以内で完了
- **検証項目**:
  - 実行時間測定
  - UI更新タイミング

#### Test Case: PERF-002
- **テスト名**: replaceTrack実行時間
- **操作**: 複数接続でのトラック置換
- **期待結果**: 2秒以内で完了
- **検証項目**:
  - 置換処理時間測定
  - 並列処理の効率

### 5.2 リソース効率テスト

#### Test Case: PERF-003
- **テスト名**: メモリリークチェック
- **操作**: 画面共有開始/停止を100回繰り返し
- **期待結果**: メモリ使用量が増加しない
- **検証項目**:
  - メモリ使用量監視
  - ストリームの適切な解放

#### Test Case: PERF-004
- **テスト名**: 不要な処理防止
- **操作**: 同じ状態への変更を複数回実行
- **期待結果**: 重複処理が発生しない
- **検証項目**:
  - getDisplayMedia呼び出し回数
  - replaceTrack実行回数

## 6. UI統合テスト

### 6.1 画面共有ボタンテスト

#### Test Case: UI-001
- **テスト名**: 画面共有ボタン表示
- **前提条件**: コンポーネント描画
- **期待結果**: 画面共有ボタンが表示される
- **検証項目**:
  - ボタン要素の存在
  - 適切なアイコン表示

#### Test Case: UI-002
- **テスト名**: 画面共有ボタンクリック
- **操作**: 画面共有ボタンクリック
- **期待結果**: 画面共有が開始される
- **検証項目**:
  - startScreenShare が呼ばれる
  - UI状態が更新される

#### Test Case: UI-003
- **テスト名**: 視覚的フィードバック
- **操作**: 画面共有状態変更
- **期待結果**: ボタンの見た目が変わる
- **検証項目**:
  - アイコンの変更
  - 色やスタイルの変更

### 6.2 共有画面表示テスト

#### Test Case: UI-004
- **テスト名**: 共有画面の表示
- **前提条件**: 他参加者が画面共有中
- **期待結果**: 共有画面が表示される
- **検証項目**:
  - video要素の表示
  - 適切なストリーム設定

#### Test Case: UI-005
- **テスト名**: アスペクト比の維持
- **操作**: 異なる解像度の画面共有
- **期待結果**: アスペクト比が維持される
- **検証項目**:
  - CSS aspect-ratio適用
  - 表示サイズの調整

## 7. ブラウザ互換性テスト

### 7.1 API対応テスト

#### Test Case: COMPAT-001
- **テスト名**: Chrome対応
- **対象**: Chrome 72+
- **期待結果**: 全機能が正常動作

#### Test Case: COMPAT-002
- **テスト名**: Firefox対応
- **対象**: Firefox 66+
- **期待結果**: 全機能が正常動作

#### Test Case: COMPAT-003
- **テスト名**: Safari対応
- **対象**: Safari 13+
- **期待結果**: 基本機能が動作

#### Test Case: COMPAT-004
- **テスト名**: 非対応ブラウザ
- **対象**: 古いブラウザ
- **期待結果**: 適切なエラー表示

## テスト実行計画

### Phase 1: 単体テスト (15分)
- useScreenShare フック テスト
- ストリーム管理テスト

### Phase 2: 統合テスト (10分)
- WebRTC統合テスト
- Socket.IO統合テスト

### Phase 3: エラー・UIテスト (5分)
- 主要エラーケースのみ
- 基本UI統合

## Mock設定

### DisplayMedia Mock
```typescript
const mockScreenStream = {
  getVideoTracks: vi.fn(() => [mockVideoTrack]),
  getTracks: vi.fn(() => [mockVideoTrack]),
  addTrack: vi.fn(),
  removeTrack: vi.fn()
}

global.navigator.mediaDevices = {
  getDisplayMedia: vi.fn(() => Promise.resolve(mockScreenStream))
}
```

### RTC Sender Mock
```typescript
const mockSender = {
  replaceTrack: vi.fn(() => Promise.resolve()),
  track: mockVideoTrack
}

const mockPeerConnection = {
  getSenders: vi.fn(() => [mockSender])
}
```

## 成功基準

1. **全単体テストが通る** (90%以上)
2. **統合テストが通る** (主要シナリオ)
3. **エラーハンドリングが動作** (基本ケース)
4. **パフォーマンス要件を満たす** (開始時間、処理時間)
5. **ブラウザ互換性基準クリア** (主要ブラウザ)