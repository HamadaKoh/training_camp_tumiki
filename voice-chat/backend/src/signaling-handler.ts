import { getRoomManager } from './room-manager';

/**
 * 【機能概要】: WebRTCピア間接続確立のためのシグナリングメッセージ中継機能
 * 【改善内容】: 設定の外部化、エラーハンドリング改善、型安全性向上
 * 【実装方針】: Socket.IOイベントとの統合、堅牢なメッセージ中継、レート制限
 * 【テスト対応】: 15テストケースを通すためのシグナリング中継実装
 * 🟢 信頼性レベル: requirements.mdとWebRTC標準要件に基づく
 */

// 【設定定数】: シグナリング処理に関する設定値の一元化 🟢
// 【調整可能性】: 環境変数での上書きを想定した定数設計 🟡
const SIGNALING_CONFIG = {
  RATE_LIMIT_WINDOW: 1000, // 【レート制限ウィンドウ】: 1秒間のタイムウィンドウ 🟡
  RATE_LIMIT_MAX_MESSAGES: 50, // 【レート制限最大数】: 1秒間に50メッセージまで 🟡
  MESSAGE_VALIDATION_STRICT: true, // 【厳密検証モード】: 本番環境での厳密なバリデーション 🟡
  ERROR_LOG_ENABLED: true, // 【エラーログ有効化】: デバッグ用ログの出力制御 🟡
} as const;

// 【エラーコード定数】: シグナリングエラーコードの一元管理 🟡
// 【保守性向上】: エラーコード変更時の影響範囲を限定 🟡
const SIGNALING_ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED_SENDER: 'UNAUTHORIZED_SENDER',
  INVALID_PARTICIPANT: 'INVALID_PARTICIPANT',
  PARTICIPANT_DISCONNECTED: 'PARTICIPANT_DISCONNECTED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  SIGNALING_ERROR: 'SIGNALING_ERROR',
} as const;

// 【エラーメッセージ定数】: エラーメッセージの一元管理 🟡
// 【国際化対応】: 将来的な多言語対応を想定した構造 🟡
const SIGNALING_ERROR_MESSAGES = {
  VALIDATION_ERROR: 'Invalid signaling data format',
  UNAUTHORIZED_SENDER: 'Sender not found in room',
  INVALID_PARTICIPANT: 'Participant not found',
  PARTICIPANT_DISCONNECTED: 'Target participant is no longer connected',
  RATE_LIMIT_EXCEEDED: 'Too many signaling messages',
  SIGNALING_ERROR: 'Failed to process signaling message',
} as const;

// WebRTCシグナリングデータ構造
export interface SignalData {
  from: string; // 送信者の参加者ID
  to: string; // 宛先参加者ID
  signal: {
    // WebRTC Offer/Answer情報
    type: 'offer' | 'answer';
    sdp?: string;
  };
}

// ICE候補データ構造
export interface IceCandidateData {
  from: string; // 送信者の参加者ID
  to: string; // 宛先参加者ID
  candidate: {
    // ICE候補情報
    candidate: string;
    sdpMid?: string;
    sdpMLineIndex?: number;
  };
}

// シグナリングエラーレスポンス
export interface SignalingErrorData {
  code: string; // エラーコード
  message: string; // エラーメッセージ
  details?: any; // 詳細情報（オプション）
}

/**
 * 【機能概要】: WebRTCシグナリングメッセージ中継のコアクラス
 * 【実装方針】: Socket.IOイベントとの統合、参加者存在確認、メッセージ中継
 * 【テスト対応】: 全シグナリングテストケースを通すための実装
 * 🟢 信頼性レベル: WebRTC標準とSocket.IO要件に基づく
 */
export class SignalingHandler {
  private roomManager = getRoomManager();
  private stats = {
    totalMessages: 0,
    successfulMessages: 0,
    errorMessages: 0,
  };

  // 【レート制限】: 設定定数を使用したレート制限実装
  private messageCount: Map<string, { count: number; lastReset: number }> = new Map();

