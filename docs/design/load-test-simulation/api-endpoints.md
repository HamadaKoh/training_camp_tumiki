# API エンドポイント仕様

## Base URL
```
https://api.load-test-sim.example.com
```

## 認証
- オプション機能（スコアボード、実績など）のみ認証が必要
- Bearer Token (JWT) を使用
- トークンは24時間有効

## 共通レスポンス形式

### 成功レスポンス
```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2024-01-01T12:00:00Z",
  "requestId": "req_abc123"
}
```

### エラーレスポンス
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": { ... }
  },
  "timestamp": "2024-01-01T12:00:00Z",
  "requestId": "req_abc123"
}
```

## エラーコード

| Code | HTTP Status | Description |
|------|-------------|-------------|
| RATE_LIMITED | 429 | レート制限超過 |
| INVALID_REQUEST | 400 | 不正なリクエスト |
| UNAUTHORIZED | 401 | 認証が必要 |
| FORBIDDEN | 403 | アクセス権限なし |
| NOT_FOUND | 404 | リソースが見つからない |
| CONFLICT | 409 | 競合状態 |
| SERVER_ERROR | 500 | サーバーエラー |
| SERVICE_UNAVAILABLE | 503 | サービス利用不可 |

---

## 1. ゲーム管理 API

### 1.1 ゲーム開始
**POST** `/api/game/start`

ゲームセッションを開始します。

#### リクエスト
```json
{
  "userId": "user_123",
  "difficulty": "normal",
  "nickname": "Player1"
}
```

#### レスポンス
```json
{
  "success": true,
  "data": {
    "sessionId": "session_abc123",
    "gameConfig": {
      "difficulty": {
        "level": "normal",
        "bombTimer": 45,
        "loadThreshold": 20,
        "targetPodCount": 10,
        "scalingDelay": 5,
        "clickCooldown": 100,
        "maxConcurrentClicks": 10
      },
      "scoring": {
        "clickPoints": 10,
        "timeBonus": 100,
        "podBonus": 50,
        "defuseBonus": 500,
        "perfectBonus": 1000
      }
    },
    "initialState": {
      "state": "ready",
      "difficulty": "normal",
      "score": 0,
      "bombState": {
        "isActive": false,
        "countdown": 0,
        "totalTime": 45,
        "threshold": 20
      },
      "stats": {
        "totalClicks": 0,
        "successfulClicks": 0,
        "failedClicks": 0,
        "maxPodsReached": 1,
        "totalLoadGenerated": 0,
        "timePlayed": 0
      }
    }
  }
}
```

### 1.2 ゲーム終了
**POST** `/api/game/end`

ゲームセッションを終了します。

#### リクエスト
```json
{
  "sessionId": "session_abc123",
  "reason": "completed"
}
```

#### レスポンス
```json
{
  "success": true,
  "data": {
    "finalScore": 5420,
    "stats": {
      "totalClicks": 150,
      "successfulClicks": 145,
      "failedClicks": 5,
      "maxPodsReached": 12,
      "totalLoadGenerated": 450.5,
      "timePlayed": 180,
      "defuseAttempts": 2,
      "successfulDefuses": 1
    },
    "leaderboardPosition": 42,
    "achievements": [
      {
        "id": "ach_001",
        "name": "Speed Demon",
        "description": "Click 100 times in 10 seconds",
        "icon": "/assets/achievements/speed_demon.png",
        "unlockedAt": "2024-01-01T12:03:00Z"
      }
    ]
  }
}
```

### 1.3 ゲーム状態取得
**GET** `/api/game/{sessionId}/state`

現在のゲーム状態を取得します。

#### レスポンス
```json
{
  "success": true,
  "data": {
    "sessionId": "session_abc123",
    "state": "playing",
    "score": 2150,
    "bombState": {
      "isActive": true,
      "countdown": 32,
      "totalTime": 45,
      "triggeredAt": "2024-01-01T12:02:15Z"
    },
    "metrics": {
      "podCount": 5,
      "loadLevel": 25.5,
      "clickCount": 45
    }
  }
}
```

---

## 2. 負荷生成 API

### 2.1 負荷生成
**POST** `/api/load/generate`

サーバーに負荷を生成します。

#### リクエスト
```json
{
  "intensity": 50,
  "duration": 1000,
  "pattern": "spike"
}
```

#### レスポンス
```json
{
  "success": true,
  "data": {
    "requestId": "req_xyz789",
    "accepted": true,
    "queuePosition": 3,
    "estimatedProcessingTime": 150
  }
}
```

#### レート制限
- 100 requests per minute per IP
- 10 concurrent requests per session

### 2.2 負荷状態取得
**GET** `/api/load/status`

現在の負荷状態を取得します。

#### レスポンス
```json
{
  "success": true,
  "data": {
    "currentLoad": 35.7,
    "peakLoad": 78.2,
    "requestsPerSecond": 125,
    "queueLength": 8,
    "activeUsers": 15,
    "avgResponseTime": 45.2,
    "errorRate": 0.2
  }
}
```

---

## 3. メトリクス API

### 3.1 Pod メトリクス取得
**GET** `/api/metrics/pods`

Pod のメトリクスを取得します。

#### クエリパラメータ
- `namespace` (string, optional): Kubernetes namespace
- `deployment` (string, optional): Deployment name
- `interval` (string, optional): realtime, 1s, 1m, 5m, 1h

#### レスポンス
```json
{
  "success": true,
  "data": {
    "metrics": [
      {
        "timestamp": "2024-01-01T12:00:00Z",
        "namespace": "default",
        "deploymentName": "load-generator",
        "totalPods": 8,
        "runningPods": 7,
        "pendingPods": 1,
        "failedPods": 0,
        "scalingPods": 1,
        "cpuUtilization": 72.5,
        "memoryUtilization": 45.3,
        "requestsPerSecond": 120.5
      }
    ],
    "aggregated": {
      "avgPodCount": 6.5,
      "maxPodCount": 12,
      "minPodCount": 1,
      "avgCpuUtilization": 65.2,
      "avgMemoryUtilization": 42.1,
      "totalRequests": 15420,
      "avgResponseTime": 32.5,
      "errorRate": 0.15
    }
  }
}
```

### 3.2 履歴メトリクス取得
**GET** `/api/metrics/history`

履歴メトリクスを取得します。

#### クエリパラメータ
- `startTime` (ISO 8601): 開始時刻
- `endTime` (ISO 8601): 終了時刻
- `interval` (string): 集計間隔

#### レスポンス
```json
{
  "success": true,
  "data": {
    "timeRange": {
      "start": "2024-01-01T11:00:00Z",
      "end": "2024-01-01T12:00:00Z"
    },
    "dataPoints": [
      {
        "timestamp": "2024-01-01T11:00:00Z",
        "podCount": 3,
        "cpuUtilization": 45.2,
        "memoryUtilization": 32.1,
        "requestsPerSecond": 50.5
      }
    ]
  }
}
```

---

## 4. リーダーボード API

### 4.1 リーダーボード取得
**GET** `/api/leaderboard`

#### クエリパラメータ
- `timeRange` (string): all_time, daily, weekly, monthly
- `difficulty` (string): easy, normal, hard, extreme
- `limit` (number): 最大取得数 (default: 10, max: 100)
- `offset` (number): オフセット (default: 0)

#### レスポンス
```json
{
  "success": true,
  "data": {
    "entries": [
      {
        "rank": 1,
        "userId": "user_456",
        "nickname": "ProGamer",
        "score": 12500,
        "difficulty": "hard",
        "completedAt": "2024-01-01T10:30:00Z",
        "stats": {
          "totalClicks": 250,
          "maxPods": 18,
          "timeTaken": 240,
          "bombDefused": true
        }
      }
    ],
    "totalEntries": 1250,
    "userRank": 42
  }
}
```

### 4.2 ユーザーランク取得
**GET** `/api/leaderboard/user/{userId}`

特定ユーザーのランク情報を取得します。

#### レスポンス
```json
{
  "success": true,
  "data": {
    "userId": "user_123",
    "rankings": {
      "all_time": {
        "rank": 42,
        "score": 8500,
        "percentile": 15.5
      },
      "daily": {
        "rank": 5,
        "score": 8500,
        "percentile": 2.1
      },
      "weekly": {
        "rank": 12,
        "score": 8500,
        "percentile": 5.3
      }
    }
  }
}
```

---

## 5. 実績 API

### 5.1 実績一覧取得
**GET** `/api/achievements`

#### レスポンス
```json
{
  "success": true,
  "data": {
    "achievements": [
      {
        "id": "ach_001",
        "name": "First Click",
        "description": "Generate your first load",
        "category": "exploration",
        "icon": "/assets/achievements/first_click.png",
        "points": 5,
        "maxProgress": 1
      }
    ],
    "total": 25
  }
}
```

### 5.2 ユーザー実績取得
**GET** `/api/achievements/user/{userId}`

#### レスポンス
```json
{
  "success": true,
  "data": {
    "unlocked": [
      {
        "achievementId": "ach_001",
        "name": "First Click",
        "unlockedAt": "2024-01-01T12:00:00Z",
        "progress": 1,
        "maxProgress": 1
      }
    ],
    "inProgress": [
      {
        "achievementId": "ach_002",
        "name": "Speed Demon",
        "progress": 75,
        "maxProgress": 100
      }
    ],
    "totalPoints": 125,
    "totalUnlocked": 8,
    "totalAchievements": 25
  }
}
```

---

## 6. システム API

### 6.1 ヘルスチェック
**GET** `/api/health`

#### レスポンス
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "version": "1.0.0",
    "uptime": 86400,
    "services": {
      "database": "healthy",
      "redis": "healthy",
      "kubernetes": "healthy",
      "websocket": "healthy"
    }
  }
}
```

