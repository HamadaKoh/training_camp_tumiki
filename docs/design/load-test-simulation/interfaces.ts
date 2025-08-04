// =====================================
// Core Domain Entities
// =====================================

export interface User {
  id: string;
  sessionId: string;
  nickname?: string;
  ipAddress: string;
  userAgent: string;
  connectedAt: Date;
  lastActiveAt: Date;
}

export interface GameSession {
  id: string;
  userId: string;
  state: GameState;
  difficulty: DifficultyLevel;
  startedAt: Date;
  endedAt?: Date;
  score: number;
  maxPodsReached: number;
  totalClicks: number;
  bombDefused: boolean;
  peakLoadGenerated: number;
}

export interface PodMetrics {
  timestamp: Date;
  namespace: string;
  deploymentName: string;
  totalPods: number;
  runningPods: number;
  pendingPods: number;
  failedPods: number;
  scalingPods: number;
  cpuUtilization: number;
  memoryUtilization: number;
  requestsPerSecond: number;
}

export interface LoadMetrics {
  timestamp: Date;
  activeUsers: number;
  totalRequests: number;
  requestsPerSecond: number;
  averageResponseTime: number;
  errorRate: number;
  queueLength: number;
}

export interface BombState {
  isActive: boolean;
  countdown: number;
  totalTime: number;
  triggeredAt?: Date;
  defusedAt?: Date;
  explodedAt?: Date;
  threshold: number;
}

// =====================================
// Enums and Constants
// =====================================

export enum GameState {
  IDLE = 'idle',
  LOADING = 'loading',
  READY = 'ready',
  PLAYING = 'playing',
  COUNTDOWN = 'countdown',
  SUCCESS = 'success',
  GAME_OVER = 'game_over',
  COOLDOWN = 'cooldown'
}

export enum DifficultyLevel {
  EASY = 'easy',
  NORMAL = 'normal',
  HARD = 'hard',
  EXTREME = 'extreme'
}

export enum WebSocketEvent {
  // Connection events
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  RECONNECT = 'reconnect',
  
  // Game events
  GAME_START = 'game:start',
  GAME_END = 'game:end',
  GAME_STATE_UPDATE = 'game:state:update',
  
  // Load events
  LOAD_GENERATE = 'load:generate',
  LOAD_METRICS_UPDATE = 'load:metrics:update',
  
  // Pod events
  POD_COUNT_UPDATE = 'pod:count:update',
  POD_METRICS_UPDATE = 'pod:metrics:update',
  POD_SCALING_START = 'pod:scaling:start',
  POD_SCALING_COMPLETE = 'pod:scaling:complete',
  
  // Bomb events
  BOMB_ARMED = 'bomb:armed',
  BOMB_COUNTDOWN = 'bomb:countdown',
  BOMB_DEFUSED = 'bomb:defused',
  BOMB_EXPLODED = 'bomb:exploded',
  
  // Error events
  ERROR = 'error',
  RATE_LIMITED = 'rate:limited'
}

// =====================================
// Configuration Interfaces
// =====================================

export interface GameConfig {
  difficulty: DifficultySettings;
  scoring: ScoringSettings;
  visual: VisualSettings;
  audio: AudioSettings;
}

export interface DifficultySettings {
  level: DifficultyLevel;
  bombTimer: number; // seconds
  loadThreshold: number; // requests per second
  targetPodCount: number;
  scalingDelay: number; // seconds
  clickCooldown: number; // milliseconds
  maxConcurrentClicks: number;
}

export interface ScoringSettings {
  clickPoints: number;
  timeBonus: number;
  podBonus: number;
  defuseBonus: number;
  perfectBonus: number;
}

export interface VisualSettings {
  enableAnimations: boolean;
  enableParticles: boolean;
  theme: 'light' | 'dark' | 'auto';
  reducedMotion: boolean;
}

export interface AudioSettings {
  enabled: boolean;
  volume: number; // 0-1
  enableMusic: boolean;
  enableSoundEffects: boolean;
}

// =====================================
// API Request/Response Interfaces
// =====================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  timestamp: Date;
  requestId: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
  stack?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

// Load Generation
export interface GenerateLoadRequest {
  intensity: number; // 1-100
  duration?: number; // milliseconds
  pattern?: LoadPattern;
}

export interface GenerateLoadResponse {
  requestId: string;
  accepted: boolean;
  queuePosition?: number;
  estimatedProcessingTime?: number;
}

export enum LoadPattern {
  CONSTANT = 'constant',
  SPIKE = 'spike',
  GRADUAL = 'gradual',
  RANDOM = 'random',
  WAVE = 'wave'
}

// Game Management
export interface StartGameRequest {
  userId?: string;
  difficulty: DifficultyLevel;
  nickname?: string;
}

export interface StartGameResponse {
  sessionId: string;
  gameConfig: GameConfig;
  initialState: GameStateSnapshot;
}

export interface EndGameRequest {
  sessionId: string;
  reason: EndGameReason;
}