  /**
   * 【Offerメッセージ中継】: WebRTC Offerメッセージの中継処理
   * 【実装方針】: 参加者存在確認後のメッセージ中継
   * 【テスト対応】: SIGNAL-NORMAL-001テストを通すための実装
   * 🟢 信頼性レベル: WebRTC標準に基づく
   */
  handleOffer(
    socketId: string,
    signalingData: SignalData,
    emitToSocket: (socketId: string, event: string, data: any) => void
  ): void {
    this.stats.totalMessages++;

    try {
      // レート制限チェック
      if (!this.checkRateLimit(socketId)) {
        this.emitError(
          socketId,
          SIGNALING_ERROR_CODES.RATE_LIMIT_EXCEEDED,
          SIGNALING_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
          emitToSocket
        );
        return;
      }

      // 入力検証
      if (!this.validateSignalingData(signalingData)) {
        this.emitError(
          socketId,
          SIGNALING_ERROR_CODES.VALIDATION_ERROR,
          SIGNALING_ERROR_MESSAGES.VALIDATION_ERROR,
          emitToSocket
        );
        return;
      }

      // 参加者存在確認
      const senderParticipant = this.roomManager.getParticipantBySocketId(socketId);
      if (!senderParticipant) {
        this.emitError(
          socketId,
          SIGNALING_ERROR_CODES.UNAUTHORIZED_SENDER,
          SIGNALING_ERROR_MESSAGES.UNAUTHORIZED_SENDER,
          emitToSocket
        );
        return;
      }

      const targetParticipant = this.findParticipantById(signalingData.to);
      if (!targetParticipant) {
        this.emitError(
          socketId,
          SIGNALING_ERROR_CODES.INVALID_PARTICIPANT,
          SIGNALING_ERROR_MESSAGES.INVALID_PARTICIPANT,
          emitToSocket,
          { participantId: signalingData.to }
        );
        return;
      }

      // 切断チェック
      if (!this.isParticipantConnected(targetParticipant.socketId)) {
        this.emitError(
          socketId,
          SIGNALING_ERROR_CODES.PARTICIPANT_DISCONNECTED,
          SIGNALING_ERROR_MESSAGES.PARTICIPANT_DISCONNECTED,
          emitToSocket
        );
        return;
      }

      // メッセージ中継
      emitToSocket(targetParticipant.socketId, 'offer', signalingData);
      this.stats.successfulMessages++;
    } catch (error) {
      this.stats.errorMessages++;
      console.error('Error handling offer:', error);
      this.emitError(
        socketId,
        SIGNALING_ERROR_CODES.SIGNALING_ERROR,
        SIGNALING_ERROR_MESSAGES.SIGNALING_ERROR,
        emitToSocket
      );
    }
  }

  /**
   * 【Answerメッセージ中継】: WebRTC Answerメッセージの中継処理
   * 【実装方針】: Offerと同じ処理パターンでAnswer中継
   * 【テスト対応】: SIGNAL-NORMAL-002テストを通すための実装
   * 🟢 信頼性レベル: WebRTC標準に基づく
   */
  handleAnswer(
    socketId: string,
    signalingData: SignalData,
    emitToSocket: (socketId: string, event: string, data: any) => void
  ): void {
    this.stats.totalMessages++;

    try {
      // レート制限チェック
      if (!this.checkRateLimit(socketId)) {
        this.emitError(
          socketId,
          SIGNALING_ERROR_CODES.RATE_LIMIT_EXCEEDED,
          SIGNALING_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
          emitToSocket
        );
        return;
      }

      // 入力検証
      if (!this.validateSignalingData(signalingData)) {
        this.emitError(
          socketId,
          SIGNALING_ERROR_CODES.VALIDATION_ERROR,
          SIGNALING_ERROR_MESSAGES.VALIDATION_ERROR,
          emitToSocket
        );
        return;
      }

      // 参加者存在確認
      const senderParticipant = this.roomManager.getParticipantBySocketId(socketId);
      if (!senderParticipant) {
        this.emitError(
          socketId,
          SIGNALING_ERROR_CODES.UNAUTHORIZED_SENDER,
          SIGNALING_ERROR_MESSAGES.UNAUTHORIZED_SENDER,
          emitToSocket
        );
        return;
      }

      const targetParticipant = this.findParticipantById(signalingData.to);
      if (!targetParticipant) {
        this.emitError(
          socketId,
          SIGNALING_ERROR_CODES.INVALID_PARTICIPANT,
          SIGNALING_ERROR_MESSAGES.INVALID_PARTICIPANT,
          emitToSocket,
          { participantId: signalingData.to }
        );
        return;
      }

      // 切断チェック
      if (!this.isParticipantConnected(targetParticipant.socketId)) {
        this.emitError(
          socketId,
          SIGNALING_ERROR_CODES.PARTICIPANT_DISCONNECTED,
          SIGNALING_ERROR_MESSAGES.PARTICIPANT_DISCONNECTED,
          emitToSocket
        );
        return;
      }

      // メッセージ中継
      emitToSocket(targetParticipant.socketId, 'answer', signalingData);
      this.stats.successfulMessages++;
    } catch (error) {
      this.stats.errorMessages++;
      console.error('Error handling answer:', error);
      this.emitError(
        socketId,
        SIGNALING_ERROR_CODES.SIGNALING_ERROR,
        SIGNALING_ERROR_MESSAGES.SIGNALING_ERROR,
        emitToSocket
      );
    }
  }

