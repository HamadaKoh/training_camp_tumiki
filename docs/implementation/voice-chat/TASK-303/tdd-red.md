# TASK-303: 画面共有機能実装 - RED Phase (失敗するテスト)

## 概要

画面共有機能の失敗するテストを実装する。TDDのREDフェーズに相当。

## 実装完了

### 1. テスト実装完了

**実装したテストファイル**: `src/hooks/__tests__/useScreenShare.test.tsx`

#### テスト内容:
- **フック初期化テスト**: 基本的な初期状態確認、既存フック統合
- **画面共有開始テスト**: startScreenShare, stopScreenShare, replaceTrack機能
- **排他制御テスト**: 同時共有防止、共有者切断処理
- **ローディング状態管理**: 操作中の状態管理、同時操作防止
- **ストリーム管理**: getDisplayMedia, ストリーム取得・停止・自動停止検知
- **ReplaceTrack処理**: 映像トラック置換、複数接続対応、復元処理、エラー処理
- **Socket.IO統合**: イベント送受信、排他制御通信
- **エラーハンドリング**: 許可拒否、API未対応、WebRTC統合エラー、同時共有エラー
- **パフォーマンス**: 重複操作防止、メモリリーク防止

#### テストケース数: 31個

## 2. テスト実行結果

### RED フェーズ確認 ✅

テストファイルで **失敗** を確認：

```bash
Error: Failed to resolve import "../useScreenShare"
```

**理由**: useScreenShare フックが存在しないため、インポートエラーが発生。これは期待される結果。

## 3. テスト設計の特徴

### 3.1 Mock構成
- **DisplayMedia API**: navigator.mediaDevices.getDisplayMedia
- **WebRTC**: useWebRTC, PeerConnection, RTCSender
- **Socket.IO**: 通信イベントのモック
- **MediaStream**: 画面共有ストリーム、映像トラック

### 3.2 テストスコープ
- **単体テスト**: フック単体の動作
- **統合テスト**: WebRTC, Socket.IO, 既存フックとの連携  
- **エラーテスト**: 各種エラーケース処理
- **パフォーマンステスト**: 効率性、メモリ管理

### 3.3 重点テスト項目
1. **基本的な画面共有制御**
2. **getDisplayMedia API 使用**
3. **replaceTrack による動的ストリーム切り替え**
4. **排他制御（1人のみ共有）**
5. **Socket.IO を通じた状態同期**

## 4. 実装方針確認

REDフェーズで確認された実装要件：

### 4.1 必須インターフェース
```typescript
interface UseScreenShareReturn {
  isSharing: boolean
  isLoading: boolean
  sharingUserId: string | null
  screenStream: MediaStream | null
  sharedScreenStream: MediaStream | null
  startScreenShare: () => Promise<void>
  stopScreenShare: () => Promise<void>
}
```

### 4.2 依存関係
- useWebRTC (TASK-301)
- useAudioControls (TASK-302) 
- useSocketConnection (既存)
- navigator.mediaDevices.getDisplayMedia (ブラウザAPI)

### 4.3 主要機能
- **getDisplayMedia**: 画面キャプチャ取得
- **replaceTrack**: 動的ストリーム切り替え
- **排他制御**: Socket.IOでの同時共有防止
- **ストリーム管理**: 開始・停止・自動検知

### 4.4 Socket.IOイベント
- **送信**: `screen-share-started`, `screen-share-stopped`
- **受信**: `participant-screen-share-started`, `participant-screen-share-stopped`, `screen-share-request-denied`

## 5. 技術的課題

### 5.1 DisplayMedia API
- ブラウザ対応状況の確認
- 適切な制約設定
- ユーザー拒否時の処理

### 5.2 ReplaceTrack処理
- 複数PeerConnectionでの同期処理
- 失敗時の部分復旧
- 元ストリームへの復元

### 5.3 排他制御
- Socket.IOでの同時制御
- 競合状態の回避
- 切断時の自動解除

## 6. 次のステップ

REDフェーズが正常に完了。次はGREENフェーズに進み、テストが通る最小限の実装を作成する。

### 実装予定ファイル:
- `src/hooks/useScreenShare.ts`
- `src/hooks/index.ts` (エクスポート追加)

### 実装ポイント:
1. **最小限の実装**: テストが通る必要最小限の機能
2. **既存フック統合**: TASK-301, TASK-302 の活用
3. **DisplayMedia API**: getDisplayMedia の基本使用
4. **replaceTrack**: WebRTC統合での動的切り替え
5. **排他制御**: Socket.IO での基本制御

## 7. 実装優先順位

### 7.1 High Priority (必須)
- useScreenShare フック基本構造
- getDisplayMedia API 使用
- 基本的な開始・停止機能
- Socket.IO イベント統合

### 7.2 Medium Priority
- replaceTrack 統合
- 排他制御ロジック
- エラーハンドリング

### 7.3 Low Priority  
- 詳細なパフォーマンス最適化
- 高度なエラー処理
- UI統合準備