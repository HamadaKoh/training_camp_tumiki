/**
 * 【機能概要】: アプリケーション設定の一元管理
 * 【改善内容】: ハードコーディングされた設定値を外部化し、環境別設定を可能にする
 * 【設計方針】: 設定値の一元管理による保守性向上とセキュリティ強化
 * 【パフォーマンス】: 設定値の事前計算による実行時オーバーヘッド削減
 * 【保守性】: 設定変更時の影響範囲を最小化し、テスタビリティを向上
 * 🟡 信頼性レベル: 一般的なNode.js設定管理パターンからの妥当な推測
 */

// 【環境変数型定義】: 型安全性を確保するための環境変数インターフェース
interface EnvironmentConfig {
  NODE_ENV: string;
  PORT: number;
  DB_HOST: string;
  DB_PORT: number;
  DB_NAME: string;
  DB_USER: string;
  DB_PASSWORD: string;
  CORS_ORIGINS: string[];
  MAX_CONNECTIONS: number;
  DB_POOL_SIZE: number;
  DB_IDLE_TIMEOUT: number;
  HEALTH_CHECK_TIMEOUT: number;
}

/**
 * 【設定値解析】: 環境変数の安全な解析とデフォルト値適用
 * 【エラーハンドリング】: 不正な設定値に対する適切なフォールバック処理
 * 【セキュリティ強化】: 本番環境では安全なデフォルト値を使用せず、明示的な設定を要求
 */
function parseEnvironmentConfig(): EnvironmentConfig {
  // 【開発環境判定】: 本番環境での設定不備を防ぐための環境判定
  const isDevelopment = process.env.NODE_ENV !== 'production';

  // 【CORS オリジン解析】: カンマ区切り文字列から配列への変換
  const corsOriginsStr = process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173';
  const corsOrigins = corsOriginsStr.split(',').map((origin) => origin.trim());

  return {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: parseInt(process.env.PORT || '3000', 10),

    // 【データベース設定】: セキュリティを考慮した設定値管理
    DB_HOST: process.env.DB_HOST || (isDevelopment ? 'localhost' : ''),
    DB_PORT: parseInt(process.env.DB_PORT || '5432', 10),
    DB_NAME: process.env.DB_NAME || (isDevelopment ? 'voice_chat_db' : ''),
    DB_USER: process.env.DB_USER || (isDevelopment ? 'voice_chat_user' : ''),
    DB_PASSWORD: process.env.DB_PASSWORD || (isDevelopment ? 'voice_chat_pass' : ''),

    // 【CORS設定】: 環境別オリジン制御
    CORS_ORIGINS: corsOrigins,

    // 【接続制限設定】: パフォーマンスと安定性のバランス
    MAX_CONNECTIONS: parseInt(process.env.MAX_CONNECTIONS || '10', 10),

    // 【データベースプール設定】: 最適化されたデフォルト値
    DB_POOL_SIZE: parseInt(process.env.DB_POOL_SIZE || '10', 10),
    DB_IDLE_TIMEOUT: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),

    // 【健康チェック設定】: タイムアウト値の調整可能化
    HEALTH_CHECK_TIMEOUT: parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000', 10),
  };
}

/**
 * 【設定値検証】: 設定値の妥当性チェックとエラーハンドリング
 * 【セキュリティ強化】: 本番環境での必須設定値の検証
 * 【早期エラー検出】: アプリケーション起動時の設定問題の早期発見
 */
function validateConfig(config: EnvironmentConfig): void {
  const errors: string[] = [];

  // 【本番環境設定検証】: 本番環境での必須設定値チェック
  if (config.NODE_ENV === 'production') {
    if (!config.DB_HOST) errors.push('DB_HOST is required in production');
    if (!config.DB_NAME) errors.push('DB_NAME is required in production');
    if (!config.DB_USER) errors.push('DB_USER is required in production');
    if (!config.DB_PASSWORD) errors.push('DB_PASSWORD is required in production');
  }

  // 【数値範囲検証】: 数値設定値の妥当性チェック
  if (config.PORT < 1 || config.PORT > 65535) {
    errors.push('PORT must be between 1 and 65535');
  }
  if (config.MAX_CONNECTIONS < 1 || config.MAX_CONNECTIONS > 1000) {
    errors.push('MAX_CONNECTIONS must be between 1 and 1000');
  }
  if (config.DB_POOL_SIZE < 1 || config.DB_POOL_SIZE > 100) {
    errors.push('DB_POOL_SIZE must be between 1 and 100');
  }

  // 【CORS設定検証】: CORS オリジンの妥当性チェック
  if (config.CORS_ORIGINS.length === 0) {
    errors.push('At least one CORS origin must be specified');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

// 【設定オブジェクト生成】: アプリケーション設定の初期化と検証
const rawConfig = parseEnvironmentConfig();
validateConfig(rawConfig);

/**
 * 【設定エクスポート】: 検証済み設定値の提供
 * 【イミュータブル】: 設定値の意図しない変更を防ぐための読み取り専用エクスポート
 */
export const config: Readonly<EnvironmentConfig> = Object.freeze(rawConfig);

/**
 * 【設定表示】: デバッグ用設定値表示関数（機密情報除外）
 * 【セキュリティ配慮】: パスワード等の機密情報は出力から除外
 */
export function displayConfig(): void {
  const safeConfig = {
    ...config,
    DB_PASSWORD: config.DB_PASSWORD ? '***' : '',
  };
  console.log('Application Configuration:', JSON.stringify(safeConfig, null, 2));
}
