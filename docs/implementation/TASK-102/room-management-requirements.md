# TASK-102: ルーム管理機能実装 - TDD要件定義

## 1. 機能の概要（EARS要件定義書・設計文書ベース）

- 🟢 **何をする機能か**: 単一通話ルームでの参加者の入退室管理、参加者リスト管理、セッション記録機能
- 🟢 **解決する問題**: リアルタイム通話における参加者状態の一元管理と同期
- 🟢 **想定ユーザー**: リモートワーカー、プレゼンター、通話参加者（最大10人）
- 🟢 **システム内の位置づけ**: Socket.IOサーバーにおけるRoomManagerクラス、Express + Socket.IOサーバーの中核機能
- **参照したEARS要件**: REQ-001 (単一通話ルーム提供), REQ-004 (参加者リスト表示), REQ-405 (画面共有管理)
- **参照した設計文書**: architecture.md のコンポーネント構成・RoomManagerクラス設計

## 2. 入力・出力の仕様（EARS機能要件・TypeScript型定義ベース）

### 入力パラメータ
- 🟢 **Socket.IOイベント**: 
  - `join-room`: 参加リクエスト（参加者ID自動生成）
  - `leave-room`: 退出リクエスト（参加者ID自動識別）
- 🟢 **内部メソッド**:
  ```typescript
  addParticipant(socketId: string): Promise<Participant>
  removeParticipant(participantId: string): Promise<void>
  getParticipants(): Map<string, Participant>
  isRoomFull(): boolean
  ```

### 出力値
- 🟢 **Socket.IOレスポンス**:
  ```typescript
  // join-room コールバック
  JoinRoomResponse {
    success: boolean;
    participant?: Participant;
    participants?: Participant[];
    error?: ErrorData;
  }
  ```
- 🟢 **Socket.IOイベント配信**:
  ```typescript
  // 全参加者への通知
  'room-joined': RoomJoinedData
  'user-joined': Participant
  'user-left': participantId: string
  ```

### データフロー
- 🟢 **参加フロー**: Socket.IO接続 → RoomManager.addParticipant() → DB記録 → 全参加者通知
- 🟢 **退出フロー**: 切断検知 → RoomManager.removeParticipant() → DB更新 → 全参加者通知

- **参照したEARS要件**: REQ-102 (参加者入室通知), REQ-103 (参加者退出通知)
- **参照した設計文書**: interfaces.ts の Participant・Room・JoinRoomResponse、api-endpoints.md の join-room仕様

## 3. 制約条件（EARS非機能要件・アーキテクチャ設計ベース）

### パフォーマンス要件
- 🟢 **参加処理時間**: 1秒以内に参加/退出処理完了 (NFR-003)
- 🟢 **同時接続制限**: 最大10人の同時参加サポート (NFR-004)

### セキュリティ要件
- 🟢 **参加者識別**: UUID v4による一意な参加者ID生成
- 🟢 **重複参加制御**: 同一Socket IDでの重複参加防止

### アーキテクチャ制約
- 🟢 **単一ルーム制約**: MVPでは"default-room"のみサポート (REQ-001)
- 🟢 **メモリ管理**: インメモリでの参加者状態管理（Map<string, Participant>）
- 🟢 **DB永続化**: PostgreSQLへのセッション記録必須

### データベース制約
- 🟢 **sessions テーブル**: 参加/退出の完全ログ記録
- 🟢 **event_logs テーブル**: join_room/leave_roomイベント記録
- 🟢 **トランザクション**: 参加者追加とDB記録のアトミック処理

- **参照したEARS要件**: REQ-001, NFR-003, NFR-004
- **参照した設計文書**: architecture.md のスケーラビリティ設計、database-schema.sql の sessions・event_logs テーブル

## 4. 想定される使用例（EARSEdgeケース・データフローベース）

### 基本的な使用パターン
- 🟢 **正常参加**: フロントエンドからjoin-roomイベント → 参加者追加 → 参加者リスト更新通知
- 🟢 **正常退出**: leave-roomイベントまたは切断 → 参加者削除 → 参加者リスト更新通知
- 🟢 **参加者リスト同期**: 新規参加時に既存参加者リストを提供

### エラーケース
- 🟢 **ルーム満員エラー**: 10人超過時に`ROOM_FULL`エラー返却 (EDGE-102)
- 🟡 **DB接続エラー**: セッション記録失敗時のロールバック処理
- 🟡 **重複参加試行**: 既存participantIdでの再参加防止

### エッジケース
- 🟢 **複数タブ参加**: 同一ユーザーの別タブからの参加を別参加者として扱う (EDGE-103)
- 🟡 **突然の切断**: Socket.IO切断イベントでの自動退出処理
- 🟡 **サーバー再起動**: インメモリ状態のリセットとDB状態との整合性確保

- **参照したEARS要件**: EDGE-102 (参加者上限エラー), EDGE-103 (複数タブ参加)
- **参照した設計文書**: architecture.md の通信フロー

## 5. EARS要件・設計文書との対応関係

### 参照したユーザストーリー
- **ストーリー1**: 音声通話への参加 (ワンクリック通話ルーム参加)

### 参照した機能要件
- **REQ-001**: システムは単一の通話ルームを提供しなければならない
- **REQ-004**: システムは現在の参加者リストを表示しなければならない
- **REQ-102**: 新しい参加者が入室した場合、システムは既存参加者に通知しなければならない
- **REQ-103**: 参加者が退出した場合、システムは他の参加者に通知しなければならない
- **REQ-405**: システムは同時に1人のみ画面共有可能でなければならない

### 参照した非機能要件
- **NFR-003**: 参加/退出の処理は1秒以内に完了する必要がある
- **NFR-004**: システムは最大10人の同時参加をサポートする必要がある

### 参照したEdgeケース
- **EDGE-102**: 参加者が上限（10人）に達した場合、「ルームが満員です」と表示
- **EDGE-103**: 同じユーザーが複数タブから参加した場合、別々の参加者として扱う

### 参照した設計文書
- **アーキテクチャ**: architecture.md のRoomManagerクラス設計・スケーラビリティ設計
- **型定義**: interfaces.ts の Participant・Room・Session・JoinRoomResponse
- **データベース**: database-schema.sql の sessions・event_logs・room_snapshots テーブル
- **API仕様**: api-endpoints.md の join-room・leave-room イベント仕様

## 品質判定

✅ **高品質**:
- 要件の曖昧さ: なし（EARS要件定義書と設計文書に基づく明確な仕様）
- 入出力定義: 完全（Socket.IOイベント、内部メソッド、レスポンス形式の詳細仕様あり）
- 制約条件: 明確（パフォーマンス、セキュリティ、アーキテクチャ、DB制約すべて定義済み）
- 実装可能性: 確実（既存の技術スタックとアーキテクチャ設計に準拠、依存タスクTASK-101完了前提）

## 次のステップ

次のおすすめステップ: `/tdd-testcases` でテストケースの洗い出しを行います。