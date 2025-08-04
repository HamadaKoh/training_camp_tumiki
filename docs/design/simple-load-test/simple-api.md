# シンプル負荷テストAPI仕様

## Base URL
```
http://localhost:3000/api
```

## 共通レスポンス形式

### 成功レスポンス
```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### エラーレスポンス
```json
{
  "success": false,
  "error": "Error message",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

## API エンドポイント

### 1. 負荷生成

**POST** `/api/load`

負荷を生成します。

#### リクエスト
```json
{
  "intensity": 50
}
```

- `intensity` (number, 1-100): 負荷の強度

#### レスポンス
```json
{
  "success": true,
  "data": {
    "message": "Load generated successfully",
    "intensity": 50,
    "duration": 1000
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### エラーレスポンス
```json
{
  "success": false,
  "error": "Invalid intensity value",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### 2. メトリクス取得

**GET** `/api/metrics`

現在のPod数とCPU使用率を取得します。

#### レスポンス
```json
{
  "success": true,
  "data": {
    "podCount": 3,
    "cpuUsage": 45.2,
    "memoryUsage": 32.1,
    "isScaling": true,
    "namespace": "default",
    "deploymentName": "load-target",
    "lastUpdated": "2024-01-01T12:00:00Z"
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### エラーレスポンス
```json
{
  "success": false,
  "error": "Failed to fetch metrics from Kubernetes API",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### 3. ヘルスチェック

**GET** `/api/health`

サービスの健全性をチェックします。

#### レスポンス
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "version": "1.0.0",
    "uptime": 3600,
    "database": "connected",
    "kubernetes": "connected"
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

## HTTPステータスコード

| Status Code | Description |
|-------------|-------------|
| 200 | 成功 |
| 400 | 不正なリクエスト |
| 500 | サーバーエラー |
| 503 | サービス利用不可 |

## エラーハンドリング

### バリデーションエラー
```json
{
  "success": false,
  "error": "Validation error: intensity must be between 1 and 100",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Kubernetes APIエラー
```json
{
  "success": false,
  "error": "Kubernetes API connection failed",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### データベースエラー
```json
{
  "success": false,
  "error": "Database connection failed",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

## レート制限

- 各エンドポイント: 100 requests/minute per IP
- `/api/load`: 10 requests/minute per IP（負荷制限）

制限超過時のレスポンス:
```json
{
  "success": false,
  "error": "Rate limit exceeded. Please try again later.",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

## CORS設定

```
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```