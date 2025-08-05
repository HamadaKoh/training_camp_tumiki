# TASK-302: 音声制御機能実装 - RED Phase (失敗するテスト)

## 概要

音声制御機能の失敗するテストを実装する。TDDのREDフェーズに相当。

## 実装完了

### 1. テスト実装完了

**実装したテストファイル**: `src/hooks/__tests__/useAudioControls.test.tsx`

#### テスト内容:
- **フック初期化テスト**: 基本的な初期状態確認
- **ミュート制御テスト**: toggleMute, setMuted 機能
- **ローディング状態管理**: 操作中の状態管理
- **参加者状態管理**: 他参加者のミュート状態追跡
- **音声トラック制御**: MediaStreamTrack の制御  
- **音声品質制御**: setAudioQuality 機能
- **Socket.IO統合**: イベント送受信
- **エラーハンドリング**: 各種エラーケース
- **パフォーマンス**: 効率性テスト
- **ローカルストレージ**: 状態永続化

#### テストケース数: 28個

## 2. テスト実行結果

### RED フェーズ確認 ✅

テストファイルで **失敗** を確認：

```bash
Error: Failed to resolve import "../useAudioControls"
```

**理由**: useAudioControls フックが存在しないため、インポートエラーが発生。これは期待される結果。

## 3. テスト設計の特徴

### 3.1 Mock構成
- **Socket.IO**: 通信イベントのモック
- **WebRTC**: useWebRTC フックのモック  
- **MediaStream**: 音声トラックのモック
- **LocalStorage**: 状態永続化のモック

### 3.2 テストスコープ
- **単体テスト**: フック単体の動作
- **統合テスト**: 他システムとの連携
- **エラーテスト**: エラーケース処理
- **パフォーマンステスト**: 効率性確認

### 3.3 重点テスト項目
1. **基本的なミュート制御**
2. **WebRTC統合**
3. **Socket.IO イベント処理**
4. **エラーハンドリング**
5. **状態管理の一貫性**

## 4. 実装方針確認

REDフェーズで確認された実装要件：

### 4.1 必須インターフェース
```typescript
interface UseAudioControlsReturn {
  isMuted: boolean
  isLoading: boolean
  participantMuteStates: Record<string, boolean>
  toggleMute: () => Promise<void>
  setMuted: (muted: boolean) => Promise<void>
  setAudioQuality: (quality: 'low' | 'medium' | 'high') => Promise<void>
}
```

### 4.2 依存関係
- useWebRTC (TASK-301)
- useSocketConnection (既存)
- localStorage (ブラウザAPI)

### 4.3 Socket.IOイベント
- **送信**: `audio-mute-changed`, `audio-quality-changed`
- **受信**: `participant-mute-changed`, `participants-updated`

## 5. 次のステップ

REDフェーズが正常に完了。次はGREENフェーズに進み、テストが通る最小限の実装を作成する。

### 実装予定ファイル:
- `src/hooks/useAudioControls.ts`
- `src/hooks/index.ts` (エクスポート追加)

### 実装ポイント:
1. **最小限の実装**: テストが通る必要最小限の機能
2. **WebRTC統合**: TASK-301の useWebRTC 活用
3. **状態管理**: React hooks での状態管理
4. **エラーハンドリング**: 基本的なエラー処理