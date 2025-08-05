import { getRoomManager } from './room-manager';

/**
 * 【機能概要】: 画面共有の排他制御と状態管理を行うコアクラス
 * 【改善内容】: 定数の外部化、エラーハンドリング改善、型安全性向上
 * 【実装方針】: Socket.IOイベントとの統合、1人のみ画面共有可能な排他制御
 * 【テスト対応】: 16テストケースを通すための画面共有制御実装
 * 🟢 信頼性レベル: requirements.mdとREQ-405排他制御要件に基づく
 */

// 【設定定数】: 画面共有処理に関する設定値の一元化 🟢
// 【調整可能性】: 環境変数での上書きを想定した定数設計 🟡
const SCREEN_SHARE_CONFIG = {
  MAX_SHARING_PARTICIPANTS: 1, // 【最大同時共有数】: REQ-405要件に基づく1人制限 🟢
  AUTO_RETRY_ENABLED: true, // 【自動再試行】: 配信失敗時の自動再試行設定 🟡
  DELIVERY_FAILURE_DELAY: 100, // 【配信失敗遅延】: テスト用の配信失敗シミュレーション遅延 🟡
  SESSION_TIMEOUT_MS: 3600000, // 【セッションタイムアウト】: 1時間の最大セッション時間 🟡
} as const;

// 【エラーコード定数】: 画面共有エラーコードの一元管理 🟡
// 【保守性向上】: エラーコード変更時の影響範囲を限定 🟡
const SCREEN_SHARE_ERROR_CODES = {
  DATABASE_ERROR: 'DATABASE_ERROR',
  UNAUTHORIZED_PARTICIPANT: 'UNAUTHORIZED_PARTICIPANT',
  SCREEN_SHARE_IN_USE: 'SCREEN_SHARE_IN_USE',
  UNAUTHORIZED_STOP: 'UNAUTHORIZED_STOP',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  DELIVERY_FAILED: 'DELIVERY_FAILED',
} as const;

// 【エラーメッセージ定数】: エラーメッセージの一元管理 🟡
// 【国際化対応】: 将来的な多言語対応を想定した構造 🟡
const SCREEN_SHARE_ERROR_MESSAGES = {
  DATABASE_ERROR: '一時的な障害が発生しました',
  UNAUTHORIZED_PARTICIPANT: '参加者として認証されていません',
  SCREEN_SHARE_IN_USE: '他の参加者が画面共有中です',
  UNAUTHORIZED_STOP: '画面共有の停止権限がありません',
  INTERNAL_ERROR: '内部エラーが発生しました',
  VALIDATION_ERROR: '無効なリクエスト形式です',
  DELIVERY_FAILED: '画面共有の配信に失敗しました',
} as const;

// 画面共有レスポンス構造
export interface ScreenShareResponse {
  success: boolean;
  granted: boolean;
  error?: {
    code: string;
    message: string;
  };
}

// 画面共有エラーデータ構造
export interface ScreenShareErrorData {
  code: string;
  message: string;
  autoRetry?: boolean;
}

/**
 * 【機能概要】: 画面共有排他制御のコアクラス
 * 【実装方針】: 1人のみ画面共有可能、状態管理、Socket.IOイベント統合
 * 【テスト対応】: 全画面共有テストケースを通すための実装
 * 🟢 信頼性レベル: REQ-405排他制御とSocket.IO要件に基づく
 */
export class ScreenShareManager {
  private roomManager = getRoomManager();
  private currentSharingParticipantId: string | null = null;
  private stats = {
    totalScreenShareSessions: 0,
    activeScreenShareSessions: 0,
    errorSessions: 0,
  };

  // テスト用のモック制御フラグ
  private databaseFailureSimulation = false;
  private deliveryFailureCallback?: (participantId: string) => void;

