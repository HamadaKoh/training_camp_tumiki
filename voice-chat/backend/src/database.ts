import { Pool } from 'pg';
import { config } from './config';

/**
 * 【機能概要】: PostgreSQLデータベース接続プールの管理と高レベルAPI提供
 * 【改善内容】: 設定の外部化、エラーハンドリング強化、接続プール最適化
 * 【設計方針】: 設定の一元管理、型安全性の向上、保守性の向上
 * 【パフォーマンス】: 接続プール設定の最適化、クエリタイムアウト制御
 * 【保守性】: 設定変更の影響を最小化、テスタビリティ向上
 * 🟢 信頼性レベル: database-schema.sqlとPostgreSQL接続要件に基づく
 */

/**
 * 【接続プール管理】: アプリケーション全体で共有する接続プール
 * 【改善内容】: プライベート変数化によるカプセル化強化
 * 【アクセス制御】: 直接アクセスを防ぎ、適切なAPIを通じた操作を強制
 */
let pool: Pool | null = null;

/**
 * 【テスト用エクスポート】: テストでのデータベース直接アクセス用
 * 【使用目的】: セッションテーブルの検証とテストデータクリーンアップ
 */
export { pool };

/**
 * 【データベース接続状態】: 接続プールの現在の状態を管理
 * 【監視機能】: 接続状態の追跡による運用監視支援
 */
let connectionState: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';

/**
 * 【機能概要】: PostgreSQLデータベース接続プールを初期化する
 * 【改善内容】: 設定の外部化、詳細なエラーハンドリング、接続状態管理の追加
 * 【実装方針】: 一元化された設定を使用し、エラー情報の詳細化と接続状態の可視化
 * 【テスト対応】: connectDatabase()呼び出しテストを通すための実装
 * 🟢 信頼性レベル: PostgreSQL公式ドキュメントと接続要件に基づく
 */
