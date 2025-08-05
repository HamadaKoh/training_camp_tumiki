import { Server } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { Socket as SocketIOClient, io } from 'socket.io-client';
import express from 'express';
import { createApp, createServer, resetConnectionCount, getRoomManager } from '../app';
import { connectDatabase, disconnectDatabase } from '../database';
import { pool } from '../database';
import { RoomManager, clearRoomParticipants } from '../room-manager';

// 【TDD実装】: TASK-102: ルーム管理機能実装 - RED段階のテストファイル
// 【目的】: 包括的な失敗テストによる要件駆動実装の実現
// 【技術スタック】: TypeScript + Jest + Supertest + Socket.IO Client + PostgreSQL
// 【RED段階】: 全21テストケースが初期状態で失敗し、実装を導くファーストテストコード

/**
 * 【型定義】: テスト用の型定義（実装段階でsrc/types.tsに移動予定）
 * 【設計方針】: テスト先行開発によるインターフェース設計
 */
interface Participant {
  id: string;                    // UUID v4形式の参加者ID
  socketId: string;              // Socket.IOクライアントID
  joinedAt: Date;               // 参加日時
  isMuted: boolean;             // ミュート状態
  isSharingScreen: boolean;     // 画面共有状態
  connectionQuality: string;    // 接続品質 ('good' | 'fair' | 'poor')
}

interface RoomJoinedData {
  success: boolean;
  participant: Participant;
  participants: Participant[];
}

interface ErrorData {
  code: string;
  message: string;
}

/**
 * 【RoomManagerクラス】: ルーム管理のコアクラス - 実装済み（GREEN段階）
 * 【実装済みメソッド】: 
 * - constructor() - 初期化
 * - addParticipant(socketId: string) - 参加者追加
 * - removeParticipant(participantId: string) - 参加者削除
 * - getParticipants() - 参加者リスト取得
 * - getCurrentParticipantCount() - 現在の参加者数
 * - isRoomFull() - ルーム満員状態確認
 * - getMaxCapacity() - 最大容量取得
 * - getAvailableSlots() - 利用可能スロット数
 * - getRoomId() - ルームID取得
 * - getRoomStats() - ルーム統計情報
 * - getParticipantBySocketId(socketId: string) - SocketIDでの参加者検索
 */

