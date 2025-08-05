import { v4 as uuidv4 } from 'uuid';
import { pool } from './database';
import { Participant, ConnectionInfo } from './types';

/**
 * 【機能概要】: ボイスチャットルームの参加者管理を行うコアクラス
 * 【改善内容】: 定数の抽出、エラーメッセージの一元化、入力検証の強化、パフォーマンス最適化
 * 【設計方針】: 単一責任原則に基づき、ルーム管理に特化した実装
 * 【パフォーマンス】: Socket ID検索用のインデックスマップ追加によるO(1)検索の実現
 * 【保守性】: 定数化とエラーメッセージの一元管理による変更容易性の向上
 * 🟢 信頼性レベル: voice-chat-requirements.mdの要件に基づく実装
 */

// 【設定定数】: ルーム管理に関する設定値の一元化 🟢
// 【調整可能性】: 環境変数での上書きを想定した定数設計 🟡
const ROOM_CONFIG = {
  MAX_CAPACITY: 10, // 【最大参加者数】: NFR-004要件に基づく10人制限 🟢
  DEFAULT_ROOM_ID: 'default-room', // 【デフォルトルームID】: MVP実装での単一ルーム 🟢
  SOCKET_ID_MAX_LENGTH: 255, // 【Socket ID最大長】: PostgreSQL VARCHAR(255)制限 🟢
  DEFAULT_CONNECTION_QUALITY: 'good' as const, // 【デフォルト接続品質】: 初期値設定 🟡
};

// 【エラーメッセージ定数】: エラーメッセージの一元管理 🟡
// 【保守性向上】: メッセージ変更時の影響範囲を限定 🟡
const ERROR_MESSAGES = {
  INVALID_SOCKET_ID_TYPE: 'Socket ID must be a string',
  EMPTY_SOCKET_ID: 'Socket ID cannot be empty',
  ROOM_FULL: 'Room is at maximum capacity',
  DUPLICATE_PARTICIPANT: 'Participant with socket ID already exists',
  INVALID_PARTICIPANT_ID: 'Participant ID cannot be null or undefined',
  DATABASE_INIT_FAILED: 'Failed to initialize sessions table',
  PARTICIPANT_NOT_FOUND: 'Participant not found',
};

export class RoomManager {
  private participants: Map<string, Participant> = new Map();
  private socketIdToParticipantId: Map<string, string> = new Map(); // 【性能改善】: O(1)検索用インデックス 🟡
  private readonly createdAt: Date;
  private isTableInitialized = false; // 【性能改善】: テーブル初期化状態のキャッシュ 🟡

  constructor() {
    this.createdAt = new Date();
  }

