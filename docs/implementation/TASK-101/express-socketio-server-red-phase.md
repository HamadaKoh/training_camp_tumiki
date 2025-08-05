# TASK-101: Express + Socket.IOサーバー基盤実装 - TDD Redフェーズ

## フェーズ概要

**実行日時**: 2025-08-05  
**TDDフェーズ**: Red（失敗するテスト作成）  
**目的**: Express + Socket.IOサーバー基盤機能の包括的な失敗テスト作成

## 作成したテストケース詳細

### テストファイル構成

**ファイルパス**: `voice-chat/backend/src/__tests__/express-socketio-server.test.ts`  
**テスト総数**: 13個  
**分類構成**: 正常系5個、異常系4個、境界値4個

### 正常系テストケース（5件）

#### 1. Expressアプリケーション初期化テスト
```typescript
test('Expressアプリケーションが正常に初期化できる', () => {
  // 🟢 要件定義書のExpressサーバー初期化要件に基づく
  expect(app).toBeDefined();
  expect(httpServer).toBeDefined(); 
  expect(socketIOServer).toBeDefined();
})
```
**検証内容**: createApp()とcreateServer()による各インスタンスの正常生成

#### 2. 健康チェックAPIテスト
```typescript
test('健康チェックAPIが正常にレスポンスを返す', async () => {
  // 🟢 REQ-001に基づく健康チェックAPI仕様に準拠
  const response = await request(app).get('/health').expect(200);
  expect(response.headers['content-type']).toMatch(/application\/json/);
  expect(response.body).toMatchObject(expectedResponse);
})
```
**検証内容**: GET /health エンドポイントの200レスポンスとJSON構造

#### 3. Socket.IO接続テスト
```typescript
test('Socket.IO接続が正常に確立される', (done) => {
  // 🟢 REQ-406 Socket.IO実装要件に基づく
  client.on('connect', () => {
    expect(client.connected).toBe(true);
    expect(client.id).toBeDefined();
  });
})
```
**検証内容**: WebSocket接続確立と一意Socket ID割り当て

#### 4. PostgreSQL接続テスト
```typescript
test('PostgreSQL データベース接続が正常に確立される', async () => {
  // 🟢 database-schema.sqlに基づく
  await connectDatabase();
  const isConnected = await testDatabaseConnection();
  expect(isConnected).toBe(true);
})
```
**検証内容**: データベース接続プール初期化と接続確認

#### 5. CORS設定テスト
```typescript
test('CORS設定が正常に動作する', async () => {
  // 🟢 NFR-103 CORS設定要件に基づく
  const response = await request(app)
    .get('/health')
    .set('Origin', allowedOrigin)
    .expect(200);
  expect(response.headers['access-control-allow-origin']).toBe(allowedOrigin);
})
```
**検証内容**: 許可オリジンへのCORSヘッダー設定

### 異常系テストケース（4件）

#### 1. DB接続失敗時503エラーテスト
```typescript
test('データベース接続失敗時に健康チェックが503エラーを返す', async () => {
  // 🟡 エラーハンドリング要件からの妥当な推測
  await disconnectDatabase();
  const response = await request(app).get('/health').expect(503);
  expect(response.body).toMatchObject(expectedErrorResponse);
})
```
**検証内容**: DB接続不可時の適切なエラーレスポンス

#### 2. CORS拒否テスト
```typescript
test('許可されていないオリジンからのCORSリクエストが拒否される', async () => {
  // 🟡 CORS標準仕様とセキュリティ要件からの推測
  const response = await request(app)
    .get('/health')
    .set('Origin', unauthorizedOrigin);
  expect(response.headers['access-control-allow-origin']).not.toBe(unauthorizedOrigin);
})
```
**検証内容**: 未許可オリジンに対するアクセス制限

#### 3. ポート競合エラーテスト
```typescript
test('使用中ポートでのサーバー起動時にエラーハンドリングが動作する', (done) => {
  // 🟡 Node.js標準的なネットワークエラーハンドリングからの推測
  duplicateHttpServer.on('error', (error: NodeJS.ErrnoException) => {
    expect(error.code).toBe('EADDRINUSE');
    expect((error as any).port).toBe(testPort);
  });
})
```
**検証内容**: EADDRINUSE エラーの適切な捕捉

#### 4. Socket.IO接続タイムアウトテスト
```typescript
test('Socket.IO接続タイムアウト時のエラーハンドリング', (done) => {
  // 🟡 Socket.IO標準的なエラーハンドリングからの推測
  client.on('connect_error', (error: Error) => {
    expect(error).toBeDefined();
    expect(error.message).toContain('xhr poll error');
  });
})
```
**検証内容**: 接続不可能サーバーへの接続試行時のエラー処理

