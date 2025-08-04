import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../app';

describe('ヘルスチェックエンドポイント', () => {
  let app: Express;

  beforeEach(() => {
    // 【テスト前準備】: 各テスト実行前にExpressアプリケーションインスタンスを初期化
    // 【環境初期化】: 前のテストの影響を受けないよう、新しいアプリケーションインスタンスを作成
    app = createApp();
  });

  afterEach(() => {
    // 【テスト後処理】: 各テスト実行後にリソースのクリーンアップを行う
    // 【状態復元】: 次のテストに影響しないよう、データベース接続等のリソースを適切に閉じる
    // 注：現在は特にクリーンアップが必要なリソースはないため、コメントのみ
  });

  test('GET /api/health で正常なヘルスチェックレスポンスを返す', async () => {
    // 【テスト目的】: データベース接続が正常な状態でのヘルスチェックエンドポイントの動作確認
    // 【テスト内容】: /api/healthエンドポイントが適切な形式のHealthCheckResponseを返すことを検証
    // 【期待される動作】: HTTP 200ステータスと要件定義に準拠したレスポンス形式を返す
    // 🟢 信頼性レベル: interfaces.tsのHealthCheckResponse型定義とapi-endpoints.mdの仕様に基づく

    // 【テストデータ準備】: ヘルスチェックはパラメータ不要のため、特別な準備は不要
    // 【初期条件設定】: アプリケーションが正常に起動している状態

    // 【実際の処理実行】: GET /api/healthエンドポイントにHTTPリクエストを送信
    // 【処理内容】: Supertestを使用してHTTPリクエストを模擬実行し、レスポンスを取得
    const response = await request(app)
      .get('/api/health')
      .expect(200); // 【確認内容】: HTTPステータスコード200が返されることを確認 🟢

    // 【結果検証】: レスポンスボディが要件定義に準拠した形式であることを検証
    // 【期待値確認】: interfaces.tsで定義されたHealthCheckResponse型に準拠したデータ構造

    expect(response.body).toHaveProperty('status'); // 【確認内容】: statusプロパティの存在確認 🟢
    expect(response.body.status).toBe('healthy'); // 【確認内容】: 正常時のステータス値が'healthy'であることを確認 🟢
    
    expect(response.body).toHaveProperty('version'); // 【確認内容】: versionプロパティの存在確認 🟢
    expect(typeof response.body.version).toBe('string'); // 【確認内容】: versionが文字列型であることを確認 🟢
    
    expect(response.body).toHaveProperty('uptime'); // 【確認内容】: uptimeプロパティの存在確認 🟢
    expect(typeof response.body.uptime).toBe('number'); // 【確認内容】: uptimeが数値型であることを確認 🟢
    expect(response.body.uptime).toBeGreaterThanOrEqual(0); // 【確認内容】: uptimeが0以上の値であることを確認 🟢
    
    expect(response.body).toHaveProperty('checks'); // 【確認内容】: checksプロパティの存在確認 🟢
    expect(response.body.checks).toHaveProperty('database'); // 【確認内容】: database接続チェックプロパティの存在確認 🟢
    expect(typeof response.body.checks.database).toBe('boolean'); // 【確認内容】: databaseチェック結果がboolean型であることを確認 🟢
    expect(response.body.checks.database).toBe(true); // 【確認内容】: データベース接続が正常な場合はtrueを返すことを確認 🟢
    
    expect(response.body.checks).toHaveProperty('kubernetes'); // 【確認内容】: kubernetes接続チェックプロパティの存在確認 🟢
    expect(typeof response.body.checks.kubernetes).toBe('boolean'); // 【確認内容】: kubernetesチェック結果がboolean型であることを確認 🟢
    expect(response.body.checks.kubernetes).toBe(false); // 【確認内容】: Kubernetes統合はTASK-102の将来実装なので現在はfalseを確認 🟡
  });

  test('ヘルスチェックが500ms以内に応答する', async () => {
    // 【テスト目的】: NFR-002で要求されるレスポンス時間の上限値（500ms以内）の確認
    // 【テスト内容】: ヘルスチェックエンドポイントが性能要件を満たすレスポンス時間で応答することを検証
    // 【期待される動作】: 500ms未満でHTTP 200レスポンスを返す
    // 🟢 信頼性レベル: NFR-002の具体的なパフォーマンス要件に基づく

    // 【テストデータ準備】: レスポンス時間測定のため、開始時刻を記録
    // 【初期条件設定】: アプリケーションが正常に起動している状態
    const startTime = Date.now();

    // 【実際の処理実行】: GET /api/healthエンドポイントにHTTPリクエストを送信
    // 【処理内容】: 処理時間を測定しながらヘルスチェックを実行
    await request(app)
      .get('/api/health')
      .expect(200); // 【確認内容】: HTTPステータスコード200が返されることを確認 🟢

    // 【結果検証】: レスポンス時間が性能要件を満たしていることを検証
    // 【期待値確認】: NFR-002で定義された500ms以内のレスポンス時間要件
    const responseTime = Date.now() - startTime;
    expect(responseTime).toBeLessThan(500); // 【確認内容】: レスポンス時間が500ms未満であることを確認 🟢
  });
});