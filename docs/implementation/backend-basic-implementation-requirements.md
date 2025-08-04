# TDD要件定義・機能仕様 - TASK-101: バックエンド基本実装

**【機能名】**: backend-basic-implementation (TASK-101)

## 1. 機能の概要（EARS要件定義書・設計文書ベース）

- 🟢 **何をする機能か**: Express + TypeScriptベースの基本的なWebAPIサーバーを構築し、データベース接続とヘルスチェック機能を提供する
- 🟢 **どのような問題を解決するか**: GKE負荷テストシステムのバックエンド基盤を構築し、フロントエンドからのAPI要求に応答できる環境を整える
- 🟢 **想定されるユーザー**: 開発者・学習者（負荷テストを体験したいユーザー）
- 🟢 **システム内での位置づけ**: モノリシック + API分離アーキテクチャにおけるバックエンドAPIレイヤーの基盤部分
- **参照したEARS要件**: REQ-403（TypeScript実装）
- **参照した設計文書**: architecture.md のバックエンド構成セクション

## 2. 入力・出力の仕様（EARS機能要件・TypeScript型定義ベース）

### 入力パラメータ
- 🟢 **環境変数**:
  - `DATABASE_URL`: PostgreSQL接続文字列（interfaces.ts - BackendConfig.database）
  - `PORT`: サーバーポート番号（デフォルト: 3000）
  - `NODE_ENV`: 実行環境（development/production）

### 出力値
- 🟢 **ヘルスチェックレスポンス**（interfaces.ts - HealthCheckResponse）:
  ```typescript
  {
    status: 'healthy' | 'unhealthy';
    version: string;
    uptime: number; // seconds
    checks: {
      database: boolean;
      kubernetes: boolean; // 将来のGKE統合用
    };
  }
  ```

### 入出力の関係性
- 🟢 正常時: データベース接続成功 → status: 'healthy', checks.database: true
- 🟢 異常時: データベース接続失敗 → status: 'unhealthy', checks.database: false

- **参照したEARS要件**: REQ-403（TypeScript実装制約）
- **参照した設計文書**: interfaces.ts の HealthCheckResponse インターフェース

## 3. 制約条件（EARS非機能要件・アーキテクチャ設計ベース）

### パフォーマンス要件
- 🟢 **レスポンス時間**: ヘルスチェックは500ms以内で応答（NFR-002から派生）
- 🟢 **データベース接続**: コネクションプール最大10接続（architecture.md）

### セキュリティ要件
- 🟢 **CORS設定**: 基本的なCORS設定を実装（NFR-101）
- 🟢 **セキュリティヘッダー**: Helmet.jsによる基本的なセキュリティヘッダー設定

### 互換性要件
- 🟢 **Node.js版本**: Node.js 18+ 対応
- 🟢 **TypeScript**: TypeScript 5.x 対応（REQ-403）
- 🟢 **PostgreSQL**: PostgreSQL 14+ 対応（database-schema.sql）

### アーキテクチャ制約
- 🟢 **フレームワーク**: Express.js 使用（architecture.md バックエンド構成）
- 🟢 **データベース**: PostgreSQL、JSON型禁止（REQ-404）
- 🟡 **コンテナ**: Dockerコンテナでの動作を前提

- **参照したEARS要件**: REQ-403, REQ-404, NFR-101, NFR-102
- **参照した設計文書**: architecture.md のバックエンド構成、database-schema.sql

## 4. 想定される使用例（EARSEdgeケース・データフローベース）

### 基本的な使用パターン
- 🟢 **サーバー起動**: `npm start` でサーバーが正常起動する
- 🟢 **ヘルスチェック**: `GET /api/health` でサーバー状態を確認
- 🟢 **データベース接続**: PostgreSQL接続プールが正常に機能

### エラーケース
- 🟢 **データベース接続失敗**: 接続エラー時にヘルスチェックで適切なエラー状態を返す（EDGE-001から派生）
- 🟢 **不正なリクエスト**: 存在しないエンドポイントへのアクセス時に404を返す
- 🟡 **ポート競合**: 指定ポートが使用中の場合のエラーハンドリング

