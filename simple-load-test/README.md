# Simple Load Test Application

シンプルな負荷テストアプリケーション - GKE上のPod自動スケーリングを検証するためのツール

## 前提条件

- Docker / Docker Compose がインストールされていること
- Node.js 18以上
- GKEクラスターへのアクセス権限（TASK-003で設定）

## 開発環境セットアップ

1. 環境変数ファイルをコピー:
```bash
cp .env.development .env
```

2. 依存関係のインストール:
```bash
# Backend
cd backend && npm install

# Frontend  
cd ../frontend && npm install
```

3. Docker Composeで起動:
```bash
docker-compose up
```

これにより以下が起動します:
- PostgreSQL データベース (ポート 5432)
- Backend API サーバー (ポート 3000)
- Frontend 開発サーバー (ポート 5173)

## アクセスURL

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- Health Check: http://localhost:3000/api/health

## データベース接続

- Host: localhost
- Port: 5432
- Database: loadtest_db
- User: loadtest
- Password: password

## 注意事項

- Docker/Docker Composeが起動していることを確認してください
- 初回起動時はデータベーススキーマが自動的に作成されます