  /**
   * 【画面共有開始リクエスト】: 画面共有開始の処理
   * 【実装方針】: 排他制御、参加者存在確認、状態更新
   * 【テスト対応】: SCREEN-NORMAL-002テストを通すための実装
   * 🟢 信頼性レベル: REQ-405排他制御要件に基づく
   */
  async requestScreenShare(socketId: string): Promise<ScreenShareResponse> {
    try {
      // DB障害シミュレーション（テスト用）
      if (this.databaseFailureSimulation) {
        return {
          success: false,
          granted: false,
          error: {
            code: SCREEN_SHARE_ERROR_CODES.DATABASE_ERROR,
            message: SCREEN_SHARE_ERROR_MESSAGES.DATABASE_ERROR,
          },
        };
      }

      // 参加者存在確認
      const participant = this.roomManager.getParticipantBySocketId(socketId);
      if (!participant) {
        return {
          success: false,
          granted: false,
          error: {
            code: SCREEN_SHARE_ERROR_CODES.UNAUTHORIZED_PARTICIPANT,
            message: SCREEN_SHARE_ERROR_MESSAGES.UNAUTHORIZED_PARTICIPANT,
          },
        };
      }

      // 排他制御チェック
      if (this.currentSharingParticipantId !== null) {
        return {
          success: false,
          granted: false,
          error: {
            code: SCREEN_SHARE_ERROR_CODES.SCREEN_SHARE_IN_USE,
            message: SCREEN_SHARE_ERROR_MESSAGES.SCREEN_SHARE_IN_USE,
          },
        };
      }

      // 画面共有開始
      this.currentSharingParticipantId = participant.id;
      this.stats.totalScreenShareSessions++;
      this.stats.activeScreenShareSessions++;

      return {
        success: true,
        granted: true,
      };
    } catch (error) {
      this.stats.errorSessions++;
      return {
        success: false,
        granted: false,
        error: {
          code: SCREEN_SHARE_ERROR_CODES.INTERNAL_ERROR,
          message: SCREEN_SHARE_ERROR_MESSAGES.INTERNAL_ERROR,
        },
      };
    }
  }

  /**
   * 【画面共有停止処理】: 画面共有停止の処理
   * 【実装方針】: 権限確認、状態クリア
   * 【テスト対応】: SCREEN-NORMAL-003テストを通すための実装
   * 🟢 信頼性レベル: 権限管理要件に基づく
   */
  async stopScreenShare(
    socketId: string
  ): Promise<{ success: boolean; error?: ScreenShareErrorData }> {
    try {
      // 参加者存在確認
      const participant = this.roomManager.getParticipantBySocketId(socketId);
      if (!participant) {
        return {
          success: false,
          error: {
            code: SCREEN_SHARE_ERROR_CODES.UNAUTHORIZED_PARTICIPANT,
            message: SCREEN_SHARE_ERROR_MESSAGES.UNAUTHORIZED_PARTICIPANT,
          },
        };
      }

      // 権限確認
      if (this.currentSharingParticipantId !== participant.id) {
        return {
          success: false,
          error: {
            code: SCREEN_SHARE_ERROR_CODES.UNAUTHORIZED_STOP,
            message: SCREEN_SHARE_ERROR_MESSAGES.UNAUTHORIZED_STOP,
          },
        };
      }

      // 画面共有停止
      this.currentSharingParticipantId = null;
      this.stats.activeScreenShareSessions--;

      return { success: true };
    } catch (error) {
      this.stats.errorSessions++;
      return {
        success: false,
        error: {
          code: SCREEN_SHARE_ERROR_CODES.INTERNAL_ERROR,
          message: SCREEN_SHARE_ERROR_MESSAGES.INTERNAL_ERROR,
        },
      };
    }
  }

  /**
   * 【画面共有状態確認】: 現在画面共有がアクティブかチェック
   * 【実装方針】: シンプルな状態チェック
   * 【テスト対応】: SCREEN-NORMAL-001テストを通すための実装
   * 🟢 信頼性レベル: 基本的な状態管理
   */
  isScreenSharingActive(): boolean {
    return this.currentSharingParticipantId !== null;
  }

  /**
   * 【現在の共有者取得】: 現在画面共有中の参加者IDを取得
   * 【実装方針】: シンプルな状態取得
   * 【テスト対応】: SCREEN-NORMAL-001テストを通すための実装
   * 🟢 信頼性レベル: 基本的な状態管理
   */
  getCurrentScreenSharingParticipant(): string | null {
    return this.currentSharingParticipantId;
  }

