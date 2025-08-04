// ========================================
// Entity Definitions (Database Models)
// ========================================

/**
 * 負荷リクエストのエンティティ
 */
export interface LoadRequest {
  id: string;
  sessionId: string;
  intensity: number;
  duration: number;
  createdAt: Date;
}

/**
 * Podメトリクスのエンティティ
 */
export interface PodMetric {
  id: string;
  sessionId: string;
  timestamp: Date;
  podCount: number;
  totalCpuUsage: number;
  totalMemoryUsage: number;
  averageCpuUsage: number;
  averageMemoryUsage: number;
}

/**
 * セッション情報のエンティティ
 */
export interface Session {
  id: string;
  startTime: Date;
  endTime: Date | null;
  createdAt: Date;
}

// ========================================
// API Request/Response Types
// ========================================

/**
 * 負荷生成リクエスト
 */
export interface CreateLoadRequest {
  intensity: number; // 1-100
  duration?: number; // seconds (optional, default: 30)
}

/**
 * 負荷生成レスポンス
 */
export interface CreateLoadResponse {
  requestId: string;
  message: string;
  intensity: number;
  estimatedDuration: number;
}

/**
 * メトリクス取得レスポンス
 */
export interface MetricsResponse {
  currentPodCount: number;
  cpuUsage: {
    total: number;
    average: number;
    unit: 'millicores';
  };
  memoryUsage: {
    total: number;
    average: number;
    unit: 'MB';
  };
  scalingStatus: ScalingStatus;
  timestamp: string; // ISO 8601
}

/**
 * スケーリング状態
 */
export enum ScalingStatus {
  STABLE = 'STABLE',
  SCALING_UP = 'SCALING_UP',
  SCALING_DOWN = 'SCALING_DOWN',
  PENDING = 'PENDING'
}

// ========================================
// Kubernetes Related Types
// ========================================

/**
 * Pod情報
 */
export interface PodInfo {
  name: string;
  namespace: string;
  status: PodStatus;
  cpuUsage: number; // millicores
  memoryUsage: number; // bytes
  createdAt: Date;
}

/**
 * Pod状態
 */
export enum PodStatus {
  PENDING = 'Pending',
  RUNNING = 'Running',
  SUCCEEDED = 'Succeeded',
  FAILED = 'Failed',
  UNKNOWN = 'Unknown'
}

/**
 * HPA情報
 */
export interface HPAInfo {
  name: string;
  namespace: string;
  currentReplicas: number;
  desiredReplicas: number;
  minReplicas: number;
  maxReplicas: number;
  currentCPUPercentage: number | null;
  targetCPUPercentage: number;
}

// ========================================
// Common Types
// ========================================

/**
 * API共通レスポンス形式
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

/**
 * ヘルスチェックレスポンス
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

// ========================================
// Frontend State Types
// ========================================

/**
 * アプリケーション状態
 */
export interface AppState {
  isLoading: boolean;
  isGeneratingLoad: boolean;
  metrics: MetricsResponse | null;
  error: string | null;
  lastUpdate: Date | null;
}

/**
 * 負荷生成設定
 */
export interface LoadGenerationConfig {
  intensity: number;
  duration: number;
}

// ========================================
// Configuration Types
// ========================================

/**
 * アプリケーション設定
 */
export interface AppConfig {
  api: {
    baseUrl: string;
    timeout: number;
  };
  polling: {
    interval: number; // milliseconds
    enabled: boolean;
  };
  ui: {
    theme: 'light' | 'dark';
    animations: boolean;
  };
}

/**
 * バックエンド設定
 */
export interface BackendConfig {
  port: number;
  cors: {
    origins: string[];
    credentials: boolean;
  };
  database: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    maxConnections: number;
  };
  kubernetes: {
    namespace: string;
    labelSelector: string;
    workloadIdentity: {
      serviceAccount: string;
      googleServiceAccount: string;
    };
  };
  cache: {
    ttl: number; // seconds
  };
}

// ========================================
// Validation Schemas (for runtime validation)
// ========================================

/**
 * 負荷生成リクエストのバリデーションスキーマ
 */
export const CreateLoadRequestSchema = {
  type: 'object',
  properties: {
    intensity: {
      type: 'number',
      minimum: 1,
      maximum: 100
    },
    duration: {
      type: 'number',
      minimum: 1,
      maximum: 300
    }
  },
  required: ['intensity']
};

// ========================================
// Type Guards
// ========================================

/**
 * ApiErrorの型ガード
 */
export function isApiError(error: any): error is ApiError {
  return (
    error &&
    typeof error.code === 'string' &&
    typeof error.message === 'string'
  );
}

/**
 * MetricsResponseの型ガード
 */
export function isMetricsResponse(data: any): data is MetricsResponse {
  return (
    data &&
    typeof data.currentPodCount === 'number' &&
    data.cpuUsage &&
    data.memoryUsage &&
    Object.values(ScalingStatus).includes(data.scalingStatus)
  );
}