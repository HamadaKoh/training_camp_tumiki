/**
 * TASK-104: 画面共有制御機能実装 - TDD RED段階
 * 
 * 【テスト目的】: 画面共有の排他制御と状態管理機能のテスト
 * 【実装方針】: 失敗テストから開始し、画面共有排他制御を段階的に実装
 * 【テスト対象】: ScreenShareManagerクラス、画面共有制御イベント
 * 【依存関係】: RoomManager、Socket.IO基盤（TASK-102・TASK-103完了前提）
 * 🔴 現段階: RED - 失敗テストケース作成
 */

import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { createApp, createServer, resetConnectionCount } from '../app';
import { getRoomManager } from '../room-manager';
import { getScreenShareManager, resetScreenShareManager } from '../screen-share-manager';

describe.skip('TASK-104: 画面共有制御機能実装 - TDD RED段階', () => {
  let httpServer: HttpServer;
  let socketIOServer: SocketIOServer;
  let clientSockets: ClientSocket[] = [];
  const TEST_PORT = 3001;

  beforeAll(async () => {
    // 【テスト環境初期化】: Express + Socket.IOサーバーの起動
    const app = createApp();
    const servers = createServer(app);
    httpServer = servers.httpServer;
    socketIOServer = servers.socketIOServer;

    // 【サーバー起動】: テスト用ポートでHTTPサーバー開始
    await new Promise<void>((resolve) => {
      httpServer.listen(TEST_PORT, resolve);
    });
  });

  beforeEach(async () => {
    // 【テスト間クリーンアップ】: 各テスト実行前の状態初期化
    resetConnectionCount();
    resetScreenShareManager();
    getRoomManager().resetForTesting();
    clientSockets = [];
  });

  afterEach(async () => {
    // 【クライアント切断】: テスト終了後のSocket.IOクライアント切断
    await Promise.all(
      clientSockets.map(
        (socket) =>
          new Promise<void>((resolve) => {
            if (socket.connected) {
              socket.disconnect();
              socket.on('disconnect', () => resolve());
            } else {
              resolve();
            }
          })
      )
    );
    clientSockets = [];
  });

  afterAll(async () => {
    // 【サーバー終了】: テスト完了後のサーバーシャットダウン
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  /**
   * 【ヘルパー関数】: Socket.IOクライアント接続とルーム参加
   * @param participantCount - 作成する参加者数
   * @returns 接続済みクライアントソケット配列
   */
  const createConnectedParticipants = async (participantCount: number): Promise<ClientSocket[]> => {
    const clients: ClientSocket[] = [];
    
    for (let i = 0; i < participantCount; i++) {
      const client = Client(`http://localhost:${TEST_PORT}`);
      clients.push(client);
      clientSockets.push(client);

      // 【接続待機】: Socket.IO接続完了まで待機
      await new Promise<void>((resolve) => {
        client.on('connect', resolve);
      });

      // 【ルーム参加】: join-roomイベントで参加者登録
      await new Promise<void>((resolve) => {
        client.emit('join-room');
        client.on('room-joined', () => resolve());
      });
    }

    return clients;
  };

  describe('正常系: 画面共有排他制御基本フロー', () => {
    test('SCREEN-NORMAL-001: ScreenShareManagerクラスが正常に初期化できる', async () => {
      // 【Given】: Socket.IOサーバーとRoomManager存在
      // 【テスト目的】: 画面共有制御基盤の初期化確認
      // 【期待動作】: イベントハンドラー登録、初期状態（共有者なし）

      const screenShareManager = getScreenShareManager();
      
      // 【初期状態確認】: 画面共有が非アクティブ状態
      expect(screenShareManager.isScreenSharingActive()).toBe(false);
      expect(screenShareManager.getCurrentScreenSharingParticipant()).toBeNull();
      
      // 【イベントハンドラー登録確認】: Socket.IOイベントリスナーの存在
      const eventNames = socketIOServer.eventNames();
      expect(eventNames.includes('connection')).toBe(true);
    });

    test('SCREEN-NORMAL-002: 未使用状態での画面共有開始リクエストが正常に許可される', async () => {
      // 【Given】: 1人の参加者がルームに参加済み
      // 【テスト目的】: 基本的な画面共有許可機能の動作確認
      // 【期待動作】: 排他確認、共有者設定、状態更新、全参加者通知

      const [client1] = await createConnectedParticipants(1);
      
      const responsePromise = new Promise<any>((resolve) => {
        client1.emit('request-screen-share', resolve);
      });

      const startedEventPromise = new Promise<string>((resolve) => {
        client1.on('screen-share-started', resolve);
      });

      // 【When】: 画面共有開始リクエスト送信
      const response = await responsePromise;
      const startedParticipantId = await startedEventPromise;

      // 【Then】: 画面共有許可とイベント配信確認
      expect(response.success).toBe(true);
      expect(response.granted).toBe(true);
      expect(response.error).toBeUndefined();
      expect(startedParticipantId).toBeTruthy();
      
      // 【状態確認】: ScreenShareManagerの状態更新
      const screenShareManager = getScreenShareManager();
      expect(screenShareManager.isScreenSharingActive()).toBe(true);
      expect(screenShareManager.getCurrentScreenSharingParticipant()).toBe(startedParticipantId);
    });

    test('SCREEN-NORMAL-003: 共有者による画面共有停止リクエストが正常に処理される', async () => {
      // 【Given】: 参加者が画面共有中の状態
      // 【テスト目的】: 正常な画面共有停止機能の確認
      // 【期待動作】: 権限確認、状態クリア、全参加者通知

      const [client1] = await createConnectedParticipants(1);
      
      // 【画面共有開始】: テスト前提条件の設定
      await new Promise<void>((resolve) => {
        client1.emit('request-screen-share', (response: any) => {
          expect(response.success).toBe(true);
          resolve();
        });
      });

      const stoppedEventPromise = new Promise<string>((resolve) => {
        client1.on('screen-share-stopped', resolve);
      });

      // 【When】: 画面共有停止リクエスト送信
      client1.emit('stop-screen-share');
      const stoppedParticipantId = await stoppedEventPromise;

      // 【Then】: 画面共有停止とイベント配信確認
      expect(stoppedParticipantId).toBeTruthy();
      
      // 【状態確認】: ScreenShareManagerの状態クリア
      const screenShareManager = getScreenShareManager();
      expect(screenShareManager.isScreenSharingActive()).toBe(false);
      expect(screenShareManager.getCurrentScreenSharingParticipant()).toBeNull();
    });

    test('SCREEN-NORMAL-004: 新規参加者に現在の画面共有状態が正確に同期される', async () => {
      // 【Given】: 参加者Aが画面共有中の状態
      // 【テスト目的】: 状態同期機能の正確性確認
      // 【期待動作】: 新規参加者への画面共有状態通知

      const [client1] = await createConnectedParticipants(1);
      
      // 【画面共有開始】: 既存参加者による画面共有
      let sharingParticipantId = '';
      await new Promise<void>((resolve) => {
        client1.emit('request-screen-share', (response: any) => {
          expect(response.success).toBe(true);
          client1.on('screen-share-started', (participantId: string) => {
            sharingParticipantId = participantId;
            resolve();
          });
        });
      });

      // 【新規参加者接続】: 画面共有中に途中参加
      const client2 = Client(`http://localhost:${TEST_PORT}`);
      clientSockets.push(client2);

      const syncEventPromise = new Promise<string>((resolve) => {
        client2.on('screen-share-started', resolve);
      });

      await new Promise<void>((resolve) => {
        client2.on('connect', resolve);
      });

      // 【When】: 新規参加者のルーム参加
      await new Promise<void>((resolve) => {
        client2.emit('join-room');
        client2.on('room-joined', () => resolve());
      });

      // 【Then】: 新規参加者への状態同期確認
      const syncedParticipantId = await syncEventPromise;
      expect(syncedParticipantId).toBe(sharingParticipantId);
    });

    test('SCREEN-NORMAL-005: 画面共有の開始・停止がデータベースに正確に記録される', async () => {
      // 【Given】: 1人の参加者がルームに参加済み
      // 【テスト目的】: データ永続化の完全性確認
      // 【期待動作】: event_logsとroom_snapshotsへの完全記録

      const [client1] = await createConnectedParticipants(1);
      
      // 【When】: 画面共有開始→停止の一連の流れ
      await new Promise<void>((resolve) => {
        client1.emit('request-screen-share', (response: any) => {
          expect(response.success).toBe(true);
          resolve();
        });
      });

      await new Promise<void>((resolve) => {
        client1.on('screen-share-started', () => resolve());
      });

      client1.emit('stop-screen-share');
      await new Promise<void>((resolve) => {
        client1.on('screen-share-stopped', () => resolve());
      });

      // 【Then】: データベース記録確認（統計情報経由）
      const screenShareManager = getScreenShareManager();
      const stats = screenShareManager.getStats();
      expect(stats.totalScreenShareSessions).toBe(1);
      expect(stats.activeScreenShareSessions).toBe(0);
    });

    test('SCREEN-NORMAL-006: 画面共有中の参加者切断時に自動的に共有が停止される', async () => {
      // 【Given】: 参加者が画面共有中、別参加者も在室
      // 【テスト目的】: 自動クリーンアップ機能の確認
      // 【期待動作】: 切断検知、自動状態クリア、全参加者への停止通知

      const [client1, client2] = await createConnectedParticipants(2);
      
      // 【画面共有開始】: client1による画面共有開始
      await new Promise<void>((resolve) => {
        client1.emit('request-screen-share', (response: any) => {
          expect(response.success).toBe(true);
          resolve();
        });
      });

      const autoStopEventPromise = new Promise<string>((resolve) => {
        client2.on('screen-share-stopped', resolve);
      });

      // 【When】: 画面共有中の参加者切断
      client1.disconnect();

      // 【Then】: 自動停止処理とイベント配信確認
      const stoppedParticipantId = await autoStopEventPromise;
      expect(stoppedParticipantId).toBeTruthy();
      
      // 【状態確認】: 自動的な状態クリア
      const screenShareManager = getScreenShareManager();
      expect(screenShareManager.isScreenSharingActive()).toBe(false);
      expect(screenShareManager.getCurrentScreenSharingParticipant()).toBeNull();
    });
  });

  describe('異常系: エラーハンドリングと排他制御', () => {
    test('SCREEN-ERROR-001: 既に共有中の状態での新規共有リクエスト時にSCREEN_SHARE_IN_USEエラーが返される', async () => {
      // 【Given】: 参加者Aが画面共有中、参加者Bも在室
      // 【テスト目的】: 排他制御機能の実効性確認
      // 【期待動作】: SCREEN_SHARE_IN_USEエラー、既存共有への影響なし

      const [client1, client2] = await createConnectedParticipants(2);
      
      // 【画面共有開始】: client1による画面共有開始
      await new Promise<void>((resolve) => {
        client1.emit('request-screen-share', (response: any) => {
          expect(response.success).toBe(true);
          resolve();
        });
      });

      // 【When】: 既に共有中の状態でのclient2による開始リクエスト
      const responsePromise = new Promise<any>((resolve) => {
        client2.emit('request-screen-share', resolve);
      });

      const response = await responsePromise;

      // 【Then】: 排他制御エラーの確認
      expect(response.success).toBe(false);
      expect(response.granted).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error.code).toBe('SCREEN_SHARE_IN_USE');
      expect(response.error.message).toContain('他の参加者が画面共有中です');
      
      // 【状態確認】: 既存の画面共有状態維持
      const screenShareManager = getScreenShareManager();
      expect(screenShareManager.isScreenSharingActive()).toBe(true);
    });

    test('SCREEN-ERROR-002: 共有者以外による画面共有停止試行時に権限エラーが返される', async () => {
      // 【Given】: 参加者Aが画面共有中、参加者Bも在室
      // 【テスト目的】: 権限管理機能の実効性確認
      // 【期待動作】: 権限エラー、画面共有状態継続

      const [client1, client2] = await createConnectedParticipants(2);
      
      // 【画面共有開始】: client1による画面共有開始
      await new Promise<void>((resolve) => {
        client1.emit('request-screen-share', (response: any) => {
          expect(response.success).toBe(true);
          resolve();
        });
      });

      const errorEventPromise = new Promise<any>((resolve) => {
        client2.on('screen-share-error', resolve);
      });

      // 【When】: 共有者以外による停止試行
      client2.emit('stop-screen-share');

      // 【Then】: 権限エラーの確認
      const errorResponse = await errorEventPromise;
      expect(errorResponse.code).toBe('UNAUTHORIZED_STOP');
      expect(errorResponse.message).toContain('画面共有の停止権限がありません');
      
      // 【状態確認】: 画面共有状態継続
      const screenShareManager = getScreenShareManager();
      expect(screenShareManager.isScreenSharingActive()).toBe(true);
    });

    test('SCREEN-ERROR-003: 参加者リストにない送信者からの画面共有リクエスト時に認証エラーが返される', async () => {
      // 【Given】: 正規参加者なしの状態
      // 【テスト目的】: 参加者認証機能の実効性確認
      // 【期待動作】: 認証エラー、不正アクセス防止

      // 【直接接続】: join-roomなしでの接続（不正な状態）
      const invalidClient = Client(`http://localhost:${TEST_PORT}`);
      clientSockets.push(invalidClient);

      await new Promise<void>((resolve) => {
        invalidClient.on('connect', resolve);
      });

      const errorEventPromise = new Promise<any>((resolve) => {
        invalidClient.on('screen-share-error', resolve);
      });

      // 【When】: 未参加者による画面共有リクエスト
      invalidClient.emit('request-screen-share', () => {});

      // 【Then】: 認証エラーの確認
      const errorResponse = await errorEventPromise;
      expect(errorResponse.code).toBe('UNAUTHORIZED_PARTICIPANT');
      expect(errorResponse.message).toContain('参加者として認証されていません');
    });

    test('SCREEN-ERROR-004: データベース記録失敗時に画面共有開始処理がロールバックされる', async () => {
      // 【Given】: DB接続不可状態での画面共有リクエスト
      // 【テスト目的】: トランザクション整合性の確認
      // 【期待動作】: 画面共有開始失敗、状態変更なし

      const [client1] = await createConnectedParticipants(1);

      // 【DB障害シミュレーション】: モックでDB障害を発生
      const screenShareManager = getScreenShareManager();
      screenShareManager.simulateDatabaseFailure(true);

      const responsePromise = new Promise<any>((resolve) => {
        client1.emit('request-screen-share', resolve);
      });

      // 【When】: DB障害状態での画面共有開始リクエスト
      const response = await responsePromise;

      // 【Then】: DB障害時の適切な処理確認
      expect(response.success).toBe(false);
      expect(response.granted).toBe(false);
      expect(response.error.code).toBe('DATABASE_ERROR');
      expect(response.error.message).toContain('一時的な障害');
      
      // 【状態確認】: インメモリ状態変更なし
      expect(screenShareManager.isScreenSharingActive()).toBe(false);

      // 【DB障害解除】: テスト後のクリーンアップ
      screenShareManager.simulateDatabaseFailure(false);
    });

    test('SCREEN-ERROR-005: 画面共有配信中のネットワーク障害時に適切な処理が行われる', async () => {
      // 【Given】: 画面共有配信中の状態
      // 【テスト目的】: 配信障害時の自動処理確認
      // 【期待動作】: 配信失敗検知、自動停止処理

      const [client1] = await createConnectedParticipants(2);
      
      // 【画面共有開始】: client1による画面共有開始
      await new Promise<void>((resolve) => {
        client1.emit('request-screen-share', (response: any) => {
          expect(response.success).toBe(true);
          resolve();
        });
      });

      const failureEventPromise = new Promise<any>((resolve) => {
        client1.on('screen-share-delivery-failed', resolve);
      });

      // 【ネットワーク障害シミュレーション】: 配信障害の発生
      const screenShareManager = getScreenShareManager();
      screenShareManager.simulateDeliveryFailure();

      // 【When】: 配信障害発生
      const failureResponse = await failureEventPromise;

      // 【Then】: 配信障害時の処理確認
      expect(failureResponse.code).toBe('DELIVERY_FAILED');
      expect(failureResponse.message).toContain('配信に失敗しました');
      expect(failureResponse.autoRetry).toBe(true);
    });
  });

  describe('境界値: システム制限とエッジケース', () => {
    test('SCREEN-BOUNDARY-001: 最大参加者数（10人）での画面共有開始・状態同期が正常に処理される', async () => {
      // 【Given】: 10人参加状態
      // 【テスト目的】: 最大負荷時の画面共有性能確認
      // 【期待動作】: 全10人への正確な通知、処理遅延なし

      const clients = await createConnectedParticipants(10);
      
      const allNotifiedPromise = Promise.all(
        clients.slice(1).map(client => new Promise<string>((resolve) => {
          client.on('screen-share-started', resolve);
        }))
      );

      const startTime = Date.now();

      // 【When】: 最大参加者での画面共有開始
      await new Promise<void>((resolve) => {
        clients[0].emit('request-screen-share', (response: any) => {
          expect(response.success).toBe(true);
          resolve();
        });
      });

      // 【Then】: 全参加者への通知確認
      const notificationResults = await allNotifiedPromise;
      const processingTime = Date.now() - startTime;

      expect(notificationResults).toHaveLength(9); // 残り9人への通知
      expect(processingTime).toBeLessThan(500); // NFR-002: 500ms以内
      expect(notificationResults.every(id => id)).toBe(true); // 全通知の成功
    });

    test('SCREEN-BOUNDARY-002: 画面共有開始処理が500ms以内で完了する', async () => {
      // 【Given】: 高負荷状態（9人参加）
      // 【テスト目的】: 画面共有性能要件の遵守確認
      // 【期待動作】: 500ms以内の開始完了

      const clients = await createConnectedParticipants(9);
      
      const startTime = Date.now();

      // 【When】: 高負荷状態での画面共有開始
      await new Promise<void>((resolve) => {
        clients[0].emit('request-screen-share', (response: any) => {
          expect(response.success).toBe(true);
          resolve();
        });
      });

      const processingTime = Date.now() - startTime;

      // 【Then】: NFR-002要件の確認
      expect(processingTime).toBeLessThan(500); // 画面共有遅延500ms以内
    });

    test('SCREEN-BOUNDARY-003: 長時間（1時間相当）の画面共有セッションが安定して維持される', async () => {
      // 【Given】: 画面共有開始状態
      // 【テスト目的】: 長時間セッションでの安定性確認
      // 【期待動作】: 1時間相当の状態維持、メモリリークなし

      const [client1] = await createConnectedParticipants(1);
      
      // 【画面共有開始】: 長時間セッションの開始
      await new Promise<void>((resolve) => {
        client1.emit('request-screen-share', (response: any) => {
          expect(response.success).toBe(true);
          resolve();
        });
      });

      const screenShareManager = getScreenShareManager();
      const initialMemoryUsage = process.memoryUsage().heapUsed;

      // 【長時間シミュレーション】: 1時間相当の状態維持（短縮実行）
      for (let i = 0; i < 60; i++) { // 60回のステータスチェック（1時間相当）
        await new Promise(resolve => setTimeout(resolve, 10)); // 短縮間隔
        expect(screenShareManager.isScreenSharingActive()).toBe(true);
      }

      const finalMemoryUsage = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemoryUsage - initialMemoryUsage;

      // 【Then】: 長時間安定性の確認
      expect(screenShareManager.isScreenSharingActive()).toBe(true);
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024); // 10MB未満のメモリ増加
    });

    test('SCREEN-BOUNDARY-004: 複数参加者からの同時画面共有リクエストで先着順制御が正確に動作する', async () => {
      // 【Given】: 2人の参加者が在室
      // 【テスト目的】: 排他制御の精度確認
      // 【期待動作】: 先着順の正確な判定、1人許可・1人拒否

      const [client1, client2] = await createConnectedParticipants(2);

      // 【When】: 同時画面共有リクエスト送信
      const response1Promise = new Promise<any>((resolve) => {
        client1.emit('request-screen-share', resolve);
      });

      const response2Promise = new Promise<any>((resolve) => {
        client2.emit('request-screen-share', resolve);
      });

      const [response1, response2] = await Promise.all([response1Promise, response2Promise]);

      // 【Then】: 先着順制御の確認
      const grantedResponses = [response1, response2].filter(r => r.granted);
      const deniedResponses = [response1, response2].filter(r => !r.granted);

      expect(grantedResponses).toHaveLength(1); // 1人のみ許可
      expect(deniedResponses).toHaveLength(1); // 1人は拒否
      expect(deniedResponses[0].error.code).toBe('SCREEN_SHARE_IN_USE');
      
      // 【状態確認】: 最終的に1人のみ画面共有中
      const screenShareManager = getScreenShareManager();
      expect(screenShareManager.isScreenSharingActive()).toBe(true);
    });

    test('SCREEN-BOUNDARY-005: null/undefined値を含む画面共有リクエストで適切なエラーが返される', async () => {
      // 【Given】: 正常参加者の存在
      // 【テスト目的】: データ検証機能の完全性確認
      // 【期待動作】: 無効データの確実な検出と拒否

      const [client1] = await createConnectedParticipants(1);

      const errorEventPromise = new Promise<any>((resolve) => {
        client1.on('screen-share-error', resolve);
      });

      // 【When】: null/undefined値での画面共有リクエスト
      // @ts-ignore - 意図的な型違反テスト
      client1.emit('request-screen-share', null);

      // 【Then】: バリデーションエラーの確認
      const errorResponse = await errorEventPromise;
      expect(errorResponse.code).toBe('VALIDATION_ERROR');
      expect(errorResponse.message).toContain('無効なリクエスト形式');
      
      // 【状態確認】: 無効リクエストによる状態変更なし
      const screenShareManager = getScreenShareManager();
      expect(screenShareManager.isScreenSharingActive()).toBe(false);
    });
  });
});