### 境界値テストケース（4件）

#### 1. 最大同時接続テスト
```typescript
test('最大同時Socket.IO接続数（10接続）で正常動作する', (done) => {
  // 🟢 NFR-004「最大10人の同時参加サポート」要件に基づく
  for (let i = 0; i < maxConnections; i++) {
    // 10個のクライアント並行接続
  }
  expect(connectedClients).toHaveLength(maxConnections);
  expect(new Set(connectedClients).size).toBe(maxConnections);
})
```
**検証内容**: 10接続並行処理と一意ID割り当て

#### 2. 接続数超過制限テスト
```typescript
test('最大接続数超過（11接続目）で適切に制限される', (done) => {
  // 🟡 システム保護要件からの推測
  // 11個の接続試行
  expect(connectedCount).toBe(maxConnections);
  expect(rejectedConnection).toBe(true);
})
```
**検証内容**: 11番目の接続に対する適切な拒否

#### 3. 応答時間境界値テスト
```typescript
test('健康チェックAPI応答時間が1秒以内である', async () => {
  // 🟢 NFR-003「1秒以内に完了」要件に基づく
  const startTime = Date.now();
  const response = await request(app).get('/health').expect(200);
  const responseTime = Date.now() - startTime;
  expect(responseTime).toBeLessThan(maxResponseTime);
})
```
**検証内容**: 1秒以内の応答時間確認

#### 4. null/undefined安全性テスト
```typescript
test('健康チェックレスポンスにnull/undefined値が含まれない', async () => {
  // 🟡 データ完全性要件からの推測
  const response = await request(app).get('/health').expect(200);
  requiredProperties.forEach(property => {
    expect(response.body[property]).toBeDefined();
    expect(response.body[property]).not.toBeNull();
  });
})
```
**検証内容**: レスポンスデータの完全性確認

## テスト実行結果

### 実行コマンド
```bash
npm test -- --verbose
```

### 期待された失敗結果
```
FAIL src/__tests__/express-socketio-server.test.ts
Test Suites: 1 failed, 1 total
Tests: 13 failed, 13 total

主なエラーメッセージ:
✕ createApp not implemented (at src/app.ts:9:9)
✕ createServer not implemented (at src/app.ts:14:9)  
✕ connectDatabase not implemented (at src/database.ts:4:9)
✕ disconnectDatabase not implemented (at src/database.ts:10:9)
✕ testDatabaseConnection not implemented (at src/database.ts:16:9)
```

### 失敗理由分析
全てのテストが期待通りに失敗：
- **createApp()**: 未実装によるError throw
- **createServer()**: 未実装によるError throw  
- **データベース関数群**: 全て未実装によるError throw
- **setupフェーズ**: beforeEach内でのエラーにより全テスト実行前に失敗

## 実装指針（Greenフェーズ向け）

### 段階的実装アプローチ

#### Phase 1: Express基盤
1. **createApp()実装**:
   ```typescript
   export function createApp(): express.Application {
     const app = express();
     app.use(cors({ origin: ['http://localhost:3000'] }));
     app.get('/health', (req, res) => { /* 健康チェックロジック */ });
     return app;
   }
   ```

2. **createServer()実装**:
   ```typescript
   export function createServer(app: express.Application) {
     const httpServer = createHttpServer(app);
     const socketIOServer = new Server(httpServer);
     return { httpServer, socketIOServer };
   }
   ```

#### Phase 2: データベース統合
1. **connectDatabase()**: pg.Pool初期化
2. **testDatabaseConnection()**: SELECT 1 クエリ実行
3. **disconnectDatabase()**: 接続プール終了

#### Phase 3: 健康チェック統合
- データベース接続状態を反映したレスポンス生成
- 503エラーハンドリング実装

#### Phase 4: Socket.IO基盤
- 接続イベントハンドラー実装
- 最大接続数制限機能

### 品質要件
- **TypeScript型安全性**: 全函数の完全な型定義
- **エラーハンドリング**: try-catch による適切な例外処理
- **パフォーマンス**: NFR-003（1秒以内応答）要件遵守
- **セキュリティ**: CORS適切な設定、入力値検証

## 次のステップ

**推奨アクション**: `/tdd-green TASK-101` でGreenフェーズ（最小実装）を開始

**Greenフェーズ目標**:
- 全13テストケースの通過
- 最小限のコードによる要件満足
- 後のRefactorフェーズでの改善余地保持