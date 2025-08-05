# TASK-104: 画面共有制御機能実装 - TDD要件定義

## 1. 機能の概要（EARS要件定義書・設計文書ベース）

- 🟢 **何をする機能か**: 単一通話ルームでの画面共有の排他制御と状態管理機能
- 🟢 **解決する問題**: 複数参加者による同時画面共有を防ぎ、視覚的情報共有の秩序維持
- 🟢 **想定ユーザー**: プレゼンター（画面共有実行者）、通話参加者（共有画面視聴者）
- 🟢 **システム内の位置づけ**: Socket.IOサーバーにおけるScreenShareManagerクラス、RoomManagerと連携した状態管理
- **参照したEARS要件**: REQ-005 (画面共有開始/停止ボタン), REQ-104 (画面共有配信), REQ-405 (1人のみ画面共有可能)
- **参照した設計文書**: architecture.md のScreenShareManagerモジュール・画面共有フロー

## 2. 入力・出力の仕様（EARS機能要件・TypeScript型定義ベース）

### 入力パラメータ
- 🟢 **Socket.IOイベント（画面共有制御）**:
  ```typescript
  'request-screen-share': callback: (response: ScreenShareResponse) => void
  'stop-screen-share': void (参加者ID自動識別)
  ```
- 🟢 **内部メソッド**:
  ```typescript
  requestScreenShare(participantId: string): Promise<ScreenShareResponse>
  stopScreenShare(participantId: string): Promise<void>
  isScreenSharingActive(): boolean
  getCurrentScreenSharingParticipant(): string | null
  ```

### 出力値
- 🟢 **Socket.IOレスポンス**:
  ```typescript
  // request-screen-share コールバック
  ScreenShareResponse {
    success: boolean;
    granted: boolean;
    error?: ErrorData;
  }
  ```
- 🟢 **Socket.IOイベント配信**:
  ```typescript
  // 全参加者への通知
  'screen-share-started': participantId: string
  'screen-share-stopped': participantId: string
  ```

### データフロー
- 🟢 **開始フロー**: リクエスト → 排他チェック → 許可/拒否 → 状態更新 → 全参加者通知
- 🟢 **停止フロー**: 停止リクエスト → 権限確認 → 状態クリア → 全参加者通知
- 🟢 **切断時フロー**: 共有者切断検知 → 自動停止処理 → 状態クリア → 全参加者通知

- **参照したEARS要件**: REQ-105 (同時共有エラー処理)
- **参照した設計文書**: interfaces.ts の ScreenShareResponse・ErrorData、api-endpoints.md の request-screen-share/stop-screen-share仕様

## 3. 制約条件（EARS非機能要件・アーキテクチャ設計ベース）

### パフォーマンス要件
- 🟢 **画面共有遅延**: 500ms以内でのストリーム配信開始 (NFR-002)
- 🟡 **状態同期時間**: 画面共有開始/停止の全参加者への即座通知（1秒以内推測）

### セキュリティ要件
- 🟡 **共有権限確認**: 画面共有停止は共有者本人のみ実行可能
- 🟡 **状態整合性**: 共有者切断時の自動状態クリア

### アーキテクチャ制約
- 🟢 **排他制御**: 同時に1人のみ画面共有可能 (REQ-405)
- 🟢 **状態管理**: Room内のscreenSharingParticipantIdによる状態管理
- 🟡 **アトミック操作**: 画面共有開始/停止の状態変更とDB記録の一貫性

### データベース制約
- 🟢 **event_logs テーブル**: screen_share_start/screen_share_stopイベント記録
- 🟢 **room_snapshots テーブル**: screen_sharing_active状態の定期記録

### エラーハンドリング制約
- 🟢 **同時リクエスト処理**: SCREEN_SHARE_IN_USEエラー返却 (REQ-105)
- 🟡 **権限エラー**: 共有中でない参加者による停止試行の拒否

- **参照したEARS要件**: REQ-405, REQ-105, NFR-002
- **参照した設計文書**: architecture.md の画面共有フロー、database-schema.sql の event_logs・room_snapshots テーブル

## 4. 想定される使用例（EARSEdgeケース・データフローベース）

### 基本的な使用パターン
- 🟢 **正常な画面共有開始**: 未使用状態での画面共有リクエスト → 許可 → 全参加者通知
- 🟢 **正常な画面共有停止**: 共有者による停止リクエスト → 状態クリア → 全参加者通知
- 🟢 **状態同期**: 新規参加者への現在の画面共有状態通知

### エラーケース
- 🟢 **同時共有競合**: 既に共有中の状態での新規リクエスト → SCREEN_SHARE_IN_USEエラー (EDGE-101)
- 🟡 **権限なし停止**: 共有者以外による停止試行 → 権限エラー
- 🟡 **共有者切断**: 画面共有中の参加者突然切断 → 自動停止処理

### エッジケース
- 🟢 **2人同時リクエスト**: 同時画面共有開始時の先着順制御 (EDGE-101)
- 🟡 **ネットワーク分断**: 共有者のネットワーク一時切断時の状態維持/復旧
- 🟡 **サーバー再起動**: インメモリ画面共有状態の復旧処理

- **参照したEARS要件**: EDGE-101 (同時画面共有開始時の先着順)
- **参照した設計文書**: architecture.md の画面共有フロー

## 5. EARS要件・設計文書との対応関係

### 参照したユーザストーリー
- **ストーリー2**: 画面共有による情報共有 (自分の画面を他の参加者に共有)

### 参照した機能要件
- **REQ-005**: システムは画面共有開始/停止ボタンを提供しなければならない
- **REQ-104**: ユーザーが画面共有を開始した場合、システムは他の全参加者に画面を配信しなければならない
- **REQ-105**: 既に画面共有中に他のユーザーが共有を試みた場合、システムはエラーメッセージを表示しなければならない
- **REQ-405**: システムは同時に1人のみ画面共有可能でなければならない

### 参照した非機能要件
- **NFR-002**: 画面共有の遅延は500ms以内である必要がある

### 参照したEdgeケース
- **EDGE-101**: 2人が同時に画面共有を開始した場合、先に開始した方を優先

### 参照した受け入れ基準
- **画面共有機能**: 画面共有を開始できる、他の参加者に画面が表示される、画面共有を停止できる、同時に1人のみ画面共有できることを確認

### 参照した設計文書
- **アーキテクチャ**: architecture.md のScreenShareManagerモジュール・画面共有フロー
- **型定義**: interfaces.ts の ScreenShareResponse・Room・ErrorCode（SCREEN_SHARE_IN_USE）
- **データベース**: database-schema.sql の event_logs・room_snapshots テーブル
- **API仕様**: api-endpoints.md の request-screen-share・stop-screen-share イベント仕様

## 品質判定

✅ **高品質**:
- 要件の曖昧さ: なし（EARS要件定義書と設計文書に基づく明確な排他制御仕様）
- 入出力定義: 完全（Socket.IOイベント、内部メソッド、レスポンス形式、データフローの詳細仕様あり）
- 制約条件: 明確（パフォーマンス、セキュリティ、アーキテクチャ、DB制約すべて定義済み）
- 実装可能性: 確実（画面共有排他制御の明確な仕様、依存タスクTASK-103完了前提）

## 次のステップ

次のおすすめステップ: `/tdd-testcases` でテストケースの洗い出しを行います。