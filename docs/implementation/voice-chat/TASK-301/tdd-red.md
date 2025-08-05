# TASK-301: WebRTC接続管理実装 - RED Phase (失敗するテスト)

## 概要

WebRTC接続管理機能の失敗するテストを実装する。TDDのREDフェーズに相当。

## 実装順序

1. PeerConnectionManager テスト実装
2. useWebRTC フック テスト実装
3. テスト実行して失敗を確認

## 1. テスト実装完了

### 実装したテストファイル

1. **PeerConnectionManager テスト**: `src/webrtc/__tests__/PeerConnectionManager.test.ts`
   - 初期化テスト
   - 接続管理テスト
   - Offer/Answer処理テスト
   - ICE候補処理テスト
   - エラーハンドリング
   - クリーンアップ処理

2. **useWebRTC フックテスト**: `src/hooks/__tests__/useWebRTC.test.tsx`
   - フック初期化テスト
   - 接続管理テスト
   - 状態更新テスト
   - WebRTC操作テスト
   - エラーハンドリング
   - Socket.IO統合テスト
   - パフォーマンステスト

## 2. テスト実行結果

### RED フェーズ確認 ✅

両方のテストファイルで **失敗** を確認：

```bash
# PeerConnectionManager テスト
Error: Failed to resolve import "../PeerConnectionManager"

# useWebRTC テスト  
Error: Failed to resolve import "../useWebRTC"
```

**理由**: 実装ファイルが存在しないため、インポートエラーが発生。これは期待される結果。

## 3. 次のステップ

REDフェーズが正常に完了。次はGREENフェーズに進み、テストが通る最小限の実装を作成する。