export async function connectDatabase(): Promise<void> {
  // 【重複接続防止】: 既存接続がある場合の適切な処理
  if (connectionState === 'connected' && pool) {
    return; // 【冪等性保証】: 複数回呼び出しても安全
  }

  // 【接続状態更新】: 接続処理開始の記録
  connectionState = 'connecting';

  try {
    // 【接続プール作成】: 外部化された設定を使用した pg.Pool インスタンスの初期化
    // 【設定最適化】: パフォーマンスと安定性を考慮した設定値
    pool = new Pool({
      host: config.DB_HOST,
      port: config.DB_PORT,
      database: config.DB_NAME,
      user: config.DB_USER,
      password: config.DB_PASSWORD,
      max: config.DB_POOL_SIZE, // 【接続数最適化】: 設定可能な最大接続数
      idleTimeoutMillis: config.DB_IDLE_TIMEOUT, // 【リソース管理】: アイドル接続の効率的な管理
      connectionTimeoutMillis: 10000, // 【接続タイムアウト】: 接続失敗の早期検出
      query_timeout: config.HEALTH_CHECK_TIMEOUT, // 【クエリタイムアウト】: 長時間実行クエリの制御
    });

    // 【接続プールイベント処理】: 接続プールの状態監視
    // 【運用監視】: 本番環境での問題の早期発見
    pool.on('error', (err) => {
      console.error('Database pool error:', err);
      connectionState = 'error';
    });

    // 【接続確認】: プール作成後の接続テスト実行
    // 【信頼性向上】: 実際のクエリ実行による接続確認
    await pool.query('SELECT 1 as connection_test');

    // 【接続成功】: 状態更新
    connectionState = 'connected';
  } catch (error) {
    // 【接続失敗処理】: 詳細なエラー情報とクリーンアップ
    connectionState = 'error';

    // 【リソースクリーンアップ】: 部分的に作成されたプールの適切な削除
    if (pool) {
      try {
        await pool.end();
      } catch (endError) {
        console.error('Error while cleaning up failed pool:', endError);
      }
      pool = null;
    }

    // 【エラー情報強化】: デバッグに有用な詳細情報の追加
    const enhancedError = new Error(
      `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    enhancedError.cause = error;
    throw enhancedError;
  }
}

/**
 * 【機能概要】: データベース接続プールを適切に終了する
 * 【改善内容】: 接続状態管理の追加、詳細なエラーハンドリング
 * 【実装方針】: リソースリークを防ぐための確実なクリーンアップと状態管理
 * 【テスト対応】: afterEachでのクリーンアップテストを通すための実装
 * 🟢 信頼性レベル: pg.Pool標準的な終了処理に基づく
 */
export async function disconnectDatabase(): Promise<void> {
  // 【既に切断済みの場合】: 重複処理の回避
  if (connectionState === 'disconnected' || !pool) {
    connectionState = 'disconnected';
    return; // 【冪等性保証】: 複数回呼び出しても安全
  }

  try {
    // 【接続プール終了】: 全ての接続を適切に閉じる
    // 【グレースフル終了】: 進行中のクエリの完了を待機
    await pool.end();
  } catch (error) {
    // 【終了エラー処理】: 終了時のエラーもログに記録
    console.error('Error during database disconnection:', error);
  } finally {
    // 【確実なクリーンアップ】: エラーが発生しても状態はリセット
    pool = null;
    connectionState = 'disconnected';
  }
}

/**
 * 【機能概要】: データベース接続の生存確認を行う
 * 【改善内容】: 接続状態の活用、タイムアウト制御、詳細なエラー分類
 * 【実装方針】: 健康チェックAPIで使用する接続状態の確認と運用監視情報の提供
 * 【テスト対応】: testDatabaseConnection()テストと健康チェック統合テストを通すための実装
 * 🟢 信頼性レベル: PostgreSQL健康チェックベストプラクティスに基づく
 * @returns {Promise<boolean>} - 接続が正常な場合true、それ以外false
 */
export async function testDatabaseConnection(): Promise<boolean> {
  // 【プール状態確認】: 接続プールと状態の両方をチェック
  if (!pool || connectionState === 'error' || connectionState === 'disconnected') {
    return false; // 【未初期化・エラー状態処理】: 明確に接続不可な状態
  }

  // 【接続中状態】: 接続処理中の場合は接続完了を待つのではなく false を返す
  if (connectionState === 'connecting') {
    return false; // 【接続中処理】: 健康チェック時点では未接続として扱う
  }

  try {
    // 【接続テスト実行】: タイムアウト付きクエリで確実な接続確認
    // 【クエリ最適化】: より詳細な接続情報を取得する改良版クエリ
    const result = await pool.query('SELECT 1 as health_check, NOW() as server_time');

    // 【結果検証】: クエリ結果の妥当性確認
    if (result.rows && result.rows.length > 0 && result.rows[0].health_check === 1) {
      return true; // 【成功時】: 正常な接続確認
    }

    return false; // 【異常な結果】: クエリは成功したが期待する結果ではない
  } catch (error) {
    // 【エラー分類】: エラーの種類に応じた状態更新
    if (error instanceof Error) {
      // 【接続エラーの場合】: 接続状態をエラーに更新
      if (error.message.includes('connect') || error.message.includes('ECONNREFUSED')) {
        connectionState = 'error';
      }
    }

    // 【エラーログ】: 運用監視のための詳細ログ出力
    console.warn('Database health check failed:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      connectionState,
      timestamp: new Date().toISOString(),
    });

    return false; // 【エラー時】: 接続不可として処理
  }
}

/**
 * 【機能概要】: データベース接続状態を取得する
 * 【改善内容】: 接続状態の可視化による運用監視支援
 * 【設計方針】: システムの現在状態を外部から確認可能にする
 * 🟡 信頼性レベル: 運用監視要件からの推測
 * @returns {string} - 現在の接続状態
 */
export function getDatabaseConnectionState(): string {
  return connectionState;
}

/**
 * 【機能概要】: データベース接続プールの詳細情報を取得する
 * 【改善内容】: 運用監視とデバッグのための詳細情報提供
 * 【設計方針】: プールの使用状況を可視化し、性能問題の早期発見を支援
 * 🟡 信頼性レベル: 運用監視要件からの推測
 * @returns {object|null} - プール情報またはnull
 */
export function getDatabasePoolInfo(): object | null {
  if (!pool) {
    return null;
  }

  return {
    totalCount: pool.totalCount, // 【総接続数】: 作成された総接続数
    idleCount: pool.idleCount, // 【アイドル接続数】: 利用可能な接続数
    waitingCount: pool.waitingCount, // 【待機数】: 接続待ちのクライアント数
    state: connectionState, // 【接続状態】: 現在の接続状態
  };
}