  /**
   * 【データベーステーブル初期化】: sessionsテーブルの作成（存在しない場合）
   * 【改善内容】: 初期化状態のキャッシュによる重複実行防止
   * 【パフォーマンス】: 初回のみ実行、以降はキャッシュ参照
   * 🟡 信頼性レベル: 一般的なDBテーブル初期化パターン
   */
  private async initializeDatabaseTable(): Promise<void> {
    // 【キャッシュチェック】: 既に初期化済みの場合はスキップ
    if (this.isTableInitialized || !pool) return;

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS sessions (
          id SERIAL PRIMARY KEY,
          participant_id VARCHAR(36) NOT NULL UNIQUE,
          socket_id VARCHAR(255) NOT NULL,
          room_id VARCHAR(255) NOT NULL,
          joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
          left_at TIMESTAMP NULL,
          user_agent TEXT,
          ip_address INET
        )
      `);

      // 【状態更新】: 初期化成功をキャッシュ
      this.isTableInitialized = true;
    } catch (error) {
      // 【エラーログ】: 運用監視用の詳細ログ
      console.error(ERROR_MESSAGES.DATABASE_INIT_FAILED, error);
      throw error; // 【原因保持】: 元のエラーをそのまま伝播
    }
  }

  /**
   * 【入力値検証】: Socket IDの妥当性チェック
   * 【改善内容】: 検証ロジックの分離による再利用性向上
   * 【セキュリティ】: 不正な入力値の早期検出
   * 🟡 信頼性レベル: 一般的な入力検証パターン
   */
  private validateSocketId(socketId: unknown): string {
    // 【型チェック】: TypeScript型システムの補完
    if (typeof socketId !== 'string') {
      throw new Error(ERROR_MESSAGES.INVALID_SOCKET_ID_TYPE);
    }

    // 【空文字チェック】: 意味のないIDの防止
    const trimmedId = socketId.trim();
    if (trimmedId === '') {
      throw new Error(ERROR_MESSAGES.EMPTY_SOCKET_ID);
    }

    // 【長さ制限】: データベース制約に合わせた切り詰め
    return trimmedId.length > ROOM_CONFIG.SOCKET_ID_MAX_LENGTH
      ? trimmedId.substring(0, ROOM_CONFIG.SOCKET_ID_MAX_LENGTH)
      : trimmedId;
  }

  /**
   * 【参加者追加】: 新規参加者をルームに追加
   * 【改善内容】: 入力検証の強化、インデックス管理の追加、エラーハンドリングの改善
   * 【設計方針】: トランザクション的な処理による整合性保証
   * 【パフォーマンス】: インデックスマップによる高速検索の実現
   * 🟢 信頼性レベル: REQ-001, REQ-004要件に基づく実装
   * @param {string} socketId - Socket.IOのクライアントID
   * @param {ConnectionInfo} connectionInfo - 接続情報（User-Agent、IPアドレス）
   * @returns {Promise<Participant>} - 作成された参加者オブジェクト
   */
  async addParticipant(socketId: string, connectionInfo?: ConnectionInfo): Promise<Participant> {
    // 【入力検証】: 専用メソッドによる厳密な検証
    const validatedSocketId = this.validateSocketId(socketId);

    // 【容量チェック】: 最大参加者数の制限確認
    if (this.isRoomFull()) {
      throw new Error(ERROR_MESSAGES.ROOM_FULL);
    }

    // 【重複チェック】: 同一Socket IDの参加防止
    if (this.socketIdToParticipantId.has(validatedSocketId)) {
      throw new Error(`Participant with socket ID ${validatedSocketId} already exists`);
    }

    // 【参加者オブジェクト作成】: 一意性が保証されたIDの生成
    const participant: Participant = {
      id: uuidv4(),
      socketId: validatedSocketId,
      joinedAt: new Date(),
      isMuted: false,
      isSharingScreen: false,
      connectionQuality: ROOM_CONFIG.DEFAULT_CONNECTION_QUALITY,
    };

    try {
      // 【データベース記録】: 永続化処理
      if (pool) {
        await this.initializeDatabaseTable();
        await this.recordParticipantSession(participant, connectionInfo);
      }

      // 【メモリ管理】: 参加者情報とインデックスの更新
      this.participants.set(participant.id, participant);
      this.socketIdToParticipantId.set(validatedSocketId, participant.id);

      return participant;
    } catch (error) {
      // 【ロールバック】: エラー時の整合性保証
      this.participants.delete(participant.id);
      this.socketIdToParticipantId.delete(validatedSocketId);
      throw error;
    }
  }

  /**
   * 【セッション記録】: データベースへの参加者セッション記録
   * 【改善内容】: 責任の分離によるメソッドの単純化
   * 【設計方針】: データベース操作の詳細を隠蔽
   * 🟡 信頼性レベル: 一般的なデータベース操作パターン
   */
  private async recordParticipantSession(
    participant: Participant,
    connectionInfo?: ConnectionInfo
  ): Promise<void> {
    if (!pool) {
      throw new Error('Database pool not available');
    }

    await pool.query(
      `INSERT INTO sessions (participant_id, socket_id, room_id, user_agent, ip_address) 
       VALUES ($1, $2, $3, $4, $5)`,
      [
        participant.id,
        participant.socketId,
        ROOM_CONFIG.DEFAULT_ROOM_ID,
        connectionInfo?.userAgent || 'Unknown',
        connectionInfo?.ipAddress || '127.0.0.1',
      ]
    );
  }

  /**
   * 【参加者削除】: 参加者をルームから削除
   * 【改善内容】: インデックスの同期管理、エラーハンドリングの改善
   * 【設計方針】: データ整合性を保証する削除処理
   * 【パフォーマンス】: インデックスの同時更新による一貫性維持
   * 🟢 信頼性レベル: REQ-001要件に基づく実装
   * @param {string} participantId - 削除する参加者のID
   */
  async removeParticipant(participantId: string): Promise<void> {
    // 【入力検証】: null/undefinedチェック
    if (participantId == null) {
      throw new Error(ERROR_MESSAGES.INVALID_PARTICIPANT_ID);
    }

    // 【存在確認】: 参加者の存在チェック
    const participant = this.participants.get(participantId);
    if (!participant) {
      return; // 【冪等性保証】: 存在しない場合も正常終了
    }

    try {
      // 【データベース更新】: 退出時刻の記録
      if (pool) {
        await pool.query('UPDATE sessions SET left_at = NOW() WHERE participant_id = $1', [
          participantId,
        ]);
      }

      // 【メモリ管理】: 参加者情報とインデックスの削除
      this.participants.delete(participantId);
      this.socketIdToParticipantId.delete(participant.socketId);
    } catch (error) {
      // 【エラーログ】: 削除失敗の詳細記録
      console.error('Error removing participant:', error);
      throw error;
    }
  }

  /**
   * 【Socket IDで参加者検索】: Socket IDから参加者を高速検索
   * 【改善内容】: インデックスマップによるO(1)検索の実現
   * 【パフォーマンス】: 線形検索からハッシュマップ検索への最適化
   * 🟡 信頼性レベル: 一般的な検索最適化パターン
   * @param {string} socketId - 検索するSocket ID
   * @returns {Participant | undefined} - 見つかった参加者またはundefined
   */
  getParticipantBySocketId(socketId: string): Participant | undefined {
    // 【入力検証】: 無効な入力の早期リターン
    if (!socketId || typeof socketId !== 'string') {
      return undefined;
    }

    // 【高速検索】: インデックスマップを使用したO(1)検索
    const participantId = this.socketIdToParticipantId.get(socketId);
    return participantId ? this.participants.get(participantId) : undefined;
  }

  /**
   * 【参加者一覧取得】: 現在の参加者マップを返す
   * 【設計方針】: 内部状態の直接公開（読み取り専用を前提）
   * 🟢 信頼性レベル: 既存インターフェースの維持
   */
  getParticipants(): Map<string, Participant> {
    return this.participants;
  }

  /**
   * 【満員状態チェック】: ルームが最大容量に達しているかチェック
   * 【設計方針】: 定数を使用した明確な条件判定
   * 🟢 信頼性レベル: NFR-004要件に基づく実装
   */
  isRoomFull(): boolean {
    return this.participants.size >= ROOM_CONFIG.MAX_CAPACITY;
  }

  /**
   * 【現在の参加者数】: 現在の参加者数を返す
   * 【設計方針】: シンプルなゲッターメソッド
   * 🟢 信頼性レベル: 基本的なアクセサメソッド
   */
  getCurrentParticipantCount(): number {
    return this.participants.size;
  }

  /**
   * 【最大容量取得】: ルームの最大容量を返す
   * 【設計方針】: 設定値の外部公開
   * 🟢 信頼性レベル: 設定値の参照
   */
  getMaxCapacity(): number {
    return ROOM_CONFIG.MAX_CAPACITY;
  }

  /**
   * 【利用可能スロット数】: 利用可能なスロット数を返す
   * 【設計方針】: 動的な空き状況の計算
   * 🟢 信頼性レベル: 基本的な算術演算
   */
  getAvailableSlots(): number {
    return ROOM_CONFIG.MAX_CAPACITY - this.participants.size;
  }

  /**
   * 【ルームID取得】: ルームIDを返す
   * 【設計方針】: 設定値の外部公開
   * 🟢 信頼性レベル: 設定値の参照
   */
  getRoomId(): string {
    return ROOM_CONFIG.DEFAULT_ROOM_ID;
  }

  /**
   * 【ルーム統計情報】: ルームの統計情報を返す
   * 【改善内容】: メソッド呼び出しによる一貫性の確保
   * 【設計方針】: 統計情報の一元的な提供
   * 🟢 信頼性レベル: 既存メソッドの組み合わせ
   */
  getRoomStats(): {
    participantCount: number;
    maxCapacity: number;
    availableSlots: number;
    isActive: boolean;
    createdAt: Date;
  } {
    return {
      participantCount: this.getCurrentParticipantCount(),
      maxCapacity: this.getMaxCapacity(),
      availableSlots: this.getAvailableSlots(),
      isActive: true,
      createdAt: this.createdAt,
    };
  }

  /**
   * 【テスト用クリア】: 参加者リストをクリア（テスト用）
   * 【改善内容】: インデックスマップも同時にクリア
   * 【設計方針】: テスト間の状態分離を保証
   * 🟢 信頼性レベル: テスト要件に基づく実装
   */
  clearParticipants(): void {
    this.participants.clear();
    this.socketIdToParticipantId.clear();
  }

  /**
   * 【テスト用リセット】: テスト用の状態リセット（clearParticipantsのエイリアス）
   * 【設計方針】: テストコードとの一貫性のためのエイリアス
   * 🟢 信頼性レベル: テスト要件に基づく実装
   */
  resetForTesting(): void {
    this.clearParticipants();
  }
}

// 【シングルトンインスタンス管理】: アプリケーション全体で共有するインスタンス
let roomManagerInstance: RoomManager | null = null;

/**
 * 【シングルトン取得】: RoomManagerのシングルトンインスタンスを取得
 * 【設計方針】: グローバルな状態管理の一元化
 * 🟢 信頼性レベル: 一般的なシングルトンパターン
 */
export function getRoomManager(): RoomManager {
  if (!roomManagerInstance) {
    roomManagerInstance = new RoomManager();
  }
  return roomManagerInstance;
}

/**
 * 【テスト用リセット】: テスト用のシングルトンリセット関数
 * 【設計方針】: テスト間の独立性保証
 * 🟢 信頼性レベル: テスト要件に基づく実装
 */
export function resetRoomManager(): void {
  roomManagerInstance = null;
}

/**
 * 【テスト用クリア】: 現在のRoomManagerの参加者をクリア
 * 【設計方針】: 既存インスタンスの状態リセット
 * 🟢 信頼性レベル: テスト要件に基づく実装
 */
export function clearRoomParticipants(): void {
  if (roomManagerInstance) {
    roomManagerInstance.clearParticipants();
  }
}