### データフロー
- 🟢 **基本フロー**: HTTP Request → Express Router → Database Pool → Response
- 🟢 **エラーフロー**: HTTP Request → Error Middleware → Error Response

- **参照したEARS要件**: EDGE-001（GKE API接続失敗）
- **参照した設計文書**: api-endpoints.md のエラーレスポンス仕様

## 5. EARS要件・設計文書との対応関係

### 参照したユーザストーリー
- **ストーリー1**: 基本的な負荷テスト体験（開発者として、HPAの動作を直感的に理解したい）

### 参照した機能要件
- **REQ-403**: バックエンドは TypeScriptまたはPython で実装 しなければならない

### 参照した非機能要件
- **NFR-001**: Pod数の更新は 5秒以内に画面に反映される必要がある（将来実装）
- **NFR-002**: ボタンクリックのレスポンスは 500ms以内である必要がある
- **NFR-101**: システムは 基本的なCORS設定を実装する必要がある
- **NFR-102**: システムは GKE APIへの直接アクセスを制限する必要がある（将来実装）

### 参照したEdgeケース
- **EDGE-001**: GKE APIへの接続が失敗した場合、エラーメッセージを表示する（将来のGKE統合時）
- **EDGE-002**: サーバーエラーが発生した場合、ユーザーに通知する

### 参照した受け入れ基準
- [ ] バックエンドがTypeScript/Pythonで実装されている
- [ ] データベースでJSON型が使用されていない
- [ ] 正規化されたDBスキーマが使用されている

### 参照した設計文書
- **アーキテクチャ**: architecture.md のバックエンド構成（Express + TypeScript）
- **型定義**: interfaces.ts の HealthCheckResponse, BackendConfig
- **データベース**: database-schema.sql の接続設定
- **API仕様**: api-endpoints.md の /health エンドポイント仕様

## 実装詳細

### 技術スタック
- **フレームワーク**: Express.js 4.x
- **言語**: TypeScript 5.x
- **データベースクライアント**: pg (node-postgres)
- **ミドルウェア**: helmet, cors, express.json
- **テストフレームワーク**: Jest + Supertest

### ディレクトリ構成
```
src/
├── index.ts          # アプリケーションエントリーポイント
├── app.ts            # Express アプリケーション設定
├── config/           # 設定ファイル
├── middleware/       # カスタムミドルウェア
├── routes/           # ルーティング
└── db/              # データベース関連
```

### 環境変数
```
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
PORT=3000
NODE_ENV=development
```

## TDD実装計画

### Phase 1: テスト環境セットアップ
1. Jest + Supertest 設定
2. TypeScript 設定
3. テスト用データベース設定

### Phase 2: 基本機能のTDD実装
1. **Red**: サーバー起動テスト（失敗）
2. **Green**: 最小限のExpressアプリ実装
3. **Refactor**: コード整理

### Phase 3: データベース接続のTDD実装
1. **Red**: データベース接続テスト（失敗）
2. **Green**: PostgreSQL接続プール実装
3. **Refactor**: 接続設定の抽象化

### Phase 4: ヘルスチェックのTDD実装
1. **Red**: ヘルスチェックエンドポイントテスト（失敗）
2. **Green**: /api/health エンドポイント実装
3. **Refactor**: レスポンス形式の統一

### Phase 5: エラーハンドリングのTDD実装
1. **Red**: エラーハンドリングテスト（失敗）
2. **Green**: エラーミドルウェア実装
3. **Refactor**: エラーレスポンスの統一

## 品質基準

✅ **高品質**:
- 要件の曖昧さ: なし（EARS要件定義書と設計文書に基づく明確な仕様）
- 入出力定義: 完全（TypeScript型定義により保証）
- 制約条件: 明確（技術スタック、パフォーマンス、セキュリティ要件が具体的）
- 実装可能性: 確実（既存の技術スタックで実装可能）

## 完了条件チェックリスト

- [ ] `GET /api/health` が200を返す
- [ ] データベースに接続できる
- [ ] CORSが設定されている
- [ ] TypeScriptで実装されている
- [ ] 基本的なセキュリティヘッダーが設定されている
- [ ] エラーハンドリングが適切に動作する
- [ ] 単体テストが全て通る
- [ ] 統合テストが全て通る