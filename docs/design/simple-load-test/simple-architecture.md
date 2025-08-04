# シンプル負荷テストシミュレーション アーキテクチャ設計

## システム概要

検証目的で作成する最小限の構成のKubernetes負荷テストデモアプリケーション。単一のバックエンドサービスとシンプルなフロントエンドで構成。

## アーキテクチャパターン

- **パターン**: モノリシックアーキテクチャ（単一サービス）
- **理由**: 
  - 検証目的のため複雑性を排除
  - 開発・デプロイの簡素化
  - 運用の単純化

## コンポーネント構成

### フロントエンド

- **フレームワーク**: React 18 + TypeScript
- **状態管理**: React Hooks（useState, useEffect）
- **HTTP通信**: Fetch API
- **UIライブラリ**: CSS Modules（シンプル）
- **ビルドツール**: Vite

### バックエンド（選択肢）

#### オプション1: Node.js + TypeScript
- **フレームワーク**: Express.js
- **TypeScript**: ts-node
- **Kubernetes Client**: @kubernetes/client-node
- **データベース**: pg (PostgreSQL)

#### オプション2: Python + FastAPI
- **フレームワーク**: FastAPI
- **Kubernetes Client**: kubernetes (公式クライアント)
- **データベース**: asyncpg (PostgreSQL)
- **ASGI**: uvicorn

### データストレージ

- **データベース**: PostgreSQL
- **テーブル**: 3テーブルのみ（正規化）
  - `load_requests` - 負荷リクエスト履歴
  - `pod_metrics` - Pod数メトリクス
  - `sessions` - セッション管理（オプション）

## システム構成図

```
┌─────────────────┐    HTTP     ┌─────────────────┐
│                 │   Request   │                 │
│   React SPA     │◄───────────►│  Backend API    │
│                 │             │  (TS/Python)    │
└─────────────────┘             └─────────────────┘
                                          │
                                          │ SQL
                                          ▼
                                ┌─────────────────┐
                                │   PostgreSQL    │
                                │    (3 tables)   │
                                └─────────────────┘
                                          │
                                          │ K8s API
                                          ▼
                                ┌─────────────────┐
                                │  Kubernetes     │
                                │   API Server    │
                                └─────────────────┘
                                          │
                                          │ watches/controls
                                          ▼
                                ┌─────────────────┐
                                │  Target Pods    │
                                │     (HPA)       │
                                └─────────────────┘
```

## データフロー

1. ユーザーがボタンクリック
2. フロントエンドがPOST /api/loadを送信
3. バックエンドが負荷を生成
4. HPAがCPU使用率を監視
5. Podがスケーリング
6. フロントエンドが定期的にGET /api/metricsでPod数を取得
7. Pod数を画面に表示

## API設計

### エンドポイント（最小限）

```
POST /api/load
- リクエスト: { intensity: number }
- レスポンス: { success: boolean, message: string }

GET /api/metrics
- レスポンス: { 
    podCount: number,
    cpuUsage: number,
    isScaling: boolean,
    timestamp: string
  }

GET /api/health
- レスポンス: { status: "ok" }
```

## データベース設計（正規化、JSON型禁止）

```sql
-- 負荷リクエスト履歴
CREATE TABLE load_requests (
    id SERIAL PRIMARY KEY,
    intensity INTEGER NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    session_id VARCHAR(255),
    client_ip INET
);

CREATE INDEX idx_load_requests_timestamp ON load_requests(timestamp DESC);

-- Pod メトリクス
CREATE TABLE pod_metrics (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    pod_count INTEGER NOT NULL,
    cpu_usage DECIMAL(5,2),
    memory_usage DECIMAL(5,2),
    namespace VARCHAR(255) DEFAULT 'default',
    deployment_name VARCHAR(255) NOT NULL
);

CREATE INDEX idx_pod_metrics_timestamp ON pod_metrics(timestamp DESC);
CREATE INDEX idx_pod_metrics_deployment ON pod_metrics(deployment_name, timestamp DESC);

-- セッション管理（オプション）
CREATE TABLE sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_active TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    client_ip INET
);

CREATE INDEX idx_sessions_session_id ON sessions(session_id);
```

## Kubernetes設定

### デプロイメント構成

```yaml
# アプリケーション
apiVersion: apps/v1
kind: Deployment
metadata:
  name: simple-load-test
spec:
  replicas: 1
  template:
    spec:
      containers:
      - name: app
        image: simple-load-test:latest
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 500m
            memory: 512Mi

# 負荷生成対象（HPAターゲット）
apiVersion: apps/v1
kind: Deployment
metadata:
  name: load-target
spec:
  replicas: 1
  template:
    spec:
      containers:
      - name: load-target
        image: nginx:alpine
        resources:
          requests:
            cpu: 50m
            memory: 64Mi

# HPA設定
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: load-target-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: load-target
  minReplicas: 1
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 50
```

## セキュリティ設計

### 最小限のセキュリティ

- CORS設定（特定オリジンのみ許可）
- Kubernetes API権限制限（Pod read-only）
- 基本的な入力検証
- レート制限（シンプル）

### ServiceAccount/RBAC

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: load-test-sa

---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: pod-reader
rules:
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["get", "list"]

---  
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: load-test-binding
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: pod-reader
subjects:
- kind: ServiceAccount
  name: load-test-sa
  namespace: default
```

## 技術スタック決定

### Node.js + TypeScript構成
```
Frontend: React + TypeScript + Vite
Backend: Express + TypeScript + @kubernetes/client-node
Database: PostgreSQL + pg
Container: Node.js 18 Alpine
```

### Python + FastAPI構成
```
Frontend: React + TypeScript + Vite  
Backend: FastAPI + kubernetes + asyncpg
Database: PostgreSQL + asyncpg
Container: Python 3.11 Alpine
```

## デプロイメント戦略

- **開発環境**: Docker Compose
- **本番環境**: Kubernetes
- **CI/CD**: GitHub Actions（シンプル）
- **コンテナレジストリ**: Docker Hub

## 監視（最小限）

- アプリケーションログ（stdout）
- Kubernetes標準メトリクス
- ヘルスチェックエンドポイント

## 開発方針

### 簡素化の徹底
1. 不要な機能は実装しない
2. 複雑なライブラリは使わない
3. 設定ファイルは最小限
4. テストも基本的なもののみ

### 検証ポイント
1. HPAの動作確認
2. Pod数のリアルタイム表示
3. 負荷生成の効果確認
4. Kubernetes API連携