export interface EndGameResponse {
  finalScore: number;
  stats: GameStatistics;
  leaderboardPosition?: number;
  achievements?: Achievement[];
}

export enum EndGameReason {
  COMPLETED = 'completed',
  FAILED = 'failed',
  ABANDONED = 'abandoned',
  TIMEOUT = 'timeout',
  ERROR = 'error'
}

// Metrics
export interface GetMetricsRequest {
  namespace?: string;
  deploymentName?: string;
  startTime?: Date;
  endTime?: Date;
  interval?: MetricsInterval;
}

export interface GetMetricsResponse {
  metrics: PodMetrics[];
  aggregated?: AggregatedMetrics;
}

export enum MetricsInterval {
  REAL_TIME = 'realtime',
  SECOND = '1s',
  MINUTE = '1m',
  FIVE_MINUTES = '5m',
  HOUR = '1h'
}

export interface AggregatedMetrics {
  avgPodCount: number;
  maxPodCount: number;
  minPodCount: number;
  avgCpuUtilization: number;
  avgMemoryUtilization: number;
  totalRequests: number;
  avgResponseTime: number;
  errorRate: number;
}

// Leaderboard
export interface GetLeaderboardRequest {
  timeRange?: TimeRange;
  difficulty?: DifficultyLevel;
  limit?: number;
  offset?: number;
}

export interface GetLeaderboardResponse {
  entries: LeaderboardEntry[];
  totalEntries: number;
  userRank?: number;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  nickname: string;
  score: number;
  difficulty: DifficultyLevel;
  completedAt: Date;
  stats: {
    totalClicks: number;
    maxPods: number;
    timeTaken: number;
    bombDefused: boolean;
  };
}

export enum TimeRange {
  ALL_TIME = 'all_time',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly'
}

// =====================================
// WebSocket Message Interfaces
// =====================================

export interface WebSocketMessage<T = any> {
  event: WebSocketEvent;
  payload: T;
  timestamp: Date;
  correlationId?: string;
}

export interface PodUpdatePayload {
  metrics: PodMetrics;
  isScaling: boolean;
  scalingDirection?: 'up' | 'down';
  targetPodCount?: number;
}

export interface GameStateUpdatePayload {
  state: GameState;
  bombState?: BombState;
  score: number;
  metrics: {
    podCount: number;
    loadLevel: number;
    clickCount: number;
  };
}

export interface LoadMetricsUpdatePayload {
  currentLoad: number;
  peakLoad: number;
  requestsPerSecond: number;
  queueLength: number;
  activeUsers: number;
}

export interface BombCountdownPayload {
  timeRemaining: number;
  totalTime: number;
  dangerLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface ErrorPayload {
  code: string;
  message: string;
  recoverable: boolean;
  action?: string;
}

// =====================================
// State Management Interfaces
// =====================================

export interface AppState {
  user: UserState;
  game: GameSessionState;
  metrics: MetricsState;
  ui: UIState;
  connection: ConnectionState;
}

export interface UserState {
  id?: string;
  sessionId?: string;
  nickname?: string;
  isAuthenticated: boolean;
}

export interface GameSessionState {
  sessionId?: string;
  state: GameState;
  difficulty: DifficultyLevel;
  score: number;
  bombState: BombState;
  stats: GameStatistics;
}

export interface GameStatistics {
  totalClicks: number;
  successfulClicks: number;
  failedClicks: number;
  maxPodsReached: number;
  totalLoadGenerated: number;
  timePlayed: number;
  defuseAttempts: number;
  successfulDefuses: number;
}

export interface MetricsState {
  podMetrics: PodMetrics | null;
  loadMetrics: LoadMetrics | null;
  historicalData: PodMetrics[];
  isLoading: boolean;
  error?: string;
}

export interface UIState {
  isLoading: boolean;
  modals: {
    gameOver: boolean;
    settings: boolean;
    leaderboard: boolean;
    help: boolean;
  };
  notifications: Notification[];
  theme: 'light' | 'dark' | 'auto';
}

export interface ConnectionState {
  isConnected: boolean;
  isReconnecting: boolean;
  latency: number;
  lastHeartbeat?: Date;
  connectionQuality: 'excellent' | 'good' | 'fair' | 'poor';
}

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  duration?: number;
  action?: {
    label: string;
    handler: () => void;
  };
}

// =====================================
// Utility Types
// =====================================

export type GameStateSnapshot = Pick<GameSessionState, 
  'state' | 'difficulty' | 'score' | 'bombState' | 'stats'
>;

export type PartialUpdate<T> = {
  [P in keyof T]?: T[P] extends object ? PartialUpdate<T[P]> : T[P];
};

export type EventHandler<T = any> = (payload: T) => void | Promise<void>;

export type UnsubscribeFn = () => void;

// =====================================
// Achievement System
// =====================================

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  unlockedAt?: Date;
  progress?: number;
  maxProgress?: number;
}

export enum AchievementCategory {
  SPEED = 'speed',
  ENDURANCE = 'endurance',
  SKILL = 'skill',
  EXPLORATION = 'exploration',
  SPECIAL = 'special'
}