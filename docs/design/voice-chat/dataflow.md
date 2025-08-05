# データフロー図

## ユーザーインタラクションフロー

### 全体フロー
```mermaid
flowchart TD
    A[ユーザー] -->|アクセス| B[React Frontend]
    B -->|WebSocket接続| C[Signaling Server]
    C -->|参加者情報| D[PostgreSQL]
    B <-->|WebRTC P2P| E[他の参加者]
    
    B -->|メディアデバイス要求| F[ブラウザAPI]
    F -->|マイク許可| B
    
    C -->|ルーム状態管理| G[Room Manager]
    G -->|画面共有制御| H[Screen Share Manager]
```

### 参加フロー詳細
```mermaid
sequenceDiagram
    participant U as ユーザー
    participant F as Frontend
    participant S as Signaling Server
    participant D as Database
    participant O as 他の参加者
    
    U->>F: 参加ボタンクリック
    F->>F: マイク許可要求
    F->>S: Socket.IO接続
    S->>D: セッション作成
    D-->>S: セッションID
    S->>S: ルームに参加者追加
    S-->>F: 参加成功 + 参加者リスト
    S-->>O: 新規参加者通知
    
    Note over F,O: WebRTC接続確立開始
    F->>O: WebRTC Offer (via S)
    O->>F: WebRTC Answer (via S)
    F<->O: ICE候補交換 (via S)
    F<-->O: P2P音声ストリーム確立
```

## WebRTC接続確立フロー

### シグナリングシーケンス
```mermaid
sequenceDiagram
    participant A as Peer A (新規参加者)
    participant S as Signaling Server
    participant B as Peer B (既存参加者)
    
    A->>S: join-room
    S->>B: user-joined {userId: A}
    
    B->>B: createOffer()
    B->>S: offer {to: A, sdp: ...}
    S->>A: offer {from: B, sdp: ...}
    
    A->>A: createAnswer()
    A->>S: answer {to: B, sdp: ...}
    S->>B: answer {from: A, sdp: ...}
    
    A->>S: ice-candidate {to: B, candidate: ...}
    S->>B: ice-candidate {from: A, candidate: ...}
    
    B->>S: ice-candidate {to: A, candidate: ...}
    S->>A: ice-candidate {from: B, candidate: ...}
    
    Note over A,B: P2P接続確立完了
    A<-->B: 音声ストリーム (直接通信)
```

## 画面共有フロー

### 画面共有開始シーケンス
```mermaid
sequenceDiagram
    participant U as ユーザー
    participant F as Frontend
    participant S as Signaling Server
    participant M as Screen Share Manager
    participant O as 他の参加者
    
    U->>F: 画面共有ボタンクリック
    F->>S: request-screen-share
    S->>M: checkAvailability()
    
    alt 画面共有可能
        M-->>S: available: true
        S-->>F: screen-share-granted
        F->>F: getDisplayMedia()
        F->>F: replaceTrack() for all peers
        F->>S: screen-share-started
        S-->>O: screen-share-started {userId}
        O->>O: 画面共有表示
    else 既に共有中
        M-->>S: available: false
        S-->>F: screen-share-denied
        F->>U: エラーメッセージ表示
    end
```

### 画面共有停止シーケンス
```mermaid
sequenceDiagram
    participant U as ユーザー
    participant F as Frontend
    participant S as Signaling Server
    participant O as 他の参加者
    
    U->>F: 共有停止ボタンクリック
    F->>F: stopScreenShare()
    F->>F: replaceTrack(audio) for all peers
    F->>S: screen-share-stopped
    S-->>O: screen-share-stopped {userId}
    O->>O: 画面共有終了
```

## エラー処理フロー

### 接続エラー処理
```mermaid
flowchart TD
    A[WebRTC接続試行] --> B{接続成功?}
    B -->|Yes| C[音声通話開始]
    B -->|No| D{リトライ可能?}
    D -->|Yes| E[ICEサーバー再取得]
    E --> F[再接続試行]
    F --> B
    D -->|No| G[エラー表示]
    G --> H[フォールバック処理]
```

### ネットワーク切断・再接続フロー
```mermaid
sequenceDiagram
    participant F as Frontend
    participant S as Signaling Server
    participant P as Peer Connections
    
    Note over F,S: ネットワーク切断発生
    F->>F: Socket.IO disconnect event
    F->>F: 全PeerConnection監視
    F->>F: 再接続UI表示
    
    Note over F,S: ネットワーク復旧
    F->>S: Socket.IO自動再接続
    S-->>F: reconnect + ルーム状態
    
    loop 各参加者に対して
        F->>P: 接続状態確認
        alt 接続断
            F->>P: 再接続処理
        end
    end
    
    F->>F: UI更新
```

## 状態管理フロー

### クライアント側状態管理
```mermaid
stateDiagram-v2
    [*] --> Disconnected
    Disconnected --> Connecting: 参加ボタンクリック
    Connecting --> Connected: 接続成功
    Connecting --> Error: 接続失敗
    Connected --> InCall: 音声接続確立
    InCall --> ScreenSharing: 画面共有開始
    ScreenSharing --> InCall: 画面共有停止
    InCall --> Disconnected: 退出
    Error --> Disconnected: リトライ/キャンセル
```

### サーバー側ルーム状態管理
```mermaid
stateDiagram-v2
    [*] --> Empty
    Empty --> Active: 最初の参加者
    Active --> Active: 参加/退出
    Active --> ScreenShareActive: 画面共有開始
    ScreenShareActive --> Active: 画面共有終了
    Active --> Empty: 最後の参加者退出
    Empty --> [*]
```

## データ同期フロー

### 参加者リスト同期
```mermaid
flowchart LR
    A[参加者変更イベント] --> B[Room Manager]
    B --> C[参加者リスト更新]
    C --> D[全クライアントに配信]
    D --> E[UI更新]
    
    B --> F[Database更新]
    F --> G[監査ログ]
```

### リアルタイムメトリクス更新
```mermaid
sequenceDiagram
    participant F as Frontend
    participant S as Server
    participant M as Metrics Collector
    
    loop 5秒ごと
        F->>F: getStats() from PeerConnection
        F->>S: report-metrics {latency, packetLoss}
        S->>M: 集計
    end
    
    S-->>F: connection-quality {status: good/fair/poor}
    F->>F: 品質インジケーター更新
```