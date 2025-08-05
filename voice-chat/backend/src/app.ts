import express from 'express';
import cors from 'cors';
import { createServer as createHttpServer, Server } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { testDatabaseConnection } from './database';
import { config } from './config';
import { connectionManager } from './connection-manager';
import { getRoomManager } from './room-manager';
import { RoomJoinedData, ErrorData, ConnectionInfo } from './types';
import { getSignalingHandler, SignalData, IceCandidateData } from './signaling-handler';
import { getScreenShareManager, ScreenShareResponse } from './screen-share-manager';

/**
 * 【機能概要】: Express + Socket.IOサーバー基盤の設定と管理
 * 【実装方針】: テストを通すための最小限の設定で、後のREFACTOR段階で詳細化
 * 【テスト対応】: 全13テストケースを通すためのExpress基盤とSocket.IO統合実装
 * 🟢 信頼性レベル: requirements.mdとNFR要件に基づく
 */

/**
 * 【接続管理】: Socket.IO接続数の管理（NFR-004: 最大10接続制限）
 * 【改善内容】: グローバル変数からクラスベース管理への移行
 * 【設計改善】: 単一責任原則に基づく接続管理の分離
 * 【テスタビリティ】: 接続状態の詳細な追跡と管理
 */

/**
 * 【機能概要】: Expressアプリケーションを初期化し、必要なミドルウェアと API エンドポイントを設定
 * 【実装方針】: CORS設定、JSON解析、健康チェックエンドポイントの最小限実装
 * 【テスト対応】: createApp()テスト、健康チェックAPIテスト、CORSテストを通すための実装
 * 🟢 信頼性レベル: REQ-001、NFR-103 CORS要件に基づく
 * @returns {express.Application} - 設定済みExpressアプリケーションインスタンス
 */
export function createApp(): express.Application {
  // 【Expressインスタンス作成】: 基本的なWebサーバーアプリケーションの初期化
  const app = express();

  // 【CORS設定】: フロントエンド接続許可とセキュリティ設定（NFR-103要件対応）
  // 【改善内容】: 設定の外部化により環境別制御を可能にする
  app.use(
    cors({
      origin: config.CORS_ORIGINS, // 【設定外部化】: 環境変数による動的オリジン制御
      credentials: true, // 【認証情報許可】: 将来的な認証機能のための設定
    })
  );

  // 【JSON解析】: APIリクエストボディの解析設定
  app.use(express.json()); // 【ミドルウェア】: JSON形式のリクエストボディ解析

  // 【健康チェックエンドポイント】: GET /health API の実装
  // 【テスト対応】: 健康チェックAPIテスト、応答時間テスト、データ完全性テストを通すための実装
  app.get('/health', async (_req, res) => {
    // 【レスポンス時間測定開始】: NFR-003（1秒以内応答）要件への対応
    // const startTime = Date.now(); // 未使用だが将来のパフォーマンス監視で使用予定

    try {
      // 【データベース接続確認】: 健康チェックにDB状態を反映
      const dbConnected = await testDatabaseConnection();

      // 【レスポンス構造作成】: テストで期待される正確なJSON構造
      // 【null/undefined回避】: 境界値テストでのデータ完全性確保
      const healthResponse = {
        status: dbConnected ? 'healthy' : 'unhealthy', // 【状態判定】: DB接続状態に基づく全体状態
        timestamp: new Date().toISOString(), // 【タイムスタンプ】: ISO形式での現在時刻
        version: '1.0.0', // 【バージョン情報】: アプリケーションバージョン（固定値）
        database: dbConnected ? 'connected' : 'disconnected', // 【DB状態】: 接続確認結果の反映
        socketIO: 'active', // 【Socket.IO状態】: 現段階では常にアクティブ（簡単実装）
      };

      // 【応答時間確認】: NFR-003要件の1秒以内制限確認
      // const responseTime = Date.now() - startTime; // 未使用だが将来のパフォーマンス監視で使用予定

      // 【HTTPステータス決定】: DB接続状態に基づくステータスコード設定
      const statusCode = dbConnected ? 200 : 503;

      // 【エラー情報追加】: 503エラー時の詳細情報
      if (!dbConnected) {
        (healthResponse as Record<string, unknown>).error = 'Database connection failed'; // 【エラーメッセージ】: テストで期待されるエラー詳細
      }

      // 【レスポンス送信】: Content-Typeヘッダー自動設定でJSON形式レスポンス
      res.status(statusCode).json(healthResponse);
    } catch (error) {
      // 【例外処理】: 予期しないエラーの場合の500エラーレスポンス
      // 【エラーレスポンス】: 最小限のエラー情報でセキュリティ配慮
      res.status(500).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        database: 'error',
        socketIO: 'active',
        error: 'Internal server error', // 【汎用エラー】: 詳細情報は隠蔽
      });
    }
  });

  return app; // 【アプリケーション返却】: 設定完了したExpressインスタンス
}