  /**
   * 【参加者切断時処理】: 画面共有中の参加者切断時の自動停止処理
   * 【実装方針】: 自動クリーンアップ、状態整合性維持
   * 【テスト対応】: SCREEN-NORMAL-006テストを通すための実装
   * 🟢 信頼性レベル: 切断処理要件に基づく
   */
  onParticipantDisconnected(participantId: string): void {
    if (this.currentSharingParticipantId === participantId) {
      this.currentSharingParticipantId = null;
      this.stats.activeScreenShareSessions--;
    }
  }

  /**
   * 【統計情報取得】: 画面共有処理の統計情報
   * 【実装方針】: セッション数とエラー率の提供
   * 【テスト対応】: SCREEN-NORMAL-005テストを通すための実装
   * 🟡 信頼性レベル: 基本的な統計実装
   */
  getStats(): {
    totalScreenShareSessions: number;
    activeScreenShareSessions: number;
    errorSessions: number;
  } {
    return { ...this.stats };
  }

  /**
   * 【テスト用DB障害シミュレーション】: テスト用のDB障害状態制御
   * 【実装方針】: テスト用のモック機能
   * 【テスト対応】: SCREEN-ERROR-004テストを通すための実装
   * 🟡 信頼性レベル: テスト要件に基づく
   */
  simulateDatabaseFailure(enable: boolean): void {
    this.databaseFailureSimulation = enable;
  }

  /**
   * 【テスト用配信障害シミュレーション】: 配信障害の発生
   * 【実装方針】: テスト用のモック機能
   * 【テスト対応】: SCREEN-ERROR-005テストを通すための実装
   * 🟡 信頼性レベル: テスト要件に基づく
   */
  simulateDeliveryFailure(): void {
    // 配信障害をシミュレートし、コールバックを実行
    if (this.deliveryFailureCallback && this.currentSharingParticipantId) {
      setTimeout(() => {
        if (this.deliveryFailureCallback && this.currentSharingParticipantId) {
          this.deliveryFailureCallback(this.currentSharingParticipantId);
        }
      }, SCREEN_SHARE_CONFIG.DELIVERY_FAILURE_DELAY); // 設定値による配信失敗シミュレート遅延
    }
  }

  /**
   * 【配信失敗コールバック設定】: 配信失敗時のコールバック関数を設定
   * 【実装方針】: Socket.IOとの統合用
   * 【テスト対応】: SCREEN-ERROR-005テストを通すための実装
   * 🟡 信頼性レベル: テスト要件に基づく
   */
  setDeliveryFailureCallback(callback: (participantId: string) => void): void {
    this.deliveryFailureCallback = callback;
  }

  /**
   * 【統計リセット】: テスト用の統計情報リセット
   * 【実装方針】: テスト間での状態クリーンアップ
   * 【テスト対応】: テスト分離のための実装
   * 🟡 信頼性レベル: テスト要件に基づく
   */
  resetStats(): void {
    this.stats = {
      totalScreenShareSessions: 0,
      activeScreenShareSessions: 0,
      errorSessions: 0,
    };
    this.currentSharingParticipantId = null;
  }
}

// 【シングルトンインスタンス管理】: アプリケーション全体で共有するインスタンス
let screenShareManagerInstance: ScreenShareManager | null = null;

/**
 * 【シングルトン取得】: ScreenShareManagerのシングルトンインスタンスを取得
 * 【設計方針】: グローバルな画面共有状態管理の一元化
 * 🟢 信頼性レベル: 一般的なシングルトンパターン
 */
export function getScreenShareManager(): ScreenShareManager {
  if (!screenShareManagerInstance) {
    screenShareManagerInstance = new ScreenShareManager();
  }
  return screenShareManagerInstance;
}

/**
 * 【テスト用リセット】: テスト用のシングルトンリセット関数
 * 【設計方針】: テスト間の独立性保証
 * 🟢 信頼性レベル: テスト要件に基づく実装
 */
export function resetScreenShareManager(): void {
  screenShareManagerInstance = null;
}
