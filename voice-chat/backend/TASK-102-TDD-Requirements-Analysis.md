# TASK-102: ルーム管理機能実装 - TDD要件分析書

## 概要

本文書は、ボイスチャットアプリケーションにおけるルーム管理機能のTDD開発のための詳細な要件分析です。TASK-101（Express + Socket.IOサーバー基本設定）の完了を前提とし、ルーム参加者の入退室管理、参加者リスト同期、セッション記録をデータベースに永続化する機能を実装します。

## 1. 機能概要

### 1.1 機能の目的
- **単一通話ルーム**での参加者管理機能を提供
- **リアルタイムな参加者状態同期**を実現
- **セッション情報のデータベース記録**による監査証跡確保
- **10人までの同時参加制限**によるシステム負荷制御

### 1.2 システム内の位置づけ
- **Express + Socket.IOサーバー**（TASK-101）の中核機能として実装
- **RoomManagerクラス**による参加者状態の一元管理
- **PostgreSQLデータベース**への完全なセッション記録
- **フロントエンド接続**への準備（TASK-201以降との連携）

### 1.3 対象ユーザー
- **リモートワーカー**: 日常的な音声会議参加者
- **プレゼンター**: 画面共有を行う発表者
- **通話参加者**: 最大10人までの同時参加者

## 2. 機能要件

### 2.1 参加者管理
- **参加者の入室処理**
  - Socket.IO接続時の自動参加者ID生成（UUID v4）
  - 参加者情報のインメモリ管理（Map<string, Participant>）
  - PostgreSQLへのセッション記録（sessions テーブル）
  - 既存参加者への入室通知配信

- **参加者の退室処理**
  - 明示的な退室要求の処理
  - Socket.IO切断時の自動退室処理
  - セッション終了記録（left_at タイムスタンプ）
  - 残存参加者への退室通知配信

- **参加者リスト管理**
  - リアルタイムな参加者状態同期
  - 新規参加者への既存参加者情報提供
  - 参加者数の動的な追跡

### 2.2 Socket.IOイベント処理
- **join-room イベント**: 参加リクエストの処理
- **leave-room イベント**: 退室リクエストの処理
- **disconnect イベント**: 突然の切断処理
- **user-joined 配信**: 新規参加者通知
- **user-left 配信**: 退室者通知

### 2.3 データベース連携
- **sessions テーブル**: 完全なセッション記録
- **event_logs テーブル**: join_room/leave_room イベント記録
- **トランザクション制御**: 参加者追加とDB記録のアトミック処理

## 3. 入力・出力仕様

### 3.1 入力パラメータ
```typescript
// Socket.IOイベント
interface JoinRoomEvent {
  // パラメータなし（Socket IDから自動識別）
}

interface LeaveRoomEvent {
  // パラメータなし（Socket IDから自動識別）
}

// 内部メソッド
interface RoomManagerMethods {
  addParticipant(socketId: string): Promise<Participant>;
  removeParticipant(participantId: string): Promise<void>;
  getParticipants(): Map<string, Participant>;
  isRoomFull(): boolean;
  getParticipantBySocketId(socketId: string): Participant | undefined;
}
```

### 3.2 出力仕様
```typescript
// join-room レスポンス
interface JoinRoomResponse {
  success: boolean;
  participant?: Participant;
  participants?: Participant[];
  error?: ErrorData;
}

// Socket.IO配信イベント
interface RoomEvents {
  'room-joined': RoomJoinedData;
  'user-joined': Participant;
  'user-left': participantId: string;
}

// データベース記録
interface SessionRecord {
  id: UUID;
  participant_id: string;
  socket_id: string;
  room_id: string;
  joined_at: TIMESTAMP;
  left_at?: TIMESTAMP;
  user_agent?: string;
  ip_address?: INET;
}
```

### 3.3 Participantエンティティ
```typescript
interface Participant {
  id: string;              // UUID v4
  socketId: string;        // Socket.IO接続ID
  joinedAt: Date;          // 参加日時
  isMuted: boolean;        // ミュート状態（初期値: false）
  isSharingScreen: boolean; // 画面共有状態（初期値: false）
  connectionQuality: ConnectionQuality; // 接続品質（初期値: 'good'）
}
```

## 4. 制約条件と非機能要件

### 4.1 パフォーマンス要件
- **参加・退出処理時間**: 1秒以内の応答完了（NFR-003）
- **同時接続数**: 最大10人の同時参加サポート（NFR-004）
- **メモリ使用量**: インメモリ状態管理の効率化

### 4.2 セキュリティ要件
- **参加者識別**: UUID v4による一意性保証
- **重複参加制御**: 同一Socket IDでの重複参加防止
- **データ検証**: 入力値のバリデーション

### 4.3 アーキテクチャ制約
- **単一ルーム制約**: MVPでは"default-room"のみサポート（REQ-001）
- **メモリ管理**: Map<string, Participant>による高速アクセス
- **DB永続化**: PostgreSQLへの完全セッション記録
- **技術スタック**: TypeScript + Express + Socket.IO + PostgreSQL

### 4.4 データベース制約
- **ACID特性**: トランザクションによるデータ整合性保証
- **参照整合性**: sessions と event_logs テーブル間の整合性
- **インデックス最適化**: 検索パフォーマンスの確保

## 5. 使用シナリオ

### 5.1 正常なシナリオ

