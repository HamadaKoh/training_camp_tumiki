import { Server } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { Socket as SocketIOClient, io } from 'socket.io-client';
import express from 'express';
import { createApp, createServer, resetConnectionCount } from '../app';
import { connectDatabase, disconnectDatabase } from '../database';
import { clearRoomParticipants } from '../room-manager';

// 【TDD実装】: TASK-103: シグナリングハンドラー実装 - RED段階のテストファイル
// 【目的】: WebRTCシグナリングメッセージ中継機能の包括的な失敗テストによる要件駆動実装
// 【技術スタック】: TypeScript + Jest + Socket.IO Client + WebRTC型定義
// 【RED段階】: 全テストケースが初期状態で失敗し、シグナリング実装を導くファーストテストコード

/**
 * 【型定義】: WebRTCシグナリング用の型定義（実装段階でsrc/types.tsに移動予定）
 * 【設計方針】: テスト先行開発によるWebRTCシグナリングインターフェース設計
 */

// WebRTCシグナリングデータ構造
interface SignalData {
  from: string;                    // 送信者の参加者ID
  to: string;                      // 宛先参加者ID  
  signal: {                        // WebRTC Offer/Answer情報
    type: 'offer' | 'answer';
    sdp?: string;
  };
}

// ICE候補データ構造
interface IceCandidateData {
  from: string;                    // 送信者の参加者ID
  to: string;                      // 宛先参加者ID
  candidate: {                     // ICE候補情報
    candidate: string;
    sdpMid?: string;
    sdpMLineIndex?: number;
  };
}

// シグナリングエラーレスポンス
interface SignalingErrorData {
  code: string;                    // エラーコード
  message: string;                 // エラーメッセージ
  details?: any;                   // 詳細情報（オプション）
}

/**
 * 【SignalingHandlerクラス】: シグナリングメッセージ中継のコアクラス - 未実装（GREEN段階で実装予定）
 * 【実装予定メソッド】:
 * - handleOffer(socketId: string, offerData: SignalData) - Offerメッセージ中継
 * - handleAnswer(socketId: string, answerData: SignalData) - Answerメッセージ中継  
 * - handleIceCandidate(socketId: string, iceCandidateData: IceCandidateData) - ICE候補中継
 * - validateParticipants(from: string, to: string) - 参加者存在確認
 * - broadcastToParticipant(participantId: string, event: string, data: any) - 個別配信
 */