/**
 * 【機能概要】: HTTPサーバーとSocket.IOサーバーを統合して作成
 * 【実装方針】: ExpressアプリケーションをベースにSocket.IO統合、接続数制限実装
 * 【テスト対応】: createServer()テスト、Socket.IO接続テスト、最大接続数テスト、接続制限テストを通すための実装
 * 🟢 信頼性レベル: REQ-406 Socket.IO要件、NFR-004 最大接続数要件に基づく
 * @param {express.Application} app - 設定済みExpressアプリケーション
 * @returns {Object} - HTTPサーバーとSocket.IOサーバーのインスタンス
 */
export function createServer(app: express.Application): {
  httpServer: Server;
  socketIOServer: SocketIOServer;
} {
  // 【HTTPサーバー作成】: Expressアプリケーションを基にしたHTTPサーバー初期化
  const httpServer = createHttpServer(app);

  // 【Socket.IOサーバー作成】: HTTPサーバーに統合されたWebSocketサーバー
  // 【CORS設定】: Socket.IOレベルでのCORS設定（Expressと同期）
  // 【改善内容】: 設定の一元化によりExpress設定との整合性保証
  const socketIOServer = new SocketIOServer(httpServer, {
    cors: {
      origin: config.CORS_ORIGINS, // 【設定一元化】: Express設定と同一ソースから取得
      credentials: true,
    },
  });

  // 【接続認証ミドルウェア】: Socket.IO接続を許可（ルーム参加時に制限）
  // 【変更理由】: テストでは接続後にjoin-roomイベントでroom-fullエラーを期待するため
  // socketIOServer.use() によるミドルウェア制限は削除し、ルーム参加時に制限を実施

  // 【接続イベントハンドラー】: 新規クライアント接続時の処理
  // 【テスト対応】: Socket.IO接続テスト、最大接続数テスト、接続制限テストのための実装
  // 【改善内容】: ConnectionManagerによる詳細な接続情報管理
  socketIOServer.on('connection', (socket) => {
    // 【接続登録】: ConnectionManagerによる詳細な接続情報追跡
    connectionManager.addConnection(socket.id, {
      userAgent: socket.handshake.headers['user-agent'],
      ipAddress: socket.handshake.address,
    });

    // 【ルーム管理インスタンス取得】: シングルトンパターンでのRoomManager取得
    const roomManager = getRoomManager();

    // 【シグナリングハンドラー取得】: シングルトンパターンでのSignalingHandler取得
    const signalingHandler = getSignalingHandler();

    // 【画面共有マネージャー取得】: シングルトンパターンでのScreenShareManager取得
    const screenShareManager = getScreenShareManager();

    // 【配信失敗コールバック設定】: 配信失敗時のSocket.IOイベント送信
    screenShareManager.setDeliveryFailureCallback((_participantId: string) => {
      socket.emit('screen-share-delivery-failed', {
        code: 'DELIVERY_FAILED',
        message: '画面共有の配信に失敗しました',
        autoRetry: true,
      });
    });

    /**
     * 【ルーム参加処理】: Socket.IOクライアントのルーム参加を処理
     * 【改善内容】: エラーハンドリングの統一化、処理の明確化
     * 【設計方針】: 単一責任原則に基づく関数分離
     * 【セキュリティ】: 入力値の検証とエラー情報の適切な制御
     * 🟢 信頼性レベル: REQ-001, REQ-004要件に基づく実装
     */
    const handleJoinRoom = async (): Promise<void> => {
      try {
        // 【容量チェック】: ルーム満員状態を事前にチェック
        if (roomManager.isRoomFull()) {
          const errorData: ErrorData = {
            code: 'ROOM_FULL',
            message: `Room has reached maximum capacity of ${roomManager.getMaxCapacity()} participants`,
          };
          socket.emit('room-full', errorData);
          return;
        }

        // 【接続情報収集】: セキュリティとログ用の接続詳細
        const connectionInfo: ConnectionInfo = {
          userAgent: socket.handshake.headers['user-agent'],
          ipAddress: socket.handshake.address,
        };

        // 【参加者追加】: RoomManagerへの参加者追加処理
        // 重複チェックはRoomManager内で実施
        const participant = await roomManager.addParticipant(socket.id, connectionInfo);

        // 【参加者リスト取得】: 現在の全参加者情報
        const participants = Array.from(roomManager.getParticipants().values());

        // 【成功レスポンス送信】: 参加成功の通知
        const roomJoinedData: RoomJoinedData = {
          success: true,
          participant,
          participants,
        };
        socket.emit('room-joined', roomJoinedData);

        // 【ブロードキャスト通知】: 他の参加者への新規参加通知
        socket.broadcast.emit('user-joined', participant);

        // 【画面共有状態同期】: 現在の画面共有状態を新規参加者に通知
        const currentSharingParticipant = screenShareManager.getCurrentScreenSharingParticipant();
        if (currentSharingParticipant) {
          socket.emit('screen-share-started', currentSharingParticipant);
        }
      } catch (error) {
        // 【エラー処理】: 参加失敗時の適切なエラーハンドリング
        handleJoinRoomError(socket, error);
      }
    };

    /**
     * 【ルーム参加エラー処理】: エラー種別に応じた適切なレスポンス
     * 【改善内容】: エラー処理の一元化と分類
     * 【セキュリティ】: 本番環境での詳細エラー情報の隠蔽
     * 🟡 信頼性レベル: 一般的なエラーハンドリングパターン
     */
    const handleJoinRoomError = (socket: Socket, error: unknown): void => {
      // 【エラーログ】: 開発・運用時のデバッグ用詳細ログ
      console.error('Error joining room:', error);

      // 【エラー分類】: エラーメッセージからエラータイプを判定
      const errorMessage = error instanceof Error ? error.message : 'Failed to join room';
      const isRoomFull = errorMessage.includes('maximum capacity');

      // 【エラーレスポンス作成】: クライアント向けエラー情報
      const errorData: ErrorData = {
        code: isRoomFull ? 'ROOM_FULL' : 'JOIN_FAILED',
        message: isRoomFull
          ? `Room has reached maximum capacity of ${roomManager.getMaxCapacity()} participants`
          : 'Failed to join room', // 【セキュリティ】: 詳細エラーは隠蔽
      };

      // 【エラー通知】: クライアントへのエラー送信
      socket.emit('room-full', errorData);
    };

    /**
     * 【切断処理】: Socket.IO切断時のクリーンアップ
     * 【改善内容】: エラーハンドリングの改善、処理の明確化
     * 【設計方針】: 確実なリソース解放と状態同期
     * 🟢 信頼性レベル: Socket.IO標準的な切断処理パターン
     */
    const handleDisconnect = async (): Promise<void> => {
      try {
        // 【参加者検索】: 切断したSocketIDの参加者を検索
        const participant = roomManager.getParticipantBySocketId(socket.id);

        if (participant) {
          // 【画面共有自動停止処理】: 画面共有中の参加者切断時の自動停止
          if (screenShareManager.getCurrentScreenSharingParticipant() === participant.id) {
            screenShareManager.onParticipantDisconnected(participant.id);
            // 全参加者への画面共有停止通知
            socketIOServer.emit('screen-share-stopped', participant.id);
          }

          // 【参加者削除】: RoomManagerからの参加者削除
          await roomManager.removeParticipant(participant.id);

          // 【退出通知】: 他の参加者への退出通知
          socket.broadcast.emit('user-left', participant);
        }
      } catch (error) {
        // 【エラーログ】: 切断処理エラーの記録（クライアントへは通知しない）
        console.error('Error handling disconnect:', error);
      } finally {
        // 【接続管理クリーンアップ】: ConnectionManagerからの接続削除
        // エラーが発生しても必ず実行
        connectionManager.removeConnection(socket.id);
      }
    };

    /**
     * 【Offerイベントハンドラー】: WebRTC Offerメッセージの中継処理
     * 【実装方針】: SignalingHandlerによる中継とエラーハンドリング
     * 🟢 信頼性レベル: TASK-103シグナリング要件に基づく
     */
    const handleOffer = (signalingData: SignalData): void => {
      signalingHandler.handleOffer(
        socket.id,
        signalingData,
        (targetSocketId: string, event: string, data: any) => {
          // エラーイベントは送信者に、通常のイベントは宛先に送信
          if (event === 'signaling-error') {
            socket.emit(event, data);
          } else {
            socketIOServer.to(targetSocketId).emit(event, data);
          }
        }
      );
    };

    /**
     * 【Answerイベントハンドラー】: WebRTC Answerメッセージの中継処理
     * 【実装方針】: SignalingHandlerによる中継とエラーハンドリング
     * 🟢 信頼性レベル: TASK-103シグナリング要件に基づく
     */
    const handleAnswer = (signalingData: SignalData): void => {
      signalingHandler.handleAnswer(
        socket.id,
        signalingData,
        (targetSocketId: string, event: string, data: any) => {
          // エラーイベントは送信者に、通常のイベントは宛先に送信
          if (event === 'signaling-error') {
            socket.emit(event, data);
          } else {
            socketIOServer.to(targetSocketId).emit(event, data);
          }
        }
      );
    };

    /**
     * 【ICE候補イベントハンドラー】: ICE候補メッセージの中継処理
     * 【実装方針】: SignalingHandlerによる中継とエラーハンドリング
     * 🟢 信頼性レベル: TASK-103シグナリング要件に基づく
     */
    const handleIceCandidate = (iceCandidateData: IceCandidateData): void => {
      signalingHandler.handleIceCandidate(
        socket.id,
        iceCandidateData,
        (targetSocketId: string, event: string, data: any) => {
          // エラーイベントは送信者に、通常のイベントは宛先に送信
          if (event === 'signaling-error') {
            socket.emit(event, data);
          } else {
            socketIOServer.to(targetSocketId).emit(event, data);
          }
        }
      );
    };

    /**
     * 【画面共有開始イベントハンドラー】: 画面共有開始リクエストの処理
     * 【実装方針】: ScreenShareManagerによる排他制御とエラーハンドリング
     * 🟢 信頼性レベル: TASK-104画面共有制御要件に基づく
     */
    const handleRequestScreenShare = async (
      callback?: (response: ScreenShareResponse) => void
    ): Promise<void> => {
      try {
        // バリデーション: コールバック関数の存在確認
        if (!callback || typeof callback !== 'function') {
          socket.emit('screen-share-error', {
            code: 'VALIDATION_ERROR',
            message: '無効なリクエスト形式です',
          });
          return;
        }

        const response = await screenShareManager.requestScreenShare(socket.id);

        if (response.success && response.granted) {
          // 全参加者への画面共有開始通知
          const participant = roomManager.getParticipantBySocketId(socket.id);
          if (participant) {
            socketIOServer.emit('screen-share-started', participant.id);
          }
        } else if (response.error) {
          // エラーの場合は送信者にのみエラー通知
          socket.emit('screen-share-error', response.error);
        }

        callback(response);
      } catch (error) {
        const errorResponse: ScreenShareResponse = {
          success: false,
          granted: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: '内部エラーが発生しました',
          },
        };
        socket.emit('screen-share-error', errorResponse.error);
        if (callback) callback(errorResponse);
      }
    };

    /**
     * 【画面共有停止イベントハンドラー】: 画面共有停止リクエストの処理
     * 【実装方針】: ScreenShareManagerによる権限確認とエラーハンドリング
     * 🟢 信頼性レベル: TASK-104画面共有制御要件に基づく
     */
    const handleStopScreenShare = async (): Promise<void> => {
      try {
        const result = await screenShareManager.stopScreenShare(socket.id);

        if (result.success) {
          // 全参加者への画面共有停止通知
          const participant = roomManager.getParticipantBySocketId(socket.id);
          if (participant) {
            socketIOServer.emit('screen-share-stopped', participant.id);
          }
        } else if (result.error) {
          // エラーの場合は送信者にのみエラー通知
          socket.emit('screen-share-error', result.error);
        }
      } catch (error) {
        socket.emit('screen-share-error', {
          code: 'INTERNAL_ERROR',
          message: '内部エラーが発生しました',
        });
      }
    };

    // 【イベントハンドラー登録】: Socket.IOイベントリスナーの設定
    socket.on('join-room', handleJoinRoom);
    socket.on('disconnect', handleDisconnect);
    socket.on('offer', handleOffer);
    socket.on('answer', handleAnswer);
    socket.on('ice-candidate', handleIceCandidate);
    socket.on('request-screen-share', handleRequestScreenShare);
    socket.on('stop-screen-share', handleStopScreenShare);
  });

  // 【サーバーインスタンス返却】: テストで期待される構造でのオブジェクト返却
  return {
    httpServer, // 【HTTPサーバー】: Express統合HTTPサーバー
    socketIOServer, // 【Socket.IOサーバー】: WebSocket通信サーバー
  };
}

