# API エンドポイント仕様

## 概要

シンプル負荷テストシミュレーションのREST API仕様書。すべてのAPIはJSON形式でデータをやり取りします。

## ベースURL

```
https://{your-domain}/api
```

## 共通仕様

### リクエストヘッダー

```
Content-Type: application/json
Accept: application/json
```

### レスポンスフォーマット

成功時:
```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2024-01-01T00:00:00Z"
}
```

エラー時:
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": { ... }
  },
  "timestamp": "2024-01-01T00:00:00Z"
}
```

### HTTPステータスコード

- `200 OK` - 正常終了
- `400 Bad Request` - リクエストが不正
- `404 Not Found` - リソースが見つからない
- `500 Internal Server Error` - サーバーエラー
- `503 Service Unavailable` - サービス利用不可

## エンドポイント一覧

### 1. ヘルスチェック

#### GET /health

アプリケーションの健全性を確認します。

**リクエスト:**
```
GET /api/health
```

**レスポンス:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "version": "1.0.0",
    "uptime": 3600,
    "checks": {
      "database": true,
      "kubernetes": true
    }
  },
  "timestamp": "2024-01-01T00:00:00Z"
}
```

**エラーレスポンス:**
```json
{
  "success": true,
  "data": {
    "status": "unhealthy",
    "version": "1.0.0",
    "uptime": 3600,
    "checks": {
      "database": false,
      "kubernetes": true
    }
  },
  "timestamp": "2024-01-01T00:00:00Z"
}
```

### 2. 負荷生成

#### POST /load

サーバーに負荷を生成します。

**リクエスト:**
```json
{
  "intensity": 75,
  "duration": 30
}
```

**パラメータ:**
- `intensity` (required, number): 負荷の強度 (1-100)
- `duration` (optional, number): 負荷の継続時間（秒）。デフォルト: 30秒、最大: 300秒

**レスポンス:**
```json
{
  "success": true,
  "data": {
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "message": "Load generation started",
    "intensity": 75,
    "estimatedDuration": 30
  },
  "timestamp": "2024-01-01T00:00:00Z"
}
```

**エラーレスポンス (400):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_INTENSITY",
    "message": "Intensity must be between 1 and 100",
    "details": {
      "field": "intensity",
      "value": 150
    }
  },
  "timestamp": "2024-01-01T00:00:00Z"
}
```

**エラーレスポンス (503):**
```json
{
  "success": false,
  "error": {
    "code": "SERVICE_BUSY",
    "message": "Too many concurrent load requests. Please try again later.",
    "details": {
      "currentLoad": 95,
      "maxLoad": 100
    }
  },
  "timestamp": "2024-01-01T00:00:00Z"
}
```

### 3. メトリクス取得

#### GET /metrics

現在のPod数とリソース使用状況を取得します。

**リクエスト:**
```
GET /api/metrics
```

**レスポンス:**
```json
{
  "success": true,
  "data": {
    "currentPodCount": 5,
    "cpuUsage": {
      "total": 2500,
      "average": 500,
      "unit": "millicores"
    },
    "memoryUsage": {
      "total": 2048,
      "average": 409.6,
      "unit": "MB"
    },
    "scalingStatus": "SCALING_UP",
    "timestamp": "2024-01-01T00:00:00Z"
  },
  "timestamp": "2024-01-01T00:00:00Z"
}
```

**スケーリング状態の値:**
- `STABLE` - 安定状態
- `SCALING_UP` - スケールアップ中
- `SCALING_DOWN` - スケールダウン中
- `PENDING` - 判定中

**エラーレスポンス (503):**
```json
{
  "success": false,
  "error": {
    "code": "KUBERNETES_API_ERROR",
    "message": "Failed to connect to Kubernetes API",
    "details": {
      "lastKnownPodCount": 3,
      "lastUpdate": "2024-01-01T00:00:00Z"
    }
  },
  "timestamp": "2024-01-01T00:00:00Z"
}
```

## 実装上の注意事項

### レート制限

- `/api/load` エンドポイント: 1分間に10リクエストまで
- `/api/metrics` エンドポイント: 制限なし（キャッシュあり）

### キャッシュ

- `/api/metrics` のレスポンスは1秒間キャッシュされます
- キャッシュはPod数に変化があった場合は無効化されます

### タイムアウト

- すべてのAPIリクエストは30秒でタイムアウトします
- 負荷生成処理は非同期で実行されるため、即座にレスポンスが返されます

### CORS設定

```
Access-Control-Allow-Origin: https://{frontend-domain}
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
Access-Control-Max-Age: 86400
```

### セキュリティヘッダー

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

## サンプルコード

### TypeScript (Frontend)

```typescript
// 負荷生成
async function generateLoad(intensity: number): Promise<void> {
  const response = await fetch('/api/load', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ intensity }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error.message);
  }

  const result = await response.json();
  console.log('Load request ID:', result.data.requestId);
}

// メトリクス取得
async function fetchMetrics(): Promise<MetricsResponse> {
  const response = await fetch('/api/metrics');
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error.message);
  }

  const result = await response.json();
  return result.data;
}
```

### cURL

```bash
# ヘルスチェック
curl -X GET https://your-domain/api/health

# 負荷生成
curl -X POST https://your-domain/api/load \
  -H "Content-Type: application/json" \
  -d '{"intensity": 50}'

# メトリクス取得
curl -X GET https://your-domain/api/metrics
```