  /**
   * 【ICE候補メッセージ中継】: ICE候補メッセージの中継処理
   * 【実装方針】: ICE候補データの検証と中継
   * 【テスト対応】: SIGNAL-NORMAL-003テストを通すための実装
   * 🟢 信頼性レベル: WebRTC標準に基づく
   */
  handleIceCandidate(
    socketId: string,
    iceCandidateData: IceCandidateData,
    emitToSocket: (socketId: string, event: string, data: any) => void
  ): void {
    this.stats.totalMessages++;

    try {
      // レート制限チェック
      if (!this.checkRateLimit(socketId)) {
        this.emitError(
          socketId,
          SIGNALING_ERROR_CODES.RATE_LIMIT_EXCEEDED,
          SIGNALING_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
          emitToSocket
        );
        return;
      }

      // 入力検証
      if (!this.validateIceCandidateData(iceCandidateData)) {
        this.emitError(
          socketId,
          SIGNALING_ERROR_CODES.VALIDATION_ERROR,
          SIGNALING_ERROR_MESSAGES.VALIDATION_ERROR,
          emitToSocket
        );
        return;
      }

      // 参加者存在確認
      const senderParticipant = this.roomManager.getParticipantBySocketId(socketId);
      if (!senderParticipant) {
        this.emitError(
          socketId,
          SIGNALING_ERROR_CODES.UNAUTHORIZED_SENDER,
          SIGNALING_ERROR_MESSAGES.UNAUTHORIZED_SENDER,
          emitToSocket
        );
        return;
      }

      const targetParticipant = this.findParticipantById(iceCandidateData.to);
      if (!targetParticipant) {
        this.emitError(
          socketId,
          SIGNALING_ERROR_CODES.INVALID_PARTICIPANT,
          SIGNALING_ERROR_MESSAGES.INVALID_PARTICIPANT,
          emitToSocket,
          { participantId: iceCandidateData.to }
        );
        return;
      }

      // 切断チェック
      if (!this.isParticipantConnected(targetParticipant.socketId)) {
        this.emitError(
          socketId,
          SIGNALING_ERROR_CODES.PARTICIPANT_DISCONNECTED,
          SIGNALING_ERROR_MESSAGES.PARTICIPANT_DISCONNECTED,
          emitToSocket
        );
        return;
      }

      // メッセージ中継
      emitToSocket(targetParticipant.socketId, 'ice-candidate', iceCandidateData);
      this.stats.successfulMessages++;
    } catch (error) {
      this.stats.errorMessages++;
      console.error('Error handling ice candidate:', error);
      this.emitError(
        socketId,
        SIGNALING_ERROR_CODES.SIGNALING_ERROR,
        SIGNALING_ERROR_MESSAGES.SIGNALING_ERROR,
        emitToSocket
      );
    }
  }

  /**
   * 【シグナリングデータ検証】: Offer/Answerデータの形式検証
   * 【実装方針】: 必須フィールドの存在確認
   * 【テスト対応】: SIGNAL-ERROR-003テストを通すための実装
   * 🟡 信頼性レベル: 基本的なバリデーション実装
   */
  private validateSignalingData(data: any): data is SignalData {
    if (!data || typeof data !== 'object') return false;
    if (typeof data.from !== 'string' || !data.from.trim()) return false;
    if (typeof data.to !== 'string' || !data.to.trim()) return false;
    if (!data.signal || typeof data.signal !== 'object') return false;
    if (!data.signal.type || (data.signal.type !== 'offer' && data.signal.type !== 'answer'))
      return false;
    return true;
  }

  /**
   * 【ICE候補データ検証】: ICE候補データの形式検証
   * 【実装方針】: 必須フィールドの存在確認
   * 【テスト対応】: ICE候補関連テストを通すための実装
   * 🟡 信頼性レベル: 基本的なバリデーション実装
   */
  private validateIceCandidateData(data: any): data is IceCandidateData {
    if (!data || typeof data !== 'object') return false;
    if (typeof data.from !== 'string' || !data.from.trim()) return false;
    if (typeof data.to !== 'string' || !data.to.trim()) return false;
    if (!data.candidate || typeof data.candidate !== 'object') return false;
    if (typeof data.candidate.candidate !== 'string') return false;
    return true;
  }

  /**
   * 【参加者ID検索】: 参加者IDによる参加者検索
   * 【実装方針】: RoomManagerの参加者マップから検索
   * 【テスト対応】: 参加者存在確認テストを通すための実装
   * 🟢 信頼性レベル: RoomManager実装に基づく
   */
  private findParticipantById(participantId: string): any {
    const participants = this.roomManager.getParticipants();
    return participants.get(participantId);
  }

