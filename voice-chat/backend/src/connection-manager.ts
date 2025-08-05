/**
 * 【機能概要】: Socket.IO接続数管理とセッション制御
 * 【改善内容】: グローバル変数の分離、スレッドセーフな接続管理、詳細な接続状態追跡
 * 【設計方針】: 単一責任原則に基づく接続管理の専門化、テスタビリティと保守性の向上
 * 【パフォーマンス】: 効率的な接続カウンター管理、メモリ使用量の最適化
 * 【保守性】: 接続ロジックの一元化、設定変更の影響範囲最小化
 * 🟡 信頼性レベル: Socket.IO接続管理のベストプラクティスからの推測
 */

import { config } from './config';

/**
 * 【接続情報インターフェース】: 接続の詳細情報を管理するための型定義
 * 【型安全性】: TypeScriptの型システムを活用した安全な接続管理
 */
interface ConnectionInfo {
  id: string;
  connectedAt: Date;
  lastActivity: Date;
  userAgent?: string;
  ipAddress?: string;
}

/**
 * 【接続管理クラス】: Socket.IO接続の一元管理
 * 【改善内容】: グローバル変数の代替、接続状態の詳細管理
 * 【カプセル化】: 接続データへのアクセス制御、内部状態の保護
 */
class ConnectionManager {
  private connections: Map<string, ConnectionInfo> = new Map();
  private readonly maxConnections: number;

  constructor(maxConnections: number = config.MAX_CONNECTIONS) {
    this.maxConnections = maxConnections;
  }

  /**
   * 【接続追加】: 新しい接続をシステムに登録
   * 【改善内容】: 接続情報の詳細化、重複接続の防止
   * 【スレッドセーフ】: Map操作による原子性保証
   * @param connectionId - 一意の接続識別子
   * @param metadata - 接続メタデータ（IPアドレス、User-Agent等）
   * @returns 接続が成功した場合true、制限超過の場合false
   */
  public addConnection(
    connectionId: string,
    metadata?: { userAgent?: string; ipAddress?: string }
  ): boolean {
    // 【接続数制限チェック】: 最大接続数の事前確認
    if (this.connections.size >= this.maxConnections) {
      return false; // 【制限超過】: 新規接続を拒否
    }

    // 【重複接続防止】: 既存接続の確認
    if (this.connections.has(connectionId)) {
      // 【既存接続の更新】: 最終活動時刻を更新
      const existing = this.connections.get(connectionId)!;
      existing.lastActivity = new Date();
      return true; // 【既存接続】: 既に接続済みとして処理
    }

    // 【新規接続情報作成】: 詳細な接続情報の記録
    const connectionInfo: ConnectionInfo = {
      id: connectionId,
      connectedAt: new Date(),
      lastActivity: new Date(),
      userAgent: metadata?.userAgent,
      ipAddress: metadata?.ipAddress,
    };

    // 【接続登録】: Map への追加
    this.connections.set(connectionId, connectionInfo);
    return true; // 【接続成功】: 新規接続の成功
  }

  /**
   * 【接続削除】: 接続をシステムから除去
   * 【改善内容】: 確実な接続クリーンアップ、存在確認
   * @param connectionId - 削除する接続の識別子
   * @returns 削除された場合true、存在しない場合false
   */
  public removeConnection(connectionId: string): boolean {
    return this.connections.delete(connectionId);
  }

  /**
   * 【接続数取得】: 現在の接続数を取得
   * 【リアルタイム監視】: 瞬間的な接続数の確認
   * @returns 現在の接続数
   */
  public getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * 【接続可能性確認】: 新規接続が可能かどうかを判定
   * 【事前チェック】: 接続試行前の容量確認
   * @returns 接続可能な場合true
   */
  public canAcceptConnection(): boolean {
    return this.connections.size < this.maxConnections;
  }

  /**
   * 【接続詳細取得】: 特定接続の詳細情報を取得
   * 【デバッグ支援】: 接続問題の調査用詳細情報
   * @param connectionId - 接続識別子
   * @returns 接続情報またはundefined
   */
  public getConnectionInfo(connectionId: string): ConnectionInfo | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * 【全接続情報取得】: 全接続の概要情報を取得
   * 【運用監視】: システム全体の接続状況の可視化
   * @returns 接続統計情報
   */
  public getConnectionsStats(): {
    total: number;
    maxConnections: number;
    available: number;
    oldestConnection: number | null;
    newestConnection: number | null;
    avgConnectionAge: number;
  } {
    const now = new Date();
    const connections = Array.from(this.connections.values());

    return {
      total: connections.length,
      maxConnections: this.maxConnections,
      available: this.maxConnections - connections.length,
      oldestConnection:
        connections.length > 0
          ? Math.min(...connections.map((c) => c.connectedAt.getTime()))
          : null,
      newestConnection:
        connections.length > 0
          ? Math.max(...connections.map((c) => c.connectedAt.getTime()))
          : null,
      avgConnectionAge:
        connections.length > 0
          ? connections.reduce((sum, c) => sum + (now.getTime() - c.connectedAt.getTime()), 0) /
            connections.length
          : 0,
    };
  }

  /**
   * 【活動時刻更新】: 接続の最終活動時刻を更新
   * 【セッション管理】: アクティブな接続の追跡
   * @param connectionId - 接続識別子
   */
  public updateLastActivity(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.lastActivity = new Date();
    }
  }

  /**
   * 【接続リセット】: 全接続を削除（主にテスト用）
   * 【テスト支援】: テスト間のクリーンアップ
   */
  public reset(): void {
    this.connections.clear();
  }

  /**
   * 【古い接続のクリーンアップ】: 非アクティブ接続の自動削除
   * 【リソース管理】: 長期間非アクティブな接続の自動削除
   * @param maxIdleTimeMs - 最大アイドル時間（ミリ秒）
   * @returns クリーンアップされた接続数
   */
  public cleanupIdleConnections(maxIdleTimeMs: number = 300000): number {
    // デフォルト5分
    const now = new Date();
    let cleanedCount = 0;

    for (const [id, info] of this.connections.entries()) {
      const idleTime = now.getTime() - info.lastActivity.getTime();
      if (idleTime > maxIdleTimeMs) {
        this.connections.delete(id);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }
}

// 【シングルトンインスタンス】: アプリケーション全体で共有する接続管理インスタンス
// 【改善内容】: グローバル変数からクラスベース管理への移行
export const connectionManager = new ConnectionManager();

/**
 * 【レガシー互換性】: 既存コードとの互換性を保つためのヘルパー関数
 * 【段階的移行】: 既存のテストコードへの影響を最小化
 */
export function resetConnectionCount(): void {
  connectionManager.reset();
}