### 6.2 システム設定取得
**GET** `/api/config`

公開可能なシステム設定を取得します。

#### レスポンス
```json
{
  "success": true,
  "data": {
    "difficulties": {
      "easy": {
        "bombTimer": 60,
        "loadThreshold": 10
      },
      "normal": {
        "bombTimer": 45,
        "loadThreshold": 20
      },
      "hard": {
        "bombTimer": 30,
        "loadThreshold": 30
      }
    },
    "features": {
      "multiplayer": false,
      "achievements": true,
      "leaderboard": true,
      "soundEffects": true
    },
    "maintenance": {
      "enabled": false,
      "message": ""
    }
  }
}
```

### 6.3 メンテナンスモード
**GET** `/api/maintenance`

#### レスポンス (メンテナンス中)
```json
{
  "success": false,
  "error": {
    "code": "MAINTENANCE_MODE",
    "message": "System is under maintenance. Please try again later.",
    "details": {
      "estimatedEndTime": "2024-01-01T14:00:00Z",
      "reason": "System upgrade"
    }
  }
}
```

---

## WebSocket イベント

WebSocket接続は `/ws` エンドポイントで確立します。

### クライアント → サーバー

#### 接続
```javascript
socket.emit('connect', {
  sessionId: 'session_abc123',
  userId: 'user_123'
});
```