describe('TASK-102: ルーム管理機能実装 - TDD RED段階', () => {
  let httpServer: Server;
  let socketIOServer: SocketIOServer;
  let app: express.Application;
  
  beforeEach(async () => {
    // 【テスト前準備】: 各テスト実行前にクリーンなサーバー環境を準備
    // 【環境初期化】: 前のテストの影響を受けないよう、サーバーインスタンスと接続状態をリセット
    resetConnectionCount();
    
    // RoomManagerの状態クリア
    clearRoomParticipants();
    
    // データベースのクリーンアップ
    try {
      await connectDatabase();
      if (pool) {
        await pool.query('DELETE FROM sessions WHERE room_id = $1', ['default-room']);
      }
    } catch (error) {
      // Database might not be connected, ignore
    }
    
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

  // ===================================================================
  // 1. 正常系テストケース（Normal Operation Test Cases）- 9テスト
  // ===================================================================

  describe('正常系: RoomManagerクラス初期化とセットアップ', () => {
    
    test('ROOM-NORMAL-001: RoomManagerクラスが正常に初期化される', () => {
      // 【Given】: 初期化前の状態
      // 【テスト目的】: RoomManagerクラスのインスタンス生成と初期状態の確認
      // 【期待動作】: RoomManagerインスタンスが生成され、初期状態が正しく設定される
      
      // 【When】: RoomManagerクラスのインスタンス化
      const roomManager = new RoomManager();
      
      // 【Then】: 初期状態の確認
      expect(roomManager).toBeDefined();
      expect(roomManager.getParticipants().size).toBe(0);
      expect(roomManager.isRoomFull()).toBe(false);
      expect(roomManager.getRoomId()).toBe('default-room');
    });

    test('ROOM-NORMAL-002: RoomManagerが正しい初期設定で構成される', () => {
      // 【Given】: 初期化前の状態
      // 【テスト目的】: 設定値とデフォルト値の正確性を確認
      // 【期待動作】: 最大容量、参加者数、利用可能スロット数が正しく設定される
      
      // 【When】: RoomManagerクラスのインスタンス化
      const roomManager = new RoomManager();
      
      // 【Then】: 初期設定値の確認
      expect(roomManager.getMaxCapacity()).toBe(10);
      expect(roomManager.getCurrentParticipantCount()).toBe(0);
      expect(roomManager.getAvailableSlots()).toBe(10);
      expect(roomManager.getRoomStats()).toEqual({
        participantCount: 0,
        maxCapacity: 10,
        availableSlots: 10,
        isActive: true,
        createdAt: expect.any(Date)
      });
    });
  });

  describe('正常系: 参加者の入退室処理', () => {
    
    test('ROOM-NORMAL-003: 参加者が正常にルームに参加できる', async () => {
      // 【Given】: 初期化されたRoomManager
      // 【テスト目的】: 新規参加者の追加処理と状態管理
      // 【期待動作】: Participantオブジェクトが生成され、ルームに追加される
      
      const roomManager = new RoomManager();
      const mockSocketId = 'socket-123';
      
      // 【When】: 参加者の追加
      const participant = await roomManager.addParticipant(mockSocketId);
      
      // 【Then】: 参加者情報の確認
      expect(participant).toBeDefined();
      expect(participant.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i); // UUID v4
      expect(participant.socketId).toBe(mockSocketId);
      expect(participant.joinedAt).toBeInstanceOf(Date);
      expect(participant.isMuted).toBe(false);
      expect(participant.isSharingScreen).toBe(false);
      expect(participant.connectionQuality).toBe('good');
      
      expect(roomManager.getCurrentParticipantCount()).toBe(1);
      expect(roomManager.getParticipants().has(participant.id)).toBe(true);
    });

    test('ROOM-NORMAL-004: PostgreSQLにセッション記録が正常に保存される', async () => {
      // 【Given】: データベース接続とRoomManager初期化
      // 【テスト目的】: データベースへのセッション情報永続化
      // 【期待動作】: 参加者データがPostgreSQLに正確に保存される
      
      await connectDatabase();
      const roomManager = new RoomManager();
      const mockSocketId = 'socket-456';
      
      // 【When】: 参加者の追加
      const participant = await roomManager.addParticipant(mockSocketId);
      
      // 【Then】: データベース記録の確認
      const sessionRecord = await pool!.query(
        'SELECT * FROM sessions WHERE participant_id = $1',
        [participant.id]
      );
      
      expect(sessionRecord.rows).toHaveLength(1);
      expect(sessionRecord.rows[0]).toMatchObject({
        participant_id: participant.id,
        socket_id: mockSocketId,
        room_id: 'default-room',
        joined_at: expect.any(Date),
        left_at: null,
        user_agent: expect.any(String),
        ip_address: expect.any(String)
      });
    });

    test('ROOM-NORMAL-005: 参加者が正常にルームから退出できる', async () => {
      // 【Given】: 参加者が追加されたRoomManager
      // 【テスト目的】: 参加者の退出処理と状態更新
      // 【期待動作】: 参加者がルームから削除され、参加者数が減少する
      
      const roomManager = new RoomManager();
      const mockSocketId = 'socket-789';
      const participant = await roomManager.addParticipant(mockSocketId);
      
      // 【When】: 参加者の削除
      await roomManager.removeParticipant(participant.id);
      
      // 【Then】: 退出状態の確認
      expect(roomManager.getCurrentParticipantCount()).toBe(0);
      expect(roomManager.getParticipants().has(participant.id)).toBe(false);
      expect(roomManager.getParticipantBySocketId(mockSocketId)).toBeUndefined();
    });

    test('ROOM-NORMAL-006: 退出時にPostgreSQLのleft_atが更新される', async () => {
      // 【Given】: データベース接続と参加者が追加されたRoomManager
      // 【テスト目的】: データベースでの退出記録更新
      // 【期待動作】: left_atフィールドが現在時刻で更新される
      
      await connectDatabase();
      const roomManager = new RoomManager();
      const mockSocketId = 'socket-999';
      const participant = await roomManager.addParticipant(mockSocketId);
      
      // 【When】: 参加者の削除
      await roomManager.removeParticipant(participant.id);
      
      // 【Then】: データベース更新の確認
      const sessionRecord = await pool!.query(
        'SELECT * FROM sessions WHERE participant_id = $1',
        [participant.id]  
      );
      
      expect(sessionRecord.rows[0].left_at).toBeInstanceOf(Date);
      expect(sessionRecord.rows[0].left_at).not.toBeNull();
    });

    test('ROOM-NORMAL-007: 参加者リストが正確に取得できる', async () => {
      // 【Given】: 複数参加者を想定したRoomManager
      // 【テスト目的】: 参加者一覧の取得と内容確認
      // 【期待動作】: 全参加者が正確にMapで管理され、取得できる
      
      const roomManager = new RoomManager();
      const participants = [];
      
      // 【When】: 複数参加者の追加
      for (let i = 0; i < 3; i++) {
        const participant = await roomManager.addParticipant(`socket-${i}`);
        participants.push(participant);
      }
      
      // 【Then】: 参加者リストの確認
      const participantMap = roomManager.getParticipants();
      const participantList = Array.from(participantMap.values());
      
      expect(participantMap.size).toBe(3);
      expect(participantList).toHaveLength(3);
      participants.forEach(participant => {
        expect(participantMap.has(participant.id)).toBe(true);
        expect(participantMap.get(participant.id)).toEqual(participant);
      });
    });
  });

  describe('正常系: Socket.IOイベント統合', () => {
    
    test('ROOM-NORMAL-008: join-roomイベントが正常に処理される', (done) => {
      // 【Given】: Socket.IOサーバーが起動している状態
      // 【テスト目的】: Socket.IOイベントハンドラーとの統合
      // 【期待動作】: join-roomイベントでroom-joinedレスポンスが返される
      
      const port = 3005;
      httpServer.listen(port, () => {
        const client = io(`http://localhost:${port}`);
        
        client.on('room-joined', (data: RoomJoinedData) => {
          // 【Then】: イベントレスポンスの確認
          expect(data.success).toBe(true);
          expect(data.participant).toBeDefined();
          expect(data.participant.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
          expect(data.participants).toHaveLength(1);
          
          client.disconnect();
          done();
        });
        
        // 【When】: join-roomイベントの送信
        client.emit('join-room');
      });
    });

    test('ROOM-NORMAL-009: user-joinedイベントが他の参加者に配信される', (done) => {
      // 【Given】: 既存参加者がいるSocket.IOサーバー
      // 【テスト目的】: 新規参加者の通知機能
      // 【期待動作】: 新規参加者がjoinした際、既存参加者にuser-joinedイベントが配信される
      
      const port = 3006;
      httpServer.listen(port, () => {
        const client1 = io(`http://localhost:${port}`);
        const client2 = io(`http://localhost:${port}`);
        
        let client1Joined = false;
        
        client1.on('room-joined', () => {
          client1Joined = true;
          // 【When】: Client2の参加
          client2.emit('join-room');
        });
        
        client1.on('user-joined', (participant: Participant) => {
          // 【Then】: 通知イベントの確認
          expect(participant).toBeDefined();
          expect(participant.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
          expect(client1Joined).toBe(true);
          
          client1.disconnect();
          client2.disconnect();
          done();
        });
        
        // Client1が最初に参加
        client1.emit('join-room');
      });
    });
  });

  // ===================================================================
  // 2. エラーハンドリングテストケース（Error Handling Test Cases）- 6テスト
  // ===================================================================

  describe('エラーハンドリング: ルーム容量制限', () => {
    
    test('ROOM-ERROR-001: ルーム満員時（11人目）に参加が拒否される', async () => {
      // 【Given】: 最大容量10人でルームが満員の状態
      // 【テスト目的】: 最大参加者数超過時のエラーハンドリング
      // 【期待動作】: 11人目の参加でROOM_FULLエラーが発生する
      
      const roomManager = new RoomManager();
      const participants = [];
      
      // ルームを満員にする
      for (let i = 0; i < 10; i++) {
        const participant = await roomManager.addParticipant(`socket-${i}`);
        participants.push(participant);
      }
      
      expect(roomManager.isRoomFull()).toBe(true);
      
      // 【When】: 11人目の参加試行
      // 【Then】: エラーの確認
      await expect(roomManager.addParticipant('socket-overflow'))
        .rejects
        .toThrow('Room is at maximum capacity');
      
      // 状態が変わらないことを確認
      expect(roomManager.getCurrentParticipantCount()).toBe(10);
      expect(roomManager.isRoomFull()).toBe(true);
    });

    test('ROOM-ERROR-002: 満員状態でのSocket.IO接続でroom-fullエラーが返される', async () => {
      // 【Given】: Socket.IOサーバーで10接続が確立済み
      // 【テスト目的】: Socket.IOレベルでの満員制御
      // 【期待動作】: 11番目の接続でroom-fullエラーイベントが発生する
      
      const port = 3007;
      await new Promise<void>((resolve) => {
        httpServer.listen(port, resolve);
      });
      
      const clients: SocketIOClient[] = [];
      
      // 10接続を確立
      for (let i = 0; i < 10; i++) {
        const client = io(`http://localhost:${port}`);
        clients.push(client);
        
        await new Promise<void>((resolve) => {
          client.on('room-joined', () => resolve());
          client.emit('join-room');
        });
      }
      
      // 【When】: 11番目の接続試行
      const overflowClient = io(`http://localhost:${port}`);
      
      // 【Then】: エラーイベントの確認
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('room-full event not received')), 1000);
        
        overflowClient.on('room-full', (error: ErrorData) => {
          clearTimeout(timeout);
          expect(error.code).toBe('ROOM_FULL');
          expect(error.message).toBe('Room has reached maximum capacity of 10 participants');
          resolve();
        });
        
        overflowClient.emit('join-room');
      });
      
      // クリーンアップ
      clients.forEach(c => c.disconnect());
      overflowClient.disconnect();
    });
  });

  describe('エラーハンドリング: データ検証とシステム障害', () => {
    
    test('ROOM-ERROR-003: 同一Socket IDでの重複参加が防止される', async () => {
      // 【Given】: 既に参加済みのSocket IDがある状態
      // 【テスト目的】: 重複参加制御機能
      // 【期待動作】: 同一Socket IDでの2回目の参加でエラーが発生する
      
      const roomManager = new RoomManager();
      const socketId = 'socket-duplicate';
      
      // 【When】: 最初の参加（成功）
      const participant1 = await roomManager.addParticipant(socketId);
      expect(participant1).toBeDefined();
      
      // 【When】: 2回目の参加（失敗）
      // 【Then】: 重複エラーの確認
      await expect(roomManager.addParticipant(socketId))
        .rejects
        .toThrow('Participant with socket ID socket-duplicate already exists');
        
      // 参加者数が1のままであることを確認
      expect(roomManager.getCurrentParticipantCount()).toBe(1);
    });

    test('ROOM-ERROR-004: データベース接続失敗時にトランザクションがロールバックされる', async () => {
      // 【Given】: データベース接続失敗をモックした状態
      // 【テスト目的】: データベース障害時の一貫性保証
      // 【期待動作】: DB失敗時にメモリ上の状態も元に戻される
      
      // データベース失敗をモック
      const originalPool = (require('../database') as any).pool;
      (require('../database') as any).pool = {
        query: jest.fn().mockRejectedValue(new Error('Database connection failed'))
      };
      
      const roomManager = new RoomManager();
      const socketId = 'socket-db-fail';
      
      // 【When】: 参加者追加試行
      // 【Then】: エラーとロールバックの確認
      await expect(roomManager.addParticipant(socketId))
        .rejects
        .toThrow('Database connection failed');
        
      // メモリ上にも参加者が追加されていないことを確認
      expect(roomManager.getCurrentParticipantCount()).toBe(0);
      expect(roomManager.getParticipantBySocketId(socketId)).toBeUndefined();
      
      // モックのクリーンアップ
      (require('../database') as any).pool = originalPool;
    });

    test('ROOM-ERROR-005: 無効な参加者データでバリデーションエラーが発生する', async () => {
      // 【Given】: 無効な入力データのテストケース
      // 【テスト目的】: 入力値検証とエラーハンドリング
      // 【期待動作】: 無効なSocket IDでバリデーションエラーが発生する
      
      const roomManager = new RoomManager();
      
      // 【When & Then】: 各種無効入力のテスト
      const invalidInputs = [
        { input: '', expectedError: 'Socket ID cannot be empty' },
        { input: null, expectedError: 'Socket ID must be a string' },
        { input: undefined, expectedError: 'Socket ID must be a string' },
        { input: 123, expectedError: 'Socket ID must be a string' },
        { input: ' ', expectedError: 'Socket ID cannot be empty' }
      ];
      
      for (const testCase of invalidInputs) {
        await expect(roomManager.addParticipant(testCase.input as any))
          .rejects
          .toThrow(testCase.expectedError);
      }
    });

    test('ROOM-ERROR-006: Socket切断時に自動的に参加者が削除される', (done) => {
      // 【Given】: Socket.IOクライアントが接続済み
      // 【テスト目的】: 突然の切断に対する自動回復機能
      // 【期待動作】: Socket切断で参加者が自動的にルームから削除される
      
      const port = 3008;
      httpServer.listen(port, () => {
        const client = io(`http://localhost:${port}`);
        let participantId: string;
        
        client.on('room-joined', (data: RoomJoinedData) => {
          participantId = data.participant.id;
          
          // 【When】: 突然の切断をシミュレート
          client.disconnect();
        });
        
        // 切断監視
        socketIOServer.on('connection', (socket) => {
          socket.on('disconnect', async () => {
            // 【Then】: 自動削除の確認
            setTimeout(() => {
              const roomManager = getRoomManager(); // シングルトンインスタンス取得（未実装）
              expect(roomManager.getCurrentParticipantCount()).toBe(0);
              expect(roomManager.getParticipants().has(participantId)).toBe(false);
              done();
            }, 100);
          });
        });
        
        client.emit('join-room');
      });
    });
  });

  // ===================================================================
  // 3. 境界値テストケース（Boundary Value Test Cases）- 6テスト
  // ===================================================================

  describe('境界値: 最大容量とエッジケース', () => {
    
    test('ROOM-BOUNDARY-001: ちょうど10人（最大容量）で正常動作する', async () => {
      // 【Given】: 空のRoomManager
      // 【テスト目的】: 最大容量での正常動作確認
      // 【期待動作】: 10人追加で満員状態になり、全機能が正常動作する
      
      const roomManager = new RoomManager();
      const participants = [];
      
      // 【When】: ちょうど10人を追加
      for (let i = 0; i < 10; i++) {
        const participant = await roomManager.addParticipant(`socket-${i}`);
        participants.push(participant);
      }
      
      // 【Then】: 最大容量での状態確認
      expect(roomManager.getCurrentParticipantCount()).toBe(10);
      expect(roomManager.isRoomFull()).toBe(true);
      expect(roomManager.getAvailableSlots()).toBe(0);
      
      // 全参加者が取得可能であることを確認
      participants.forEach(participant => {
        expect(roomManager.getParticipants().has(participant.id)).toBe(true);
      });
      
      // データベースにも10件のセッション記録があることを確認
      const sessionCount = await pool!.query('SELECT COUNT(*) FROM sessions WHERE room_id = $1', ['default-room']);
      expect(parseInt(sessionCount.rows[0].count)).toBe(10);
    });

    test('ROOM-BOUNDARY-002: 参加者0人から1人への遷移が正常動作する', async () => {
      // 【Given】: 空のRoomManager
      // 【テスト目的】: 空ルームから最初の参加者追加
      // 【期待動作】: 0→1人の境界で状態が正しく遷移する
      
      const roomManager = new RoomManager();
      expect(roomManager.getCurrentParticipantCount()).toBe(0);
      
      // 【When】: 最初の参加者追加
      const participant = await roomManager.addParticipant('socket-first');
      
      // 【Then】: 境界遷移の確認
      expect(roomManager.getCurrentParticipantCount()).toBe(1);
      expect(roomManager.isRoomFull()).toBe(false);
      expect(roomManager.getAvailableSlots()).toBe(9);
      expect(participant.id).toBeDefined();
    });

    test('ROOM-BOUNDARY-003: 最後の参加者（1人→0人）の退出が正常動作する', async () => {
      // 【Given】: 1人だけ参加している状態
      // 【テスト目的】: ルーム空状態への遷移
      // 【期待動作】: 1→0人の境界で空ルーム状態に正しく遷移する
      
      const roomManager = new RoomManager();
      const participant = await roomManager.addParticipant('socket-last');
      expect(roomManager.getCurrentParticipantCount()).toBe(1);
      
      // 【When】: 最後の参加者の退出
      await roomManager.removeParticipant(participant.id);
      
      // 【Then】: 空ルーム状態の確認
      expect(roomManager.getCurrentParticipantCount()).toBe(0);
      expect(roomManager.isRoomFull()).toBe(false);
      expect(roomManager.getAvailableSlots()).toBe(10);
      expect(roomManager.getParticipants().size).toBe(0);
    });
  });

  describe('境界値: NULL値とデータ長制限', () => {
    
    test('ROOM-BOUNDARY-004: null/undefined参加者データの適切な処理', async () => {
      // 【Given】: 初期化されたRoomManager
      // 【テスト目的】: NULL値境界での動作確認
      // 【期待動作】: null/undefined値で適切なエラーハンドリングが行われる
      
      const roomManager = new RoomManager();
      
      // 【When & Then】: null値の処理確認
      expect(roomManager.getParticipantBySocketId(null as any)).toBeUndefined();
      expect(roomManager.getParticipantBySocketId(undefined as any)).toBeUndefined();
      expect(roomManager.getParticipantBySocketId('')).toBeUndefined();
      
      // null/undefined での削除処理エラー確認
      await expect(roomManager.removeParticipant(null as any))
        .rejects.toThrow('Participant ID cannot be null or undefined');
      await expect(roomManager.removeParticipant(undefined as any))
        .rejects.toThrow('Participant ID cannot be null or undefined');
    });

    test('ROOM-BOUNDARY-005: 長い参加者名・無効データの境界値処理', async () => {
      // 【Given】: 極端に長いSocket IDや特殊文字を含むID
      // 【テスト目的】: データ長制限とバリデーション
      // 【期待動作】: 長いIDや特殊文字IDでも正常に処理される
      
      const roomManager = new RoomManager();
      
      // 【When】: 極端に長いSocket IDでの参加
      const longSocketId = 'a'.repeat(1000);
      const participant = await roomManager.addParticipant(longSocketId);
      
      // 【Then】: 長いIDの処理確認（255文字に切り詰められる）
      expect(participant.socketId).toBe(longSocketId.substring(0, 255));
      expect(participant.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      
      // 【When】: 特殊文字を含むSocket IDでの参加
      const specialSocketId = 'socket-123!@#$%^&*()_+-=[]{}|;:,.<>?';
      const specialParticipant = await roomManager.addParticipant(specialSocketId);
      
      // 【Then】: 特殊文字IDの処理確認
      expect(specialParticipant.socketId).toBe(specialSocketId);
    });

    test('ROOM-BOUNDARY-006: データベーストランザクション境界での整合性', async () => {
      // 【Given】: データベース接続と並行処理を想定した環境
      // 【テスト目的】: 並行処理とトランザクション境界
      // 【期待動作】: 並行処理でもデータ整合性が保たれる
      
      await connectDatabase();
      const roomManager = new RoomManager();
      
      // 【When】: 並行参加者追加
      const concurrentPromises = [];
      for (let i = 0; i < 5; i++) {
        concurrentPromises.push(roomManager.addParticipant(`socket-concurrent-${i}`));
      }
      
      const participants = await Promise.all(concurrentPromises);
      
      // 【Then】: 並行処理結果の確認
      expect(participants).toHaveLength(5);
      expect(roomManager.getCurrentParticipantCount()).toBe(5);
      
      // データベース整合性確認
      const sessionRecords = await pool!.query('SELECT COUNT(*) FROM sessions WHERE room_id = $1', ['default-room']);
      expect(parseInt(sessionRecords.rows[0].count)).toBe(5);
      
      // 全セッション記録のparticipant_idが一意であることを確認
      const participantIds = await pool!.query('SELECT participant_id FROM sessions WHERE room_id = $1', ['default-room']);
      const uniqueIds = new Set(participantIds.rows.map((row: any) => row.participant_id));
      expect(uniqueIds.size).toBe(5);
    });
  });
});

/**
 * 【実装済み関数】: RoomManagerシングルトンインスタンス取得関数
 * 【実装完了】: app.tsから実装済みのgetRoomManager関数をインポート
 */

/**
 * 【テスト実行結果期待値】:
 * - 全21テストが初期状態でFAIL（RED段階の目的）
 * - 明確なエラーメッセージにより実装すべき機能が特定される
 * - テストは実装段階でのTDD開発を完全にガイドする設計
 * 
 * 【次の段階】: GREEN段階でのRoomManager実装
 * - src/room-manager.ts の作成
 * - Socket.IOイベントハンドラーの実装
 * - PostgreSQLセッション管理の実装
 * - エラーハンドリングとバリデーションの実装
 */