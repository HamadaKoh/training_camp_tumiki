# API エンドポイント仕様

## 概要

ボイスチャットアプリケーションのAPI仕様。WebSocketベースのリアルタイム通信と、補助的なREST APIで構成される。

## WebSocket API (Socket.IO)

### 接続URL
```
wss://[domain]/socket.io/
```

### 認証
MVPでは認証なし。将来的にはJWTトークンによる認証を追加可能。

## Socket.IOイベント仕様

### クライアント → サーバー

#### join-room
通話ルームに参加する

**送信データ**: なし

**コールバックレスポンス**:
```typescript
{
  success: boolean;
  participant?: {
    id: string;
    socketId: string;
    joinedAt: Date;
    isMuted: boolean;
    isSharingScreen: boolean;
    connectionQuality: "excellent" | "good" | "fair" | "poor";
  };
  participants?: Participant[];
  error?: {
    code: string;
    message: string;
  };
}
```

**エラーケース**:
- `ROOM_FULL`: 参加者が上限（10人）に達している
- `CONNECTION_FAILED`: 接続の確立に失敗

---

#### leave-room
通話ルームから退出する

**送信データ**: なし

**レスポンス**: なし（切断処理）

---

#### toggle-mute
マイクのミュート状態を切り替える

**送信データ**:
```typescript
isMuted: boolean
```

**レスポンス**: なし（他の参加者に`user-muted`イベントが配信される）

---

#### request-screen-share
画面共有の開始をリクエストする

**送信データ**: なし

**コールバックレスポンス**:
```typescript
{
  success: boolean;
  granted: boolean;
  error?: {
    code: string;
    message: string;
  };
}
```

**エラーケース**:
- `SCREEN_SHARE_IN_USE`: 既に他の参加者が画面共有中

---

#### stop-screen-share
画面共有を停止する

**送信データ**: なし

**レスポンス**: なし（他の参加者に`screen-share-stopped`イベントが配信される）

---

#### offer
WebRTC接続のオファーを送信する

**送信データ**:
```typescript
{
  to: string;  // 宛先の参加者ID
  signal: RTCSessionDescriptionInit;
}
```

**レスポンス**: なし（宛先に`offer`イベントが配信される）

---

#### answer
WebRTC接続のアンサーを送信する

**送信データ**:
```typescript
{
  to: string;  // 宛先の参加者ID
  signal: RTCSessionDescriptionInit;
}
```

**レスポンス**: なし（宛先に`answer`イベントが配信される）

---

#### ice-candidate
ICE候補を送信する

**送信データ**:
```typescript
{
  to: string;  // 宛先の参加者ID
  candidate: RTCIceCandidateInit;
}
```

**レスポンス**: なし（宛先に`ice-candidate`イベントが配信される）

---

#### report-metrics
接続品質メトリクスを報告する

**送信データ**:
```typescript
{
  participantId: string;
  latency: number;  // ms
  packetLoss: number;  // percentage
  jitter?: number;  // ms
  bandwidth?: {
    audio?: number;  // kbps
    video?: number;  // kbps
  };
}
```

**レスポンス**: なし

### サーバー → クライアント

#### room-joined
ルーム参加成功通知

**受信データ**:
```typescript
{
  roomId: string;
  participant: Participant;
  participants: Participant[];
}
```

---

#### user-joined
新規参加者の通知

**受信データ**:
```typescript
{
  id: string;
  socketId: string;
  joinedAt: Date;
  isMuted: boolean;
  isSharingScreen: boolean;
  connectionQuality: string;
}
```

---

#### user-left
参加者の退出通知

**受信データ**:
```typescript
participantId: string
```

---

#### user-muted
参加者のミュート状態変更通知

**受信データ**:
```typescript
{
  participantId: string;
  isMuted: boolean;
}
```

---

#### screen-share-started
画面共有開始通知

**受信データ**:
```typescript
participantId: string
```

---

#### screen-share-stopped
画面共有停止通知

**受信データ**:
```typescript
participantId: string
```

---

#### offer
WebRTC接続オファーの受信

**受信データ**:
```typescript
{
  from: string;
  to: string;
  signal: RTCSessionDescriptionInit;
}
```

---

#### answer
WebRTC接続アンサーの受信

**受信データ**:
```typescript
{
  from: string;
  to: string;
  signal: RTCSessionDescriptionInit;
}
```

---

#### ice-candidate
ICE候補の受信

**受信データ**:
```typescript
{
  from: string;
  to: string;
  candidate: RTCIceCandidateInit;
}
```

---

#### connection-quality
接続品質の更新通知

**受信データ**:
```typescript
"excellent" | "good" | "fair" | "poor" | "disconnected"
```

---

#### error
エラー通知

**受信データ**:
```typescript
{
  code: string;
  message: string;
  details?: any;
}
```

## REST API エンドポイント

### ベースURL
```
https://[domain]/api/v1
```

### ヘルスチェック

#### GET /health
サービスの稼働状態を確認する

**レスポンス**:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00Z",
  "services": {
    "signaling": "operational",
    "database": "operational"
  }
}
```

**ステータスコード**:
- `200 OK`: 正常稼働
- `503 Service Unavailable`: サービス異常

---

### ルーム情報

#### GET /room/status
現在のルーム状態を取得する

**レスポンス**:
```json
{
  "roomId": "default-room",
  "participantCount": 3,
  "maxParticipants": 10,
  "isScreenSharing": true,
  "screenSharingParticipantId": "participant-123"
}
```

**ステータスコード**:
- `200 OK`: 成功

---

### 統計情報

#### GET /stats/sessions
セッション統計を取得する

**クエリパラメータ**:
- `from`: 開始日時 (ISO 8601)
- `to`: 終了日時 (ISO 8601)

**レスポンス**:
```json
{
  "totalSessions": 150,
  "uniqueParticipants": 45,
  "averageSessionDuration": 1820,
  "peakConcurrentUsers": 8
}
```

**ステータスコード**:
- `200 OK`: 成功
- `400 Bad Request`: パラメータエラー

---

### 設定

#### GET /config/webrtc
WebRTC設定を取得する

**レスポンス**:
```json
{
  "iceServers": [
    {
      "urls": "stun:stun.l.google.com:19302"
    },
    {
      "urls": "turn:turnserver.example.com:3478",
      "username": "user",
      "credential": "pass"
    }
  ]
}
```

**ステータスコード**:
- `200 OK`: 成功

## エラーレスポンス形式

すべてのエラーレスポンスは以下の形式に従う：

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": {}
  }
}
```

## レート制限

- WebSocket接続: 1 IP アドレスあたり 10接続/分
- REST API: 1 IP アドレスあたり 100リクエスト/分

## CORS設定

許可するオリジン:
- 開発環境: `http://localhost:3000`
- 本番環境: `https://[production-domain]`

## 将来の拡張予定

1. **認証機能**
   - JWT トークンベース認証
   - OAuth2.0 統合

2. **複数ルーム対応**
   - POST /rooms - ルーム作成
   - GET /rooms - ルーム一覧
   - DELETE /rooms/:id - ルーム削除

3. **録画機能**
   - POST /recordings/start
   - POST /recordings/stop
   - GET /recordings/:id

4. **チャット機能**
   - Socket.IO: `chat-message` イベント
   - GET /messages - メッセージ履歴