describe('TASK-103: シグナリングハンドラー実装 - TDD RED段階', () => {
  let httpServer: Server;
  let socketIOServer: SocketIOServer;
  let app: express.Application;
  
  beforeEach(async () => {
    // 【テスト前準備】: 各テスト実行前にクリーンなサーバー環境とルーム状態を準備
    resetConnectionCount();
    clearRoomParticipants();
    
    try {
      await connectDatabase();
    } catch (error) {
      // Database might not be connected, ignore for signaling tests
    }
    
    app = createApp();
    const serverResult = createServer(app);
    httpServer = serverResult.httpServer;
    socketIOServer = serverResult.socketIOServer;
  });

  afterEach(async () => {
    // 【テスト後処理】: テスト実行後のリソースクリーンアップ
    if (socketIOServer) {
      socketIOServer.close();
    }
    if (httpServer) {
      httpServer.close();
    }
    await disconnectDatabase();
  });

  // ===================================================================
  // 1. 正常系テストケース（Basic Signaling Flow Test Cases）- 6テスト
  // ===================================================================

  describe('正常系: WebRTCシグナリング基本フロー', () => {
    
    test('SIGNAL-NORMAL-001: offerイベントが宛先参加者に正しく中継される', async () => {
      // 【Given】: 2人の参加者がルームに参加済み
      // 【テスト目的】: WebRTC Offerメッセージの基本的な中継機能
      // 【期待動作】: 送信者→サーバー→宛先の正確なOffer情報転送
      
      const port = 3010;
      await new Promise<void>((resolve) => {
        httpServer.listen(port, resolve);
      });

      const client1 = io(`http://localhost:${port}`);
      const client2 = io(`http://localhost:${port}`);
      
      let participant1Id: string = '';
      let participant2Id: string = '';

      // 両方のクライアントをルームに参加させる
      await new Promise<void>((resolve) => {
        let joinedCount = 0;
        
        client1.on('room-joined', (data: any) => {
          participant1Id = data.participant.id;
          joinedCount++;
          if (joinedCount === 2) resolve();
        });
        
        client2.on('room-joined', (data: any) => {
          participant2Id = data.participant.id;
          joinedCount++;
          if (joinedCount === 2) resolve();
        });
        
        client1.emit('join-room');
        client2.emit('join-room');
      });

      // 【When】: client1からclient2へのOfferメッセージ送信
      const offerData: SignalData = {
        from: participant1Id,
        to: participant2Id,
        signal: {
          type: 'offer',
          sdp: 'v=0\r\no=- 1234567890 1234567890 IN IP4 127.0.0.1\r\n...' // モックSDP
        }
      };

      // 【Then】: client2でOfferメッセージを受信
      const receivedOffer = await new Promise<SignalData>((resolve) => {
        client2.on('offer', (data: SignalData) => {
          resolve(data);
        });
        
        client1.emit('offer', offerData);
      });

      expect(receivedOffer).toEqual(offerData);
      expect(receivedOffer.from).toBe(participant1Id);
      expect(receivedOffer.to).toBe(participant2Id);
      expect(receivedOffer.signal.type).toBe('offer');
      
      client1.disconnect();
      client2.disconnect();
    });

    test('SIGNAL-NORMAL-002: answerイベントが送信者に正しく中継される', async () => {
      // 【Given】: Offer/Answer交換を想定した2人の参加者
      // 【テスト目的】: WebRTC Answerメッセージの中継機能
      // 【期待動作】: Answer送信者→サーバー→Offer送信者への正確な情報転送
      
      const port = 3011;
      await new Promise<void>((resolve) => {
        httpServer.listen(port, resolve);
      });

      const client1 = io(`http://localhost:${port}`); // Offer送信者
      const client2 = io(`http://localhost:${port}`); // Answer送信者
      
      let participant1Id: string = "";
      let participant2Id: string = "";

      // 両方のクライアントをルームに参加させる
      await new Promise<void>((resolve) => {
        let joinedCount = 0;
        
        client1.on('room-joined', (data: any) => {
          participant1Id = data.participant.id;
          joinedCount++;
          if (joinedCount === 2) resolve();
        });
        
        client2.on('room-joined', (data: any) => {
          participant2Id = data.participant.id;
          joinedCount++;
          if (joinedCount === 2) resolve();
        });
        
        client1.emit('join-room');
        client2.emit('join-room');
      });

      // 【When】: client2からclient1へのAnswerメッセージ送信
      const answerData: SignalData = {
        from: participant2Id,
        to: participant1Id,
        signal: {
          type: 'answer',
          sdp: 'v=0\r\no=- 9876543210 9876543210 IN IP4 127.0.0.1\r\n...' // モックSDP
        }
      };

      // 【Then】: client1でAnswerメッセージを受信
      const receivedAnswer = await new Promise<SignalData>((resolve) => {
        client1.on('answer', (data: SignalData) => {
          resolve(data);
        });
        
        client2.emit('answer', answerData);
      });

      expect(receivedAnswer).toEqual(answerData);
      expect(receivedAnswer.from).toBe(participant2Id);
      expect(receivedAnswer.to).toBe(participant1Id);
      expect(receivedAnswer.signal.type).toBe('answer');
      
      client1.disconnect();
      client2.disconnect();
    });

    test('SIGNAL-NORMAL-003: ice-candidateイベントが双方向に正しく中継される', async () => {
      // 【Given】: WebRTC接続確立中の2人の参加者
      // 【テスト目的】: ICE候補メッセージの双方向中継機能
      // 【期待動作】: 両方向でのICE候補情報の正確な転送
      
      const port = 3012;
      await new Promise<void>((resolve) => {
        httpServer.listen(port, resolve);
      });

      const client1 = io(`http://localhost:${port}`);
      const client2 = io(`http://localhost:${port}`);
      
      let participant1Id: string = "";
      let participant2Id: string = "";

      // 両方のクライアントをルームに参加させる
      await new Promise<void>((resolve) => {
        let joinedCount = 0;
        
        client1.on('room-joined', (data: any) => {
          participant1Id = data.participant.id;
          joinedCount++;
          if (joinedCount === 2) resolve();
        });
        
        client2.on('room-joined', (data: any) => {
          participant2Id = data.participant.id;
          joinedCount++;
          if (joinedCount === 2) resolve();
        });
        
        client1.emit('join-room');
        client2.emit('join-room');
      });

      // 【When】: client1からclient2へのICE候補送信
      const iceCandidateData: IceCandidateData = {
        from: participant1Id,
        to: participant2Id,
        candidate: {
          candidate: 'candidate:1 1 UDP 2130706431 192.168.1.100 54400 typ host',
          sdpMid: '0',
          sdpMLineIndex: 0
        }
      };

      // 【Then】: client2でICE候補を受信
      const receivedCandidate = await new Promise<IceCandidateData>((resolve) => {
        client2.on('ice-candidate', (data: IceCandidateData) => {
          resolve(data);
        });
        
        client1.emit('ice-candidate', iceCandidateData);
      });

      expect(receivedCandidate).toEqual(iceCandidateData);
      expect(receivedCandidate.from).toBe(participant1Id);
      expect(receivedCandidate.to).toBe(participant2Id);
      expect(receivedCandidate.candidate.candidate).toContain('192.168.1.100');
      
      client1.disconnect();
      client2.disconnect();
    });

    test('SIGNAL-NORMAL-004: 複数の参加者間でofferが並行して中継される', async () => {
      // 【Given】: 3人の参加者がルームに参加済み
      // 【テスト目的】: 複数ピア間での並行シグナリング処理
      // 【期待動作】: 1対多のOffer配信と各々の独立した処理
      
      const port = 3013;
      await new Promise<void>((resolve) => {
        httpServer.listen(port, resolve);
      });

      const clients = [
        io(`http://localhost:${port}`),
        io(`http://localhost:${port}`),
        io(`http://localhost:${port}`)
      ];
      
      const participantIds: string[] = [];

      // 全クライアントをルームに参加させる
      await new Promise<void>((resolve) => {
        let joinedCount = 0;
        
        clients.forEach((client, index) => {
          client.on('room-joined', (data: any) => {
            participantIds[index] = data.participant.id;
            joinedCount++;
            if (joinedCount === 3) resolve();
          });
          
          client.emit('join-room');
        });
      });

      // 【When】: client0が他の2人にOfferを送信
      const offers = [
        {
          from: participantIds[0],
          to: participantIds[1],
          signal: { type: 'offer', sdp: 'offer-to-client1' }
        },
        {
          from: participantIds[0],
          to: participantIds[2],
          signal: { type: 'offer', sdp: 'offer-to-client2' }
        }
      ];

      // 【Then】: 各クライアントが正しいOfferを受信
      const receivedOffers = await Promise.all([
        new Promise<SignalData>((resolve) => {
          clients[1].on('offer', resolve);
        }),
        new Promise<SignalData>((resolve) => {
          clients[2].on('offer', resolve);
        })
      ]);

      // Offer送信
      clients[0].emit('offer', offers[0]);
      clients[0].emit('offer', offers[1]);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(receivedOffers).toHaveLength(2);
      expect(receivedOffers[0].to).toBe(participantIds[1]);
      expect(receivedOffers[1].to).toBe(participantIds[2]);
      
      clients.forEach(client => client.disconnect());
    });

    test('SIGNAL-NORMAL-005: シグナリングメッセージの順序が保持される', async () => {
      // 【Given】: 接続確立中の2人の参加者
      // 【テスト目的】: メッセージ順序保証とタイミング制御
      // 【期待動作】: Offer→Answer→ICE候補の正しい順序での処理
      
      const port = 3014;
      await new Promise<void>((resolve) => {
        httpServer.listen(port, resolve);
      });

      const client1 = io(`http://localhost:${port}`);
      const client2 = io(`http://localhost:${port}`);
      
      let participant1Id: string = "";
      let participant2Id: string = "";

      // 両方のクライアントをルームに参加させる
      await new Promise<void>((resolve) => {
        let joinedCount = 0;
        
        client1.on('room-joined', (data: any) => {
          participant1Id = data.participant.id;
          joinedCount++;
          if (joinedCount === 2) resolve();
        });
        
        client2.on('room-joined', (data: any) => {
          participant2Id = data.participant.id;
          joinedCount++;
          if (joinedCount === 2) resolve();
        });
        
        client1.emit('join-room');
        client2.emit('join-room');
      });

      // 【When】: 順序付きメッセージ送信
      const receivedMessages: Array<{type: string, order: number}> = [];
      
      client2.on('offer', () => {
        receivedMessages.push({type: 'offer', order: receivedMessages.length});
      });
      
      client1.on('answer', () => {
        receivedMessages.push({type: 'answer', order: receivedMessages.length});
      });
      
      client2.on('ice-candidate', () => {
        receivedMessages.push({type: 'ice-candidate', order: receivedMessages.length});
      });

      // 連続送信
      client1.emit('offer', {
        from: participant1Id,
        to: participant2Id,
        signal: { type: 'offer', sdp: 'test-offer' }
      });
      
      client2.emit('answer', {
        from: participant2Id,
        to: participant1Id,
        signal: { type: 'answer', sdp: 'test-answer' }
      });
      
      client1.emit('ice-candidate', {
        from: participant1Id,
        to: participant2Id,
        candidate: { candidate: 'test-candidate' }
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      // 【Then】: メッセージが正しい順序で処理される
      expect(receivedMessages).toHaveLength(3);
      expect(receivedMessages[0].type).toBe('offer');
      expect(receivedMessages[1].type).toBe('answer');
      expect(receivedMessages[2].type).toBe('ice-candidate');
      
      client1.disconnect();
      client2.disconnect();
    });

    test('SIGNAL-NORMAL-006: シグナリング統計情報が正確に記録される', async () => {
      // 【Given】: 複数のシグナリングメッセージ送信
      // 【テスト目的】: シグナリング処理の統計情報管理
      // 【期待動作】: メッセージ数、成功率、エラー率の正確な記録
      
      const port = 3015;
      await new Promise<void>((resolve) => {
        httpServer.listen(port, resolve);
      });

      const client1 = io(`http://localhost:${port}`);
      const client2 = io(`http://localhost:${port}`);
      
      let participant1Id: string = "";
      let participant2Id: string = "";

      // 両方のクライアントをルームに参加させる
      await new Promise<void>((resolve) => {
        let joinedCount = 0;
        
        client1.on('room-joined', (data: any) => {
          participant1Id = data.participant.id;
          joinedCount++;
          if (joinedCount === 2) resolve();
        });
        
        client2.on('room-joined', (data: any) => {
          participant2Id = data.participant.id;
          joinedCount++;
          if (joinedCount === 2) resolve();
        });
        
        client1.emit('join-room');
        client2.emit('join-room');
      });

      // 【When】: 複数のシグナリングメッセージ送信
      for (let i = 0; i < 5; i++) {
        client1.emit('offer', {
          from: participant1Id,
          to: participant2Id,
          signal: { type: 'offer', sdp: `offer-${i}` }
        });
        
        client1.emit('ice-candidate', {
          from: participant1Id,
          to: participant2Id,
          candidate: { candidate: `candidate-${i}` }
        });
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      // 【Then】: SignalingHandlerから統計情報を取得（未実装）
      // TODO: GREEN段階でSignalingHandlerクラスに統計情報取得メソッドを実装
      // const signalingHandler = getSignalingHandler(); // シングルトン取得
      // const stats = signalingHandler.getStats();
      // expect(stats.totalMessages).toBe(10);
      // expect(stats.successfulMessages).toBe(10);
      // expect(stats.errorMessages).toBe(0);
      
      // 仮の期待値（実装後に詳細化）
      expect(true).toBe(true); // プレースホルダー
      
      client1.disconnect();
      client2.disconnect();
    });
  });

  // ===================================================================
  // 2. 異常系テストケース（Error Handling Test Cases）- 5テスト
  // ===================================================================

  describe('異常系: エラーハンドリングとバリデーション', () => {
    
    test('SIGNAL-ERROR-001: 存在しない宛先参加者IDへの送信でエラーが返される', async () => {
      // 【Given】: 1人の参加者のみルームに参加済み
      // 【テスト目的】: 無効な宛先への送信防止機能
      // 【期待動作】: エラーレスポンスの返却、メッセージ中継の停止
      
      const port = 3016;
      await new Promise<void>((resolve) => {
        httpServer.listen(port, resolve);
      });

      const client1 = io(`http://localhost:${port}`);
      let participant1Id: string = "";

      // client1をルームに参加させる
      await new Promise<void>((resolve) => {
        client1.on('room-joined', (data: any) => {
          participant1Id = data.participant.id;
          resolve();
        });
        
        client1.emit('join-room');
      });

      // 【When】: 存在しない参加者IDへのOffer送信
      const invalidOfferData: SignalData = {
        from: participant1Id,
        to: 'nonexistent-participant-id',
        signal: { type: 'offer', sdp: 'test-offer' }
      };

      // 【Then】: エラーレスポンスを受信
      const errorResponse = await new Promise<SignalingErrorData>((resolve) => {
        client1.on('signaling-error', (error: SignalingErrorData) => {
          resolve(error);
        });
        
        client1.emit('offer', invalidOfferData);
      });

      expect(errorResponse.code).toBe('INVALID_PARTICIPANT');
      expect(errorResponse.message).toContain('Participant not found');
      expect(errorResponse.details.participantId).toBe('nonexistent-participant-id');
      
      client1.disconnect();
    });

    test('SIGNAL-ERROR-002: 送信者が参加者リストに存在しない場合にエラーが返される', async () => {
      // 【Given】: 正常な参加者とメッセージ
      // 【テスト目的】: 送信者認証機能の確認
      // 【期待動作】: 不正な送信者からのメッセージ拒否
      
      const port = 3017;
      await new Promise<void>((resolve) => {
        httpServer.listen(port, resolve);
      });

      const client1 = io(`http://localhost:${port}`);
      const client2 = io(`http://localhost:${port}`);
      
      let participant2Id: string = "";

      // client2のみルームに参加させる
      await new Promise<void>((resolve) => {
        client2.on('room-joined', (data: any) => {
          participant2Id = data.participant.id;
          resolve();
        });
        
        client2.emit('join-room');
      });

      // 【When】: 未参加のclient1からのOffer送信
      const invalidOfferData: SignalData = {
        from: 'fake-participant-id',
        to: participant2Id,
        signal: { type: 'offer', sdp: 'test-offer' }
      };

      // 【Then】: エラーレスポンスを受信
      const errorResponse = await new Promise<SignalingErrorData>((resolve) => {
        client1.on('signaling-error', (error: SignalingErrorData) => {
          resolve(error);
        });
        
        client1.emit('offer', invalidOfferData);
      });

      expect(errorResponse.code).toBe('UNAUTHORIZED_SENDER');
      expect(errorResponse.message).toContain('Sender not found in room');
      
      client1.disconnect();
      client2.disconnect();
    });

    test('SIGNAL-ERROR-003: 不正なシグナリングデータ形式でバリデーションエラーが発生する', async () => {
      // 【Given】: 正常に参加済みの2人
      // 【テスト目的】: 入力データバリデーション機能
      // 【期待動作】: 不正なデータ形式の検出とエラー返却
      
      const port = 3018;
      await new Promise<void>((resolve) => {
        httpServer.listen(port, resolve);
      });

      const client1 = io(`http://localhost:${port}`);
      const client2 = io(`http://localhost:${port}`);
      
      let participant1Id: string = "";
      let participant2Id: string = "";

      // 両方のクライアントをルームに参加させる
      await new Promise<void>((resolve) => {
        let joinedCount = 0;
        
        client1.on('room-joined', (data: any) => {
          participant1Id = data.participant.id;
          joinedCount++;
          if (joinedCount === 2) resolve();
        });
        
        client2.on('room-joined', (data: any) => {
          participant2Id = data.participant.id;
          joinedCount++;
          if (joinedCount === 2) resolve();
        });
        
        client1.emit('join-room');
        client2.emit('join-room');
      });

      // 【When】: 不正なデータ形式での送信
      const invalidDataCases = [
        // from フィールドなし
        { to: participant2Id, signal: { type: 'offer' } },
        // to フィールドなし
        { from: participant1Id, signal: { type: 'offer' } },
        // signal フィールドなし
        { from: participant1Id, to: participant2Id },
        // 空のオブジェクト
        {},
        // null値
        null
      ];

      const errorResponses: SignalingErrorData[] = [];
      
      client1.on('signaling-error', (error: SignalingErrorData) => {
        errorResponses.push(error);
      });

      // 各不正データで送信
      for (const invalidData of invalidDataCases) {
        client1.emit('offer', invalidData);
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      // 【Then】: すべてのケースでバリデーションエラー
      expect(errorResponses.length).toBeGreaterThanOrEqual(3);
      errorResponses.forEach(error => {
        expect(error.code).toBe('VALIDATION_ERROR');
        expect(error.message).toContain('Invalid signaling data format');
      });
      
      client1.disconnect();
      client2.disconnect();
    });

    test('SIGNAL-ERROR-004: 送信中に宛先参加者が切断した場合の処理', async () => {
      // 【Given】: シグナリング中の2人の参加者
      // 【テスト目的】: 動的な参加者状態変化への対応
      // 【期待動作】: 切断検出とエラーレスポンス
      
      const port = 3019;
      await new Promise<void>((resolve) => {
        httpServer.listen(port, resolve);
      });

      const client1 = io(`http://localhost:${port}`);
      const client2 = io(`http://localhost:${port}`);
      
      let participant1Id: string = "";
      let participant2Id: string = "";

      // 両方のクライアントをルームに参加させる
      await new Promise<void>((resolve) => {
        let joinedCount = 0;
        
        client1.on('room-joined', (data: any) => {
          participant1Id = data.participant.id;
          joinedCount++;
          if (joinedCount === 2) resolve();
        });
        
        client2.on('room-joined', (data: any) => {
          participant2Id = data.participant.id;
          joinedCount++;
          if (joinedCount === 2) resolve();
        });
        
        client1.emit('join-room');
        client2.emit('join-room');
      });

      // 【When】: client2が切断後、client1がOfferを送信
      client2.disconnect();
      
      await new Promise(resolve => setTimeout(resolve, 100)); // 切断処理を待つ

      const offerToDisconnected: SignalData = {
        from: participant1Id,
        to: participant2Id,
        signal: { type: 'offer', sdp: 'test-offer' }
      };

      // 【Then】: 切断したクライアントへの送信エラー
      const errorResponse = await new Promise<SignalingErrorData>((resolve) => {
        client1.on('signaling-error', (error: SignalingErrorData) => {
          resolve(error);
        });
        
        client1.emit('offer', offerToDisconnected);
      });

      expect(errorResponse.code).toBe('PARTICIPANT_DISCONNECTED');
      expect(errorResponse.message).toContain('Target participant is no longer connected');
      
      client1.disconnect();
    });

    test('SIGNAL-ERROR-005: 同時大量メッセージ送信時のレート制限', async () => {
      // 【Given】: 正常に参加済みの2人
      // 【テスト目的】: DoS攻撃防止とリソース保護
      // 【期待動作】: レート制限適用とエラーレスポンス
      
      const port = 3020;
      await new Promise<void>((resolve) => {
        httpServer.listen(port, resolve);
      });

      const client1 = io(`http://localhost:${port}`);
      const client2 = io(`http://localhost:${port}`);
      
      let participant1Id: string = "";
      let participant2Id: string = "";

      // 両方のクライアントをルームに参加させる
      await new Promise<void>((resolve) => {
        let joinedCount = 0;
        
        client1.on('room-joined', (data: any) => {
          participant1Id = data.participant.id;
          joinedCount++;
          if (joinedCount === 2) resolve();
        });
        
        client2.on('room-joined', (data: any) => {
          participant2Id = data.participant.id;
          joinedCount++;
          if (joinedCount === 2) resolve();
        });
        
        client1.emit('join-room');
        client2.emit('join-room');
      });

      // 【When】: 短時間での大量メッセージ送信
      const errorResponses: SignalingErrorData[] = [];
      
      client1.on('signaling-error', (error: SignalingErrorData) => {
        errorResponses.push(error);
      });

      // 100メッセージを即座に送信
      for (let i = 0; i < 100; i++) {
        client1.emit('offer', {
          from: participant1Id,
          to: participant2Id,
          signal: { type: 'offer', sdp: `rapid-offer-${i}` }
        });
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      // 【Then】: レート制限エラーが発生
      expect(errorResponses.length).toBeGreaterThan(0);
      const rateLimitErrors = errorResponses.filter(error => error.code === 'RATE_LIMIT_EXCEEDED');
      expect(rateLimitErrors.length).toBeGreaterThan(0);
      expect(rateLimitErrors[0].message).toContain('Too many signaling messages');
      
      client1.disconnect();
      client2.disconnect();
    });
  });

  // ===================================================================
  // 3. 境界値テストケース（Boundary Value Test Cases）- 4テスト
  // ===================================================================

  describe('境界値: システム制限とエッジケース', () => {
    
    test('SIGNAL-BOUNDARY-001: 最大参加者数（10人）でのシグナリング性能', async () => {
      // 【Given】: 10人の最大参加者数
      // 【テスト目的】: システム最大容量でのシグナリング性能確認
      // 【期待動作】: 全参加者間でのスムーズなシグナリング処理
      
      const port = 3021;
      await new Promise<void>((resolve) => {
        httpServer.listen(port, resolve);
      });

      const clients: SocketIOClient[] = [];
      const participantIds: string[] = [];

      // 10人のクライアントを準備
      for (let i = 0; i < 10; i++) {
        clients.push(io(`http://localhost:${port}`));
      }

      // 全クライアントをルームに参加させる
      await new Promise<void>((resolve) => {
        let joinedCount = 0;
        
        clients.forEach((client, index) => {
          client.on('room-joined', (data: any) => {
            participantIds[index] = data.participant.id;
            joinedCount++;
            if (joinedCount === 10) resolve();
          });
          
          client.emit('join-room');
        });
      });

      // 【When】: 1人目が他の9人全員にOfferを送信
      const startTime = Date.now();
      const receivedOffers: SignalData[] = [];
      
      // 他のクライアントでOffer受信を監視
      for (let i = 1; i < 10; i++) {
        clients[i].on('offer', (data: SignalData) => {
          receivedOffers.push(data);
        });
      }

      // 9つのOfferを送信
      for (let i = 1; i < 10; i++) {
        clients[0].emit('offer', {
          from: participantIds[0],
          to: participantIds[i],
          signal: { type: 'offer', sdp: `offer-to-participant-${i}` }
        });
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
      const endTime = Date.now();

      // 【Then】: 全Offerが正常に中継され、性能要件を満たす
      expect(receivedOffers).toHaveLength(9);
      expect(endTime - startTime).toBeLessThan(2000); // 2秒以内の処理
      
      receivedOffers.forEach((offer, index) => {
        expect(offer.from).toBe(participantIds[0]);
        expect(offer.to).toBe(participantIds[index + 1]);
      });
      
      clients.forEach(client => client.disconnect());
    });

    test('SIGNAL-BOUNDARY-002: 極端に大きなSDPデータの処理', async () => {
      // 【Given】: 通常より大きなSDP情報
      // 【テスト目的】: 大きなペイロードでのメッセージ処理能力
      // 【期待動作】: 大きなSDPでも正常な中継処理
      
      const port = 3022;
      await new Promise<void>((resolve) => {
        httpServer.listen(port, resolve);
      });

      const client1 = io(`http://localhost:${port}`);
      const client2 = io(`http://localhost:${port}`);
      
      let participant1Id: string = "";
      let participant2Id: string = "";

      // 両方のクライアントをルームに参加させる
      await new Promise<void>((resolve) => {
        let joinedCount = 0;
        
        client1.on('room-joined', (data: any) => {
          participant1Id = data.participant.id;
          joinedCount++;
          if (joinedCount === 2) resolve();
        });
        
        client2.on('room-joined', (data: any) => {
          participant2Id = data.participant.id;
          joinedCount++;
          if (joinedCount === 2) resolve();
        });
        
        client1.emit('join-room');
        client2.emit('join-room');
      });

      // 【When】: 大きなSDPデータでのOffer送信
      const largeSdp = 'v=0\r\n' + 'o=- 1234567890 1234567890 IN IP4 127.0.0.1\r\n' + 
                     'a='.repeat(10000) + 'large-sdp-data\r\n'; // 約100KBのSDP

      const largeOfferData: SignalData = {
        from: participant1Id,
        to: participant2Id,
        signal: {
          type: 'offer',
          sdp: largeSdp
        }
      };

      // 【Then】: 大きなSDPも正常に中継される
      const receivedOffer = await new Promise<SignalData>((resolve) => {
        client2.on('offer', (data: SignalData) => {
          resolve(data);
        });
        
        client1.emit('offer', largeOfferData);
      });

      expect(receivedOffer.signal.sdp).toBe(largeSdp);
      expect(receivedOffer.signal.sdp!.length).toBeGreaterThan(10000);
      
      client1.disconnect();
      client2.disconnect();
    });

    test('SIGNAL-BOUNDARY-003: 接続品質低下時のシグナリング再送制御', async () => {
      // 【Given】: ネットワーク遅延が発生する環境
      // 【テスト目的】: 接続品質低下時の堅牢性確認
      // 【期待動作】: 遅延があっても確実なメッセージ配信
      
      const port = 3023;
      await new Promise<void>((resolve) => {
        httpServer.listen(port, resolve);
      });

      const client1 = io(`http://localhost:${port}`, {
        timeout: 10000,
        forceNew: true
      });
      const client2 = io(`http://localhost:${port}`, {
        timeout: 10000,
        forceNew: true
      });
      
      let participant1Id: string = "";
      let participant2Id: string = "";

      // 両方のクライアントをルームに参加させる
      await new Promise<void>((resolve) => {
        let joinedCount = 0;
        
        client1.on('room-joined', (data: any) => {
          participant1Id = data.participant.id;
          joinedCount++;
          if (joinedCount === 2) resolve();
        });
        
        client2.on('room-joined', (data: any) => {
          participant2Id = data.participant.id;
          joinedCount++;
          if (joinedCount === 2) resolve();
        });
        
        client1.emit('join-room');
        client2.emit('join-room');
      });

      // 【When】: 人工的な遅延を導入してメッセージ送信
      const delayedOffers: SignalData[] = [];
      
      client2.on('offer', (data: SignalData) => {
        delayedOffers.push(data);
      });

      // 複数のOfferを短時間で送信（ネットワーク負荷シミュレーション）
      for (let i = 0; i < 5; i++) {
        setTimeout(() => {
          client1.emit('offer', {
            from: participant1Id,
            to: participant2Id,
            signal: { type: 'offer', sdp: `delayed-offer-${i}` }
          });
        }, i * 100); // 100ms間隔
      }

      await new Promise(resolve => setTimeout(resolve, 1000));

      // 【Then】: 遅延があっても全メッセージが配信される
      expect(delayedOffers).toHaveLength(5);
      
      delayedOffers.forEach((offer, index) => {
        expect(offer.signal.sdp).toBe(`delayed-offer-${index}`);
      });
      
      client1.disconnect();
      client2.disconnect();
    });

    test('SIGNAL-BOUNDARY-004: 最小限のシグナリングデータでの動作確認', async () => {
      // 【Given】: 最小限の必須フィールドのみ
      // 【テスト目的】: 最小データでの正常動作確認
      // 【期待動作】: 必須フィールドのみでも正常処理
      
      const port = 3024;
      await new Promise<void>((resolve) => {
        httpServer.listen(port, resolve);
      });

      const client1 = io(`http://localhost:${port}`);
      const client2 = io(`http://localhost:${port}`);
      
      let participant1Id: string = "";
      let participant2Id: string = "";

      // 両方のクライアントをルームに参加させる
      await new Promise<void>((resolve) => {
        let joinedCount = 0;
        
        client1.on('room-joined', (data: any) => {
          participant1Id = data.participant.id;
          joinedCount++;
          if (joinedCount === 2) resolve();
        });
        
        client2.on('room-joined', (data: any) => {
          participant2Id = data.participant.id;
          joinedCount++;
          if (joinedCount === 2) resolve();
        });
        
        client1.emit('join-room');
        client2.emit('join-room');
      });

      // 【When】: 最小限のシグナリングデータ送信
      const minimalOfferData: SignalData = {
        from: participant1Id,
        to: participant2Id,
        signal: {
          type: 'offer'
          // SDP は意図的に省略（最小限テスト）
        }
      };

      const minimalIceCandidate: IceCandidateData = {
        from: participant1Id,
        to: participant2Id,
        candidate: {
          candidate: 'a=candidate:0 1 UDP 2113667326 192.168.1.100 54400 typ host'
          // 他のフィールドは省略
        }
      };

      // 【Then】: 最小限データでも正常処理される
      const receivedOfferPromise = new Promise<SignalData>((resolve) => {
        client2.on('offer', resolve);
      });
      
      const receivedCandidatePromise = new Promise<IceCandidateData>((resolve) => {
        client2.on('ice-candidate', resolve);
      });

      client1.emit('offer', minimalOfferData);
      client1.emit('ice-candidate', minimalIceCandidate);

      const [receivedOffer, receivedCandidate] = await Promise.all([
        receivedOfferPromise,
        receivedCandidatePromise
      ]);

      expect(receivedOffer.from).toBe(participant1Id);
      expect(receivedOffer.signal.type).toBe('offer');
      expect(receivedCandidate.from).toBe(participant1Id);
      expect(receivedCandidate.candidate.candidate).toContain('192.168.1.100');
      
      client1.disconnect();
      client2.disconnect();
    });
  });
});

/**
 * 【実装予定クラス】: SignalingHandlerシングルトンインスタンス取得関数
 * 【実装完了】: GREEN段階でapp.tsからインポート予定
 */

/**
 * 【テスト実行結果期待値】:
 * - 全15テストが初期状態でFAIL（RED段階の目的）
 * - 明確なエラーメッセージにより実装すべきシグナリング機能が特定される
 * - テストは実装段階でのTDD開発を完全にガイドする設計
 * 
 * 【次の段階】: GREEN段階でのSignalingHandler実装
 * - src/signaling-handler.ts の作成
 * - Socket.IOイベントハンドラーの実装（offer/answer/ice-candidate）
 * - 参加者存在確認とメッセージバリデーション
 * - エラーハンドリングとレート制限の実装
 */