/**
 * 【機能概要】: システム全体の健康状態を取得する（REFACTOR段階で詳細化）
 * 【改善内容】: ConnectionManagerによる詳細な接続統計情報の提供
 * 【実装方針】: 運用監視とデバッグに有用な詳細情報を提供
 * 【テスト対応】: 現在のテストでは直接使用されていないが、一貫性のための実装
 * 🟢 信頼性レベル: ConnectionManager実装に基づく
 */
export function getHealthStatus(): {
  status: string;
  connections: number;
  maxConnections: number;
  availableConnections: number;
  connectionStats: ReturnType<typeof connectionManager.getConnectionsStats>;
} {
  // 【詳細実装】: ConnectionManagerからの統計情報取得
  const connectionStats = connectionManager.getConnectionsStats();

  return {
    status: 'active',
    connections: connectionStats.total,
    maxConnections: connectionStats.maxConnections,
    availableConnections: connectionStats.available,
    connectionStats: connectionStats, // 【詳細統計】: 運用監視用の詳細情報
  };
}

/**
 * 【機能概要】: テスト用の接続数リセット関数
 * 【改善内容】: ConnectionManagerのresetメソッドを使用した統一的なリセット
 * 【実装方針】: テスト間での状態クリーンアップのためのユーティリティ関数
 * 【テスト対応】: 接続数制限テストが正常に動作するための実装
 * 🟢 信頼性レベル: ConnectionManager実装に基づく
 */
export function resetConnectionCount(): void {
  connectionManager.reset();
}

/**
 * 【RoomManager取得】: テスト用のRoomManagerインスタンス取得関数
 * 【シングルトン】: アプリケーション全体で共有するRoomManagerインスタンス
 */
export { getRoomManager };

/**
 * 【SignalingHandler取得】: テスト用のSignalingHandlerインスタンス取得関数
 * 【シングルトン】: アプリケーション全体で共有するSignalingHandlerインスタンス
 */
export { getSignalingHandler };