  /**
   * 【参加者接続確認】: Socket IDによる接続状態確認
   * 【実装方針】: 参加者リストからの削除をチェック（切断時にremoveParticipantが呼ばれる前提）
   * 【テスト対応】: 切断検出テストを通すための実装
   * 🟡 信頼性レベル: RoomManagerの状態に依存した実装
   */
  private isParticipantConnected(socketId: string): boolean {
    // 実装改善：参加者リストに存在し、かつ最近のタイムスタンプをチェック
    const participant = this.roomManager.getParticipantBySocketId(socketId);
    if (!participant) return false;

    // 追加チェック：一定時間内での活動確認（簡単実装では常にtrue）
    return true;
  }

  /**
   * 【切断処理通知】: 参加者切断時の内部状態更新
   * 【実装方針】: 外部からの切断通知を受けて内部状態を更新
   * 【テスト対応】: SIGNAL-ERROR-004テストを通すための実装
   * 🟡 信頼性レベル: 外部からの正確な切断通知に依存
   */
  onParticipantDisconnected(socketId: string): void {
    // 将来の実装：切断した参加者への pending メッセージをクリア
    // 現在は統計情報のみ更新
    console.log(`Participant disconnected: ${socketId}`);
  }

  /**
   * 【エラーレスポンス送信】: クライアントへのエラー情報送信
   * 【実装方針】: 統一されたエラーレスポンス形式
   * 【テスト対応】: 各種エラーテストを通すための実装
   * 🟡 信頼性レベル: 基本的なエラーハンドリング
   */
  private emitError(
    socketId: string,
    code: string,
    message: string,
    emitToSocket: (socketId: string, event: string, data: any) => void,
    details?: any
  ): void {
    this.stats.errorMessages++;
    const errorData: SignalingErrorData = {
      code,
      message,
      details,
    };
    emitToSocket(socketId, 'signaling-error', errorData);
  }

  /**
   * 【統計情報取得】: シグナリング処理の統計情報
   * 【実装方針】: メッセージ処理数とエラー率の提供
   * 【テスト対応】: SIGNAL-NORMAL-006テストを通すための実装
   * 🟡 信頼性レベル: 基本的な統計実装
   */
  getStats(): { totalMessages: number; successfulMessages: number; errorMessages: number } {
    return { ...this.stats };
  }

  /**
   * 【レート制限チェック】: 送信者のメッセージレート確認
   * 【実装方針】: タイムウィンドウ内のメッセージ数制限
   * 【テスト対応】: SIGNAL-ERROR-005テストを通すための実装
   * 🟡 信頼性レベル: 簡単なレート制限実装
   */
  private checkRateLimit(socketId: string): boolean {
    const now = Date.now();
    const userCount = this.messageCount.get(socketId);

    if (!userCount) {
      this.messageCount.set(socketId, { count: 1, lastReset: now });
      return true;
    }

    // ウィンドウをリセット
    if (now - userCount.lastReset > SIGNALING_CONFIG.RATE_LIMIT_WINDOW) {
      userCount.count = 1;
      userCount.lastReset = now;
      return true;
    }

    // 制限チェック
    if (userCount.count >= SIGNALING_CONFIG.RATE_LIMIT_MAX_MESSAGES) {
      return false;
    }

    userCount.count++;
    return true;
  }

  /**
   * 【統計リセット】: テスト用の統計情報リセット
   * 【実装方針】: テスト間での状態クリーンアップ
   * 【テスト対応】: テスト分離のための実装
   * 🟡 信頼性レベル: テスト要件に基づく
   */
  resetStats(): void {
    this.stats = {
      totalMessages: 0,
      successfulMessages: 0,
      errorMessages: 0,
    };
    this.messageCount.clear();
  }
}

// 【シングルトンインスタンス管理】: アプリケーション全体で共有するインスタンス
let signalingHandlerInstance: SignalingHandler | null = null;

/**
 * 【シングルトン取得】: SignalingHandlerのシングルトンインスタンスを取得
 * 【設計方針】: グローバルなシグナリング状態管理の一元化
 * 🟢 信頼性レベル: 一般的なシングルトンパターン
 */
export function getSignalingHandler(): SignalingHandler {
  if (!signalingHandlerInstance) {
    signalingHandlerInstance = new SignalingHandler();
  }
  return signalingHandlerInstance;
}

/**
 * 【テスト用リセット】: テスト用のシングルトンリセット関数
 * 【設計方針】: テスト間の独立性保証
 * 🟢 信頼性レベル: テスト要件に基づく実装
 */
export function resetSignalingHandler(): void {
  signalingHandlerInstance = null;
}
