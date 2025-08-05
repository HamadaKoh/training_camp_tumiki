import { Server } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { Socket as SocketIOClient, io } from 'socket.io-client';
import request from 'supertest';
import express from 'express';
import { createApp, createServer, resetConnectionCount } from '../app';
import { connectDatabase, disconnectDatabase, testDatabaseConnection } from '../database';

// テストファイル: express-socketio-server.test.ts
describe('TASK-101: Express + Socket.IOサーバー基盤実装', () => {
  let httpServer: Server;
  let socketIOServer: SocketIOServer;
  let app: express.Application;
  
  beforeEach(async () => {
    // 【テスト前準備】: 各テスト実行前にクリーンなサーバー環境を準備し、一貫したテスト条件を保証
    // 【環境初期化】: 前のテストの影響を受けないよう、サーバーインスタンスと接続状態をリセット
    resetConnectionCount(); // 【接続数リセット】: Socket.IO接続数を0にリセット
    app = createApp();
    const serverResult = createServer(app);
    httpServer = serverResult.httpServer;
    socketIOServer = serverResult.socketIOServer;
  });

  afterEach(async () => {
    // 【テスト後処理】: テスト実行後にサーバー接続を適切に閉じ、リソースリークを防止
    // 【状態復元】: 次のテストに影響しないよう、ネットワーク接続とDB接続をクリーンアップ
    if (socketIOServer) {
      socketIOServer.close();
    }
    if (httpServer) {
      httpServer.close();
    }
    await disconnectDatabase();
  });

  // === 正常系テストケース ===

  describe('正常系: 基本的なサーバー機能', () => {
    test('Expressアプリケーションが正常に初期化できる', () => {
      // 【テスト目的】: ExpressアプリケーションインスタンスとHTTPサーバーの正常な初期化を確認
      // 【テスト内容】: createApp()とcreateServer()を呼び出してサーバーインスタンスが生成されることをテスト
      // 【期待される動作】: Expressアプリケーション、HTTPサーバー、Socket.IOサーバーが正常に初期化される
      // 🟢 信頼性レベル: 要件定義書のExpressサーバー初期化要件に基づく

      // 【テストデータ準備】: サーバー初期化に必要な基本的な設定を準備
      // 【初期条件設定】: クリーンな環境でのサーバーインスタンス生成前の状態
      // データ準備は beforeEach で実行済み

      // 【実際の処理実行】: Expressアプリケーションとサーバーインスタンスの生成処理
      // 【処理内容】: createApp()でExpressアプリケーション、createServer()でHTTPサーバーとSocket.IOサーバーを生成
      // 処理実行は beforeEach で実行済み

      // 【結果検証】: 各サーバーインスタンスが正常に生成されていることを確認
      // 【期待値確認】: undefinedでないことで正常なインスタンス生成を検証
      expect(app).toBeDefined(); // 【確認内容】: Expressアプリケーションインスタンスが正常に生成されている 🟢
      expect(httpServer).toBeDefined(); // 【確認内容】: HTTPサーバーインスタンスが正常に生成されている 🟢  
      expect(socketIOServer).toBeDefined(); // 【確認内容】: Socket.IOサーバーインスタンスが正常に生成されている 🟢
    });

    test('健康チェックAPIが正常にレスポンスを返す', async () => {
      // 【テスト目的】: GET /health エンドポイントが正常なJSON レスポンスを返すことを確認
      // 【テスト内容】: 健康チェックエンドポイントに対してGETリクエストを送信し、期待されるレスポンス形式を検証
      // 【期待される動作】: 200 ステータスコードとサービス状態を含むJSON レスポンスが返される
      // 🟢 信頼性レベル: 要件定義書のREQ-001に基づく健康チェックAPI仕様に準拠

      // 【テストデータ準備】: HTTPリクエスト送信のためにsupertestインスタンスを準備
      // 【初期条件設定】: サーバーが起動しており、健康チェックエンドポイントがアクセス可能な状態
      // 【データベース接続】: 健康チェックが正常に動作するためにデータベース接続を初期化
      await connectDatabase();
      
      const expectedResponse = {
        status: 'healthy',
        timestamp: expect.any(String),
        version: '1.0.0',
        database: 'connected',
        socketIO: 'active'
      };

      // 【実際の処理実行】: 健康チェックエンドポイントに対するGETリクエストの実行
      // 【処理内容】: supertest を使用して GET /health リクエストを送信し、レスポンスを取得
      const response = await request(app)
        .get('/health')
        .expect(200);

      // 【結果検証】: レスポンスのステータスコード、Content-Type、JSONボディの構造を確認
      // 【期待値確認】: 200 OK、application/json、および期待されるJSONプロパティが含まれていることを検証
      expect(response.status).toBe(200); // 【確認内容】: HTTP ステータスコードが200 OK である 🟢
      expect(response.headers['content-type']).toMatch(/application\/json/); // 【確認内容】: Content-Typeがapplication/jsonである 🟢
      expect(response.body).toMatchObject(expectedResponse); // 【確認内容】: レスポンスボディが期待されるJSONプロパティを含む 🟢
    });

    test('Socket.IO接続が正常に確立される', (done) => {
      // 【テスト目的】: Socket.IOクライアントがサーバーに正常に接続できることを確認
      // 【テスト内容】: Socket.IOクライアントインスタンスを作成し、サーバーとのWebSocket接続確立を検証
      // 【期待される動作】: 接続イベントが発生し、クライアントが接続状態になる
      // 🟢 信頼性レベル: 要件定義書のREQ-406 Socket.IO実装要件に基づく

      // 【テストデータ準備】: Socket.IO接続テスト用のサーバーポートとクライアント設定を準備
      // 【初期条件設定】: HTTPサーバーが指定ポートでリスニング中、Socket.IOサーバーが接続待機中
      const port = 3001;
      httpServer.listen(port, () => {
        // 【実際の処理実行】: Socket.IOクライアントインスタンスの作成とサーバーへの接続試行
        // 【処理内容】: io()関数を使用してSocket.IOクライアントを作成し、サーバーに接続
        const client: SocketIOClient = io(`http://localhost:${port}`);
        
        client.on('connect', () => {
          // 【結果検証】: 接続が正常に確立されたことを確認
          // 【期待値確認】: connected状態がtrueになり、socket IDが割り当てられることを検証
          expect(client.connected).toBe(true); // 【確認内容】: Socket.IOクライアントが接続状態である 🟢
          expect(client.id).toBeDefined(); // 【確認内容】: クライアントに一意のSocket IDが割り当てられている 🟢
          
          client.disconnect();
          done();
        });

        client.on('connect_error', (error: Error) => {
          done(error);  // 接続エラー時はテスト失敗
        });
      });
    });

    test('PostgreSQL データベース接続が正常に確立される', async () => {
      // 【テスト目的】: PostgreSQLデータベースへの接続が正常に確立されることを確認
      // 【テスト内容】: データベース接続関数を呼び出し、接続プールの初期化と接続テストを実行
      // 【期待される動作】: データベース接続プールが作成され、テストクエリが正常に実行される
      // 🟢 信頼性レベル: 要件定義書のPostgreSQL接続要件とdatabase-schema.sqlに基づく

      // 【テストデータ準備】: データベース接続テスト用の設定を準備
      // 【初期条件設定】: PostgreSQLサーバーが稼働中、接続設定が環境変数に設定済み
      // 設定は環境変数またはdefault値を使用

      // 【実際の処理実行】: データベース接続の初期化とテスト接続の実行
      // 【処理内容】: connectDatabase()で接続プール作成、testDatabaseConnection()で接続確認
      await connectDatabase();
      const isConnected = await testDatabaseConnection();

      // 【結果検証】: データベース接続が正常に確立されていることを確認
      // 【期待値確認】: 接続テスト結果がtrueであることでデータベース接続の成功を検証
      expect(isConnected).toBe(true); // 【確認内容】: データベース接続テストが成功している 🟢
    });

    test('CORS設定が正常に動作する', async () => {
      // 【テスト目的】: CORS（Cross-Origin Resource Sharing）設定が許可されたオリジンからのリクエストを正常に処理することを確認
      // 【テスト内容】: 許可されたオリジンから健康チェックエンドポイントにリクエストを送信し、CORSヘッダーを検証
      // 【期待される動作】: 許可されたオリジンに対してAccess-Control-Allow-Originヘッダーが設定される
      // 🟢 信頼性レベル: 要件定義書のNFR-103 CORS設定要件に基づく

      // 【テストデータ準備】: CORS テスト用の許可されたオリジンを設定
      // 【初期条件設定】: CORSミドルウェアが設定済み、許可オリジンリストが定義済み
      // 【データベース接続】: 健康チェックエンドポイントが200を返すためにデータベース接続を初期化
      await connectDatabase();
      
      const allowedOrigin = 'http://localhost:3000';

      // 【実際の処理実行】: 許可されたオリジンからのHTTPリクエスト送信
      // 【処理内容】: Originヘッダーを含むGETリクエストを送信し、CORSヘッダーの応答を確認
      const response = await request(app)
        .get('/health')
        .set('Origin', allowedOrigin)
        .expect(200);

      // 【結果検証】: CORS関連のレスポンスヘッダーが正しく設定されていることを確認
      // 【期待値確認】: Access-Control-Allow-Originヘッダーが許可されたオリジンに設定されていることを検証
      expect(response.headers['access-control-allow-origin']).toBe(allowedOrigin); // 【確認内容】: CORS許可オリジンヘッダーが正しく設定されている 🟢
    });
  });

  // === 異常系テストケース ===

  describe('異常系: エラーハンドリング', () => {
    test('データベース接続失敗時に健康チェックが503エラーを返す', async () => {
      // 【テスト目的】: データベース接続が利用できない状態で健康チェックAPIが適切なエラーレスポンスを返すことを確認
      // 【テスト内容】: データベース接続を意図的に失敗させた状態で健康チェックエンドポイントにアクセス
      // 【期待される動作】: 503 Service Unavailable ステータスとエラー詳細を含むJSONレスポンスが返される
      // 🟡 信頼性レベル: 要件定義書のエラーハンドリング要件からの妥当な推測

      // 【テストデータ準備】: データベース接続失敗状態をシミュレートする設定
      // 【初期条件設定】: 無効なデータベース接続設定でサーバーが起動している状態
      // データベース接続を切断してエラー状態を作成
      await disconnectDatabase();

      const expectedErrorResponse = {
        status: 'unhealthy',
        timestamp: expect.any(String),
        version: '1.0.0',
        database: 'disconnected',
        socketIO: 'active',
        error: 'Database connection failed'
      };

      // 【実際の処理実行】: データベース接続失敗状態での健康チェックリクエスト送信
      // 【処理内容】: GET /health リクエストを送信し、データベース接続エラー時のレスポンスを取得
      const response = await request(app)
        .get('/health')
        .expect(503);

      // 【結果検証】: エラーレスポンスの構造とステータスコードを確認
      // 【期待値確認】: 503ステータスコードとエラー詳細を含むJSONレスポンスが返されることを検証
      expect(response.status).toBe(503); // 【確認内容】: HTTP ステータスコードが503 Service Unavailable である 🟡
      expect(response.body).toMatchObject(expectedErrorResponse); // 【確認内容】: エラーレスポンスが期待されるJSON構造を持つ 🟡
    });

    test('許可されていないオリジンからのCORSリクエストが拒否される', async () => {
      // 【テスト目的】: CORS設定により許可されていないオリジンからのリクエストが適切にブロックされることを確認
      // 【テスト内容】: 未許可のオリジンから健康チェックエンドポイントにアクセスし、CORS制限を検証
      // 【期待される動作】: リクエストは処理されるが、Access-Control-Allow-Originヘッダーが設定されない
      // 🟡 信頼性レベル: CORS標準仕様とセキュリティ要件からの妥当な推測

      // 【テストデータ準備】: 許可されていないオリジンを設定
      // 【初期条件設定】: CORSミドルウェアが許可オリジンリストで設定済み
      const unauthorizedOrigin = 'http://malicious-site.com';

      // 【実際の処理実行】: 未許可オリジンからのHTTPリクエスト送信
      // 【処理内容】: 未許可のOriginヘッダーを含むGETリクエストを送信
      const response = await request(app)
        .get('/health')
        .set('Origin', unauthorizedOrigin);

      // 【結果検証】: CORS制限により適切なヘッダー制御が行われていることを確認
      // 【期待値確認】: Access-Control-Allow-Originヘッダーが未許可オリジンに設定されていないことを検証
      expect(response.headers['access-control-allow-origin']).not.toBe(unauthorizedOrigin); // 【確認内容】: 未許可オリジンへのCORSヘッダーが設定されていない 🟡
    });

    test('使用中ポートでのサーバー起動時にエラーハンドリングが動作する', (done) => {
      // 【テスト目的】: 既に使用されているポートでサーバー起動を試行した際の適切なエラーハンドリングを確認
      // 【テスト内容】: 既存サーバーと同一ポートで新しいサーバーインスタンスを起動し、エラー処理を検証
      // 【期待される動作】: EADDRINUSE エラーが捕捉され、適切なエラーメッセージが出力される
      // 🟡 信頼性レベル: Node.js標準的なネットワークエラーハンドリングからの推測

      // 【テストデータ準備】: ポート競合テスト用のポート番号と2つのサーバーインスタンス
      // 【初期条件設定】: 最初のサーバーが指定ポートでリスニング中
      const testPort = 3002;
      
      // 最初のサーバーを起動
      httpServer.listen(testPort, () => {
        // 【実際の処理実行】: 同一ポートでの2番目のサーバー起動試行
        // 【処理内容】: 既に使用中のポートで新しいHTTPサーバーの起動を試行
        const duplicateApp = createApp();
        const duplicateServerResult = createServer(duplicateApp);
        const duplicateHttpServer = duplicateServerResult.httpServer;
        
        duplicateHttpServer.on('error', (error: NodeJS.ErrnoException) => {
          // 【結果検証】: ポート使用中エラーが適切に捕捉されることを確認
          // 【期待値確認】: EADDRINUSE エラーコードが設定されていることを検証
          expect(error.code).toBe('EADDRINUSE'); // 【確認内容】: ポート使用中エラー（EADDRINUSE）が発生している 🟡
          expect((error as any).port).toBe(testPort); // 【確認内容】: エラーが発生したポート番号が正しい 🟡
          
          duplicateHttpServer.close();
          done();
        });

        duplicateHttpServer.listen(testPort);
      });
    });

    test('Socket.IO接続タイムアウト時のエラーハンドリング', (done) => {
      // 【テスト目的】: Socket.IO接続タイムアウト発生時の適切なエラーハンドリングを確認
      // 【テスト内容】: 存在しないサーバーへの接続試行によりタイムアウトエラーが発生することを検証
      // 【期待される動作】: connect_error イベントが発生し、タイムアウトエラーが適切に処理される
      // 🟡 信頼性レベル: Socket.IO標準的なエラーハンドリングからの推測

      // 【テストデータ準備】: 接続タイムアウトテスト用の存在しないサーバーURLと短いタイムアウト設定
      // 【初期条件設定】: 接続不可能なサーバーエンドポイントを指定
      const nonExistentPort = 9999;
      
      // 【実際の処理実行】: 存在しないサーバーへのSocket.IO接続試行
      // 【処理内容】: 短いタイムアウト設定でSocket.IOクライアントを作成し、接続エラーを待機
      const client: SocketIOClient = io(`http://localhost:${nonExistentPort}`, {
        timeout: 1000,
        reconnection: false
      });

      client.on('connect_error', (error: Error) => {
        // 【結果検証】: 接続エラーが適切に捕捉され、エラー情報が含まれていることを確認
        // 【期待値確認】: connect_errorイベントでエラーオブジェクトが渡されることを検証
        expect(error).toBeDefined(); // 【確認内容】: 接続エラーオブジェクトが定義されている 🟡
        expect(error.message).toContain('xhr poll error'); // 【確認内容】: Socket.IOの接続エラーメッセージが含まれている 🟡
        
        client.disconnect();
        done();
      });

      // タイムアウト設定（テストが永続的に待機することを防ぐ）
      setTimeout(() => {
        if (!client.connected) {
          client.disconnect();
          done(new Error('Socket.IO connection test timeout'));
        }
      }, 2000);
    });
  });

  // === 境界値テストケース ===

  describe('境界値: 制限値とエッジケース', () => {
    test('最大同時Socket.IO接続数（10接続）で正常動作する', (done) => {
      // 【テスト目的】: NFR-004要件の最大10人同時参加制限でSocket.IO接続が正常に処理されることを確認
      // 【テスト内容】: 10個のSocket.IOクライアント接続を同時に確立し、全ての接続が成功することを検証
      // 【期待される動作】: 10接続全てが正常に確立され、各クライアントに一意のSocket IDが割り当てられる
      // 🟢 信頼性レベル: NFR-004「最大10人の同時参加サポート」要件に基づく

      // 【テストデータ準備】: 最大接続数テスト用の10個のクライアントインスタンス配列とポート設定
      // 【初期条件設定】: サーバーが指定ポートでリスニング中、接続制限が10に設定済み
      const maxConnections = 10;
      const clients: SocketIOClient[] = [];
      const connectedClients: string[] = [];
      const testPort = 3003;

      httpServer.listen(testPort, () => {
        // 【実際の処理実行】: 10個のSocket.IOクライアント接続を並行して作成
        // 【処理内容】: forループで10個のio()クライアントを作成し、各接続の成功を追跡
        for (let i = 0; i < maxConnections; i++) {
          const client = io(`http://localhost:${testPort}`);
          clients.push(client);

          client.on('connect', () => {
            connectedClients.push(client.id!);
            
            // 全ての接続が完了した時点で検証実行
            if (connectedClients.length === maxConnections) {
              // 【結果検証】: 10接続全てが正常に確立され、重複しない一意のIDが割り当てられていることを確認
              // 【期待値確認】: 接続数が最大値と一致し、全てのSocket IDがユニークであることを検証
              expect(connectedClients).toHaveLength(maxConnections); // 【確認内容】: 最大接続数（10）の全てのクライアントが接続されている 🟢
              expect(new Set(connectedClients).size).toBe(maxConnections); // 【確認内容】: 全てのSocket IDが一意である（重複なし） 🟢
              
              // クリーンアップ
              clients.forEach(c => c.disconnect());
              done();
            }
          });

          client.on('connect_error', (error: Error) => {
            done(error);
          });
        }
      });
    });

    test('最大接続数超過（11接続目）で適切に制限される', (done) => {
      // 【テスト目的】: 最大接続数を1つ超過した場合の適切な接続制限動作を確認
      // 【テスト内容】: 10接続確立後に11番目の接続を試行し、接続が拒否または制限されることを検証
      // 【期待される動作】: 11番目の接続が拒否されるか、適切なエラーメッセージが返される
      // 🟡 信頼性レベル: システム保護要件からの妥当な推測（接続制限実装）

      // 【テストデータ準備】: 接続制限テスト用の11個のクライアントと接続管理変数
      // 【初期条件設定】: サーバーが最大10接続に設定済み、接続数追跡機能が有効
      const maxConnections = 10;
      const clients: SocketIOClient[] = [];
      let connectedCount = 0;
      let rejectedConnection = false;
      const testPort = 3004;

      httpServer.listen(testPort, () => {
        // 【実際の処理実行】: 最大接続数＋1（11個）のSocket.IOクライアント接続を試行
        // 【処理内容】: 11個のクライアント接続を作成し、10番目までの成功と11番目の拒否を確認
        for (let i = 0; i < maxConnections + 1; i++) {
          const client = io(`http://localhost:${testPort}`);
          clients.push(client);

          client.on('connect', () => {
            connectedCount++;
          });

          client.on('connect_error', (error: Error) => {
            if (i === maxConnections) { // 11番目の接続
              rejectedConnection = true;
              
              // 【結果検証】: 10接続成功＋11番目拒否の適切な制限動作を確認
              // 【期待値確認】: 接続数が最大値で制限され、超過接続が適切に拒否されることを検証
              expect(connectedCount).toBe(maxConnections); // 【確認内容】: 接続数が最大値（10）で制限されている 🟡
              expect(rejectedConnection).toBe(true); // 【確認内容】: 11番目の接続が適切に拒否されている 🟡
              expect(error).toBeDefined(); // 【確認内容】: 接続拒否時にエラー情報が提供されている 🟡
              
              clients.forEach(c => c.disconnect());
              done();
            }
          });
        }

        // タイムアウト保護
        setTimeout(() => {
          if (connectedCount >= maxConnections) {
            // 11番目が接続できてしまった場合のフォールバック検証
            expect(connectedCount).toBeLessThanOrEqual(maxConnections); // 【確認内容】: 接続数が最大値を超過していない 🟡
            clients.forEach(c => c.disconnect());
            done();
          }
        }, 3000);
      });
    });

    test('健康チェックAPI応答時間が1秒以内である', async () => {
      // 【テスト目的】: NFR-003要件の1秒以内応答時間で健康チェックAPIが動作することを確認
      // 【テスト内容】: 健康チェックエンドポイントのレスポンス時間を測定し、1秒以内であることを検証
      // 【期待される動作】: GET /health リクエストが1000ms以内で完了する
      // 🟢 信頼性レベル: NFR-003「1秒以内に完了」要件に基づく

      // 【テストデータ準備】: 応答時間測定用のタイムスタンプ変数と性能要件値
      // 【初期条件設定】: サーバーが正常起動状態、データベース接続が確立済み
      // 【データベース接続】: 健康チェックエンドポイントが200を返すためにデータベース接続を初期化
      await connectDatabase();
      
      const maxResponseTime = 1000; // 1秒 = 1000ms
      const startTime = Date.now();

      // 【実際の処理実行】: 健康チェックエンドポイントへのリクエスト送信と応答時間測定
      // 【処理内容】: GET /health リクエストを送信し、開始から完了までの時間を計測
      const response = await request(app)
        .get('/health')
        .expect(200);

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // 【結果検証】: 応答時間が性能要件内であることと正常なレスポンス内容を確認
      // 【期待値確認】: 応答時間が1秒以内であり、レスポンス内容が正常であることを検証
      expect(responseTime).toBeLessThan(maxResponseTime); // 【確認内容】: 応答時間が1秒（1000ms）以内である 🟢
      expect(response.body.status).toBe('healthy'); // 【確認内容】: レスポンス内容が正常（healthy）である 🟢
    });

    test('健康チェックレスポンスにnull/undefined値が含まれない', async () => {
      // 【テスト目的】: 健康チェックAPIのレスポンスデータの完全性を確認し、null/undefined値が含まれないことを検証
      // 【テスト内容】: 健康チェックエンドポイントのレスポンスの全プロパティがnull/undefinedでないことを確認
      // 【期待される動作】: レスポンスの全てのプロパティに有効な値が設定されている
      // 🟡 信頼性レベル: データ完全性要件からの妥当な推測

      // 【テストデータ準備】: null/undefined値検証用のプロパティ一覧
      // 【初期条件設定】: サーバーが正常起動状態、全てのコンポーネントが初期化済み
      // 【データベース接続】: 健康チェックエンドポイントが200を返すためにデータベース接続を初期化
      await connectDatabase();
      
      const requiredProperties = ['status', 'timestamp', 'version', 'database', 'socketIO'];

      // 【実際の処理実行】: 健康チェックエンドポイントへのリクエスト送信
      // 【処理内容】: GET /health リクエストを送信し、レスポンスボディを取得
      const response = await request(app)
        .get('/health')
        .expect(200);

      // 【結果検証】: レスポンスの各プロパティがnull/undefinedでないことを確認
      // 【期待値確認】: 必須プロパティ全てに有効な値が設定されていることを検証
      requiredProperties.forEach(property => {
        expect(response.body[property]).toBeDefined(); // 【確認内容】: プロパティがundefinedでない 🟡
        expect(response.body[property]).not.toBeNull(); // 【確認内容】: プロパティがnullでない 🟡
      });
      
      // レスポンス全体の型安全性確認
      expect(typeof response.body.status).toBe('string'); // 【確認内容】: status プロパティが文字列型である 🟡
      expect(typeof response.body.timestamp).toBe('string'); // 【確認内容】: timestamp プロパティが文字列型である 🟡
      expect(typeof response.body.version).toBe('string'); // 【確認内容】: version プロパティが文字列型である 🟡
    });
  });
});