**シナリオ1: 基本的な参加・退出フロー**
1. ユーザーAがWebページを開く
2. Socket.IO接続が確立される
3. join-roomイベントが送信される
4. RoomManager.addParticipant()が実行される
5. PostgreSQLにセッション記録される
6. 参加成功レスポンスが返される
7. 他の参加者にuser-joinedイベント配信
8. ユーザーAがページを閉じる
9. Socket.IO切断が検知される
10. RoomManager.removeParticipant()が実行される
11. PostgreSQLのleft_atが更新される
12. 他の参加者にuser-leftイベント配信

**シナリオ2: 複数参加者での状態同期**
1. ユーザーA、Bが既に参加中
2. ユーザーCが新規参加
3. ユーザーCは既存参加者（A、B）の情報を受信
4. A、BはユーザーCの参加通知を受信
5. 全参加者の状態が同期される

### 5.2 エラーシナリオ

**シナリオ3: ルーム満員時の参加拒否**
1. 10人のユーザーが既に参加中
2. 11人目のユーザーが参加を試行
3. isRoomFull()がtrueを返す
4. ROOM_FULLエラーレスポンスが返される
5. 既存参加者への影響なし

**シナリオ4: データベース障害時の処理**
1. ユーザーが参加を試行
2. PostgreSQL接続が失敗
3. トランザクションがロールバック
4. インメモリ状態変更なし
5. 適切なエラーレスポンス返却

**シナリオ5: 突然の切断処理**
1. ユーザーのネットワークが切断
2. Socket.IO disconnect イベント発生
3. 自動的に removeParticipant() 実行
4. DB記録の left_at 更新
5. 他参加者への通知配信

## 6. エッジケースと境界値

### 6.1 境界値テストケース
- **参加者数 0→1**: 空ルームへの初回参加
- **参加者数 9→10**: 上限直前での参加
- **参加者数 10→9**: 満室状態からの退出
- **参加者数 1→0**: 最後の参加者の退出

### 6.2 エッジケース
- **複数タブ参加**: 同一ユーザーの別タブからの参加（別参加者として扱う）
- **重複参加試行**: 既存Socket IDでの再参加防止
- **サーバー再起動**: インメモリ状態リセット
- **長時間セッション**: 接続維持の確認

### 6.3 異常入力への対応
- **null/undefined値**: 適切なバリデーションエラー
- **不正なSocket ID**: エラーハンドリング
- **無効な参加者ID**: 存在チェックとエラー応答

## 7. 品質要件

### 7.1 テスタビリティ
- **単体テスト**: RoomManagerクラスの各メソッド
- **統合テスト**: Socket.IOイベント処理とDB連携
- **E2Eテスト**: フルシナリオでの動作確認

### 7.2 保守性
- **モジュール分離**: 関心事の明確な分離
- **設定外部化**: 環境依存値の分離
- **エラーハンドリング**: 一貫したエラー処理

### 7.3 拡張性
- **複数ルーム対応準備**: 将来的な機能拡張への配慮
- **プラグイン機能**: 追加機能の組み込み容易性

## 8. 実装アプローチ

### 8.1 TDD開発フェーズ
1. **Red Phase**: 失敗するテストケースの作成
2. **Green Phase**: 最小限の実装でテスト通過
3. **Refactor Phase**: コード品質の向上

### 8.2 開発順序
1. **RoomManagerクラス基盤**: 基本的な参加者管理
2. **Socket.IOイベント処理**: 各イベントハンドラー実装
3. **データベース連携**: セッション記録機能
4. **エラーハンドリング**: 異常系処理の実装
5. **パフォーマンス最適化**: 要件達成の確認

### 8.3 依存関係
- **前提条件**: TASK-101（Express + Socket.IOサーバー）完了
- **技術依存**: PostgreSQL接続、Socket.IO Client（テスト用）
- **次工程**: TASK-103（シグナリングハンドラー実装）

## 9. 成功条件

### 9.1 機能的成功条件
- [ ] 参加者の入退室が正しく管理される
- [ ] セッション情報がDBに正確に記録される
- [ ] 10人の同時参加制限が機能する
- [ ] 参加者リストが正確に同期される
- [ ] エラーケースが適切に処理される

### 9.2 非機能的成功条件
- [ ] 応答時間が1秒以内
- [ ] メモリリークが発生しない
- [ ] データベース整合性が保たれる
- [ ] 全テストケースが通過する

### 9.3 品質成功条件
- [ ] コードカバレッジ90%以上
- [ ] ESLintエラー0件
- [ ] TypeScript型エラー0件
- [ ] 文書化が完了している

## 10. リスクと対策

### 10.1 技術リスク
- **Socket.IO接続の不安定性**: 再接続機能の実装
- **データベース接続失敗**: エラーハンドリングとロールバック
- **メモリリーク**: 適切な状態クリーンアップ

### 10.2 パフォーマンスリスク
- **大量同時接続**: 接続数制限の確実な実装
- **データベース負荷**: 効率的なクエリ設計
- **メモリ使用量**: Map構造の効率的な利用

### 10.3 運用リスク
- **データ不整合**: トランザクション制御の徹底
- **障害時の状態復旧**: ログ記録の充実
- **セキュリティ**: 入力値検証の強化

---

**作成日**: 2025-08-05  
**対象タスク**: TASK-102: ルーム管理機能実装  
**開発手法**: TDD (Test-Driven Development)  
**技術スタック**: TypeScript + Express + Socket.IO + PostgreSQL + Jest

この要件分析書に基づき、次のステップでテストケース設計とRed Phase（失敗テスト作成）を実施します。