#### ゲーム参加
```javascript
socket.emit('game:join', {
  gameId: 'game_xyz789'
});
```

#### 負荷生成
```javascript
socket.emit('load:generate', {
  intensity: 50
});
```

### サーバー → クライアント

#### Pod数更新
```javascript
socket.on('pod:count:update', {
  metrics: {
    timestamp: '2024-01-01T12:00:00Z',
    totalPods: 8,
    runningPods: 7,
    pendingPods: 1,
    cpuUtilization: 72.5,
    memoryUtilization: 45.3
  },
  isScaling: true,
  scalingDirection: 'up',
  targetPodCount: 10
});
```

#### ゲーム状態更新
```javascript
socket.on('game:state:update', {
  state: 'countdown',
  bombState: {
    isActive: true,
    countdown: 30,
    totalTime: 45
  },
  score: 2150,
  metrics: {
    podCount: 5,
    loadLevel: 35.5,
    clickCount: 45
  }
});
```

#### 爆弾カウントダウン
```javascript
socket.on('bomb:countdown', {
  timeRemaining: 15,
  totalTime: 45,
  dangerLevel: 'high'
});
```

#### エラー通知
```javascript
socket.on('error', {
  code: 'RATE_LIMITED',
  message: 'Too many requests. Please slow down.',
  recoverable: true,
  action: 'retry'
});
```

---

## レート制限

### デフォルト制限

| エンドポイント | 制限 | ウィンドウ |
|--------------|------|-----------|
| /api/load/generate | 100 | 1分 |
| /api/game/start | 10 | 1分 |
| /api/metrics/* | 300 | 1分 |
| /api/leaderboard | 60 | 1分 |
| WebSocket events | 1000 | 1分 |

### レート制限ヘッダー

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1704110400
```

---

## CORS設定

```
Access-Control-Allow-Origin: https://app.load-test-sim.example.com
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Allow-Credentials: true
Access-Control-Max-Age: 86400
```