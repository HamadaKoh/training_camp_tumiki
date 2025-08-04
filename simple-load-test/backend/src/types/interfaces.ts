// ========================================
// API Response Types (HealthCheck用)
// 要件定義書とinterfaces.tsに基づく型定義
// ========================================

/**
 * ヘルスチェックレスポンス
 * interfaces.tsのHealthCheckResponse型定義に基づく
 */
export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  version: string;
  uptime: number; // seconds
  checks: {
    database: boolean;
    kubernetes: boolean;
  };
}

/**
 * API共通レスポンス形式
 * api-endpoints.mdの仕様に基づく
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  timestamp: string; // ISO 8601
}

/**
 * APIエラー情報
 */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
}