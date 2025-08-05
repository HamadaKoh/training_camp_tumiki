# TASK-102: ルーム管理機能実装 - テストケース設計書

## 概要

本文書は、TASK-102: ルーム管理機能実装のためのTDD（Test-Driven Development）に基づく包括的なテストケース設計書です。TASK-101で構築されたExpress + Socket.IOサーバー基盤の上に、RoomManager機能の詳細なテストケースを定義します。

## テスト環境・技術スタック

- **テストフレームワーク**: Jest + TypeScript
- **Integration Testing**: Socket.IO Client for event simulation
- **Database Testing**: PostgreSQL with test transactions
- **Mock/Stub**: Jest mock functions for error simulation
- **Coverage Target**: 90%以上のコードカバレッジ

## テストケース分類

### 1. 正常系テストケース（Normal Operation Test Cases）

#### 1.1 RoomManagerClass Initialization Test Cases

**Test Case ID**: `ROOM-NORMAL-001`  
**Test Name**: `RoomManagerクラスが正常に初期化される`  
**Description**: RoomManagerクラスのインスタンス生成と初期状態の確認

```typescript
describe('RoomManager正常系: 初期化とセットアップ', () => {
  test('RoomManagerクラスが正常に初期化される', () => {
    // Setup
    const roomManager = new RoomManager();
    
    // Execute & Verify
    expect(roomManager).toBeDefined();
    expect(roomManager.getParticipants().size).toBe(0);
    expect(roomManager.isRoomFull()).toBe(false);
    expect(roomManager.getRoomId()).toBe('default-room');
  });
});
```

**Input Data**: なし（コンストラクタのみ）  
**Expected Results**: 
- RoomManagerインスタンスが生成される
- 初期参加者数が0
- ルームが満員でない状態
- デフォルトルームIDが設定される

**Integration Points**: TASK-101のExpress基盤との統合確認

---

**Test Case ID**: `ROOM-NORMAL-002`  
**Test Name**: `RoomManagerが正しい初期設定で構成される`  
**Description**: 設定値とデフォルト値の正確性を確認

```typescript
test('RoomManagerが正しい初期設定で構成される', () => {
  // Setup
  const roomManager = new RoomManager();
  
  // Execute & Verify
  expect(roomManager.getMaxCapacity()).toBe(10);
  expect(roomManager.getCurrentParticipantCount()).toBe(0);
  expect(roomManager.getAvailableSlots()).toBe(10);
  expect(roomManager.getRoomStats()).toEqual({
    participantCount: 0,
    maxCapacity: 10,
    availableSlots: 10,
    isActive: true,
    createdAt: expect.any(Date)
  });
});
```

#### 1.2 Participant Join Success Test Cases

**Test Case ID**: `ROOM-NORMAL-003`  
**Test Name**: `参加者が正常にルームに参加できる`  
**Description**: 新規参加者の追加処理と状態管理

```typescript
test('参加者が正常にルームに参加できる', async () => {
  // Setup
  const roomManager = new RoomManager();
  const mockSocketId = 'socket-123';
  
  // Execute
  const participant = await roomManager.addParticipant(mockSocketId);
  
  // Verify
  expect(participant).toBeDefined();
  expect(participant.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i); // UUID v4
  expect(participant.socketId).toBe(mockSocketId);
  expect(participant.joinedAt).toBeInstanceOf(Date);
  expect(participant.isMuted).toBe(false);
  expect(participant.isSharingScreen).toBe(false);
  expect(participant.connectionQuality).toBe('good');
  
  expect(roomManager.getCurrentParticipantCount()).toBe(1);
  expect(roomManager.getParticipants().has(participant.id)).toBe(true);
});
```

**Input Data**: Socket ID文字列  
**Expected Results**: 
- Participantオブジェクトが生成される
- UUID v4形式のIDが生成される
- 参加者数が1増加する
- 参加者Mapに登録される

---

**Test Case ID**: `ROOM-NORMAL-004`  
**Test Name**: `PostgreSQLにセッション記録が正常に保存される`  
**Description**: データベースへのセッション情報永続化

```typescript
test('PostgreSQLにセッション記録が正常に保存される', async () => {
  // Setup
  await connectDatabase();
  const roomManager = new RoomManager();
  const mockSocketId = 'socket-456';
  
  // Execute
  const participant = await roomManager.addParticipant(mockSocketId);
  
  // Verify Database Record
  const sessionRecord = await pool.query(
    'SELECT * FROM sessions WHERE participant_id = $1',
    [participant.id]
  );
  
  expect(sessionRecord.rows).toHaveLength(1);
  expect(sessionRecord.rows[0]).toMatchObject({
    participant_id: participant.id,
    socket_id: mockSocketId,
    room_id: 'default-room',
    joined_at: expect.any(Date),
    left_at: null,
    user_agent: expect.any(String),
    ip_address: expect.any(String)
  });
});
```

#### 1.3 Participant Leave Success Test Cases

**Test Case ID**: `ROOM-NORMAL-005`  
**Test Name**: `参加者が正常にルームから退出できる`  
**Description**: 参加者の退出処理と状態更新

```typescript
test('参加者が正常にルームから退出できる', async () => {
  // Setup
  const roomManager = new RoomManager();
  const mockSocketId = 'socket-789';
  const participant = await roomManager.addParticipant(mockSocketId);
  
  // Execute
  await roomManager.removeParticipant(participant.id);
  
  // Verify
  expect(roomManager.getCurrentParticipantCount()).toBe(0);
  expect(roomManager.getParticipants().has(participant.id)).toBe(false);
  expect(roomManager.getParticipantBySocketId(mockSocketId)).toBeUndefined();
});
```

---

**Test Case ID**: `ROOM-NORMAL-006`  
**Test Name**: `退出時にPostgreSQLのleft_atが更新される`  
**Description**: データベースでの退出記録更新

```typescript
test('退出時にPostgreSQLのleft_atが更新される', async () => {
  // Setup
  await connectDatabase();
  const roomManager = new RoomManager();
  const mockSocketId = 'socket-999';
  const participant = await roomManager.addParticipant(mockSocketId);
  
  // Execute
  await roomManager.removeParticipant(participant.id);
  
  // Verify Database Update
  const sessionRecord = await pool.query(
    'SELECT * FROM sessions WHERE participant_id = $1',
    [participant.id]  
  );
  
  expect(sessionRecord.rows[0].left_at).toBeInstanceOf(Date);
  expect(sessionRecord.rows[0].left_at).not.toBeNull();
});
```

#### 1.4 Participant List Management Test Cases

**Test Case ID**: `ROOM-NORMAL-007`  
**Test Name**: `参加者リストが正確に取得できる`  
**Description**: 参加者一覧の取得と内容確認

```typescript
test('参加者リストが正確に取得できる', async () => {
  // Setup
  const roomManager = new RoomManager();
  const participants = [];
  
  // Add multiple participants
  for (let i = 0; i < 3; i++) {
    const participant = await roomManager.addParticipant(`socket-${i}`);
    participants.push(participant);
  }
  
  // Execute
  const participantMap = roomManager.getParticipants();
  const participantList = Array.from(participantMap.values());
  
  // Verify
  expect(participantMap.size).toBe(3);
  expect(participantList).toHaveLength(3);
  participants.forEach(participant => {
    expect(participantMap.has(participant.id)).toBe(true);
    expect(participantMap.get(participant.id)).toEqual(participant);
  });
});
```

#### 1.5 Socket.IO Event Integration Test Cases

**Test Case ID**: `ROOM-NORMAL-008`  
**Test Name**: `join-roomイベントが正常に処理される`  
**Description**: Socket.IOイベントハンドラーとの統合

```typescript
test('join-roomイベントが正常に処理される', (done) => {
  // Setup
  const port = 3005;
  httpServer.listen(port, () => {
    const client = io(`http://localhost:${port}`);
    
    client.on('room-joined', (data: RoomJoinedData) => {
      // Verify
      expect(data.success).toBe(true);
      expect(data.participant).toBeDefined();
      expect(data.participant.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(data.participants).toHaveLength(1);
      
      client.disconnect();
      done();
    });
    
    // Execute
    client.emit('join-room');
  });
});
```

---

**Test Case ID**: `ROOM-NORMAL-009`  
**Test Name**: `user-joinedイベントが他の参加者に配信される`  
**Description**: 新規参加者の通知機能

```typescript
test('user-joinedイベントが他の参加者に配信される', (done) => {
  // Setup
  const port = 3006;
  httpServer.listen(port, () => {
    const client1 = io(`http://localhost:${port}`);
    const client2 = io(`http://localhost:${port}`);
    
    let client1Joined = false;
    
    client1.on('room-joined', () => {
      client1Joined = true;
      // Client2 joins after Client1
      client2.emit('join-room');
    });
    
    client1.on('user-joined', (participant: Participant) => {
      // Verify
      expect(participant).toBeDefined();
      expect(participant.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(client1Joined).toBe(true);
      
      client1.disconnect();
      client2.disconnect();
      done();
    });
    
    // Execute
    client1.emit('join-room');
  });
});
```

### 2. エラーハンドリングテストケース（Error Handling Test Cases）

#### 2.1 Room Capacity Error Test Cases

**Test Case ID**: `ROOM-ERROR-001`  
**Test Name**: `ルーム満員時（11人目）に参加が拒否される`  
**Description**: 最大参加者数超過時のエラーハンドリング

```typescript
test('ルーム満員時（11人目）に参加が拒否される', async () => {
  // Setup - Fill room to capacity
  const roomManager = new RoomManager();
  const participants = [];
  
  for (let i = 0; i < 10; i++) {
    const participant = await roomManager.addParticipant(`socket-${i}`);
    participants.push(participant);
  }
  
  expect(roomManager.isRoomFull()).toBe(true);
  
  // Execute - Try to add 11th participant  
  await expect(roomManager.addParticipant('socket-overflow'))
    .rejects
    .toThrow('Room is at maximum capacity');
  
  // Verify state unchanged
  expect(roomManager.getCurrentParticipantCount()).toBe(10);
  expect(roomManager.isRoomFull()).toBe(true);
});
```

**Expected Results**: 
- ROOM_FULL エラーが発生する
- 参加者数が10のまま変わらない
- 新規参加者が追加されない

---

**Test Case ID**: `ROOM-ERROR-002`  
**Test Name**: `満員状態でのSocket.IO接続でroom-fullエラーが返される`  
**Description**: Socket.IOレベルでの満員制御

```typescript
test('満員状態でのSocket.IO接続でroom-fullエラーが返される', (done) => {
  // Setup - Fill room to capacity
  const port = 3007;
  httpServer.listen(port, async () => {
    // Add 10 participants via Socket.IO
    const clients = [];
    let joinedCount = 0;
    
    for (let i = 0; i < 10; i++) {
      const client = io(`http://localhost:${port}`);
      clients.push(client);
      
      client.on('room-joined', () => {
        joinedCount++;
        if (joinedCount === 10) {
          // Try 11th connection
          const overflowClient = io(`http://localhost:${port}`);
          
          overflowClient.on('room-full', (error: ErrorData) => {
            // Verify
            expect(error.code).toBe('ROOM_FULL');
            expect(error.message).toBe('Room has reached maximum capacity of 10 participants');
            
            clients.forEach(c => c.disconnect());
            overflowClient.disconnect();
            done();
          });
          
          overflowClient.emit('join-room');
        }
      });
      
      client.emit('join-room');
    }
  });
});
```

#### 2.2 Duplicate Participant Error Test Cases  

**Test Case ID**: `ROOM-ERROR-003`  
**Test Name**: `同一Socket IDでの重複参加が防止される`  
**Description**: 重複参加制御機能

```typescript
test('同一Socket IDでの重複参加が防止される', async () => {
  // Setup
  const roomManager = new RoomManager();
  const socketId = 'socket-duplicate';
  
  // Execute - First join should succeed
  const participant1 = await roomManager.addParticipant(socketId);
  expect(participant1).toBeDefined();
  
  // Execute - Second join should fail
  await expect(roomManager.addParticipant(socketId))
    .rejects
    .toThrow('Participant with socket ID socket-duplicate already exists');
    
  // Verify only one participant
  expect(roomManager.getCurrentParticipantCount()).toBe(1);
});
```

#### 2.3 Database Connection Error Test Cases

**Test Case ID**: `ROOM-ERROR-004`  
**Test Name**: `データベース接続失敗時にトランザクションがロールバックされる`  
**Description**: データベース障害時の一貫性保証

```typescript
test('データベース接続失敗時にトランザクションがロールバックされる', async () => {
  // Setup - Mock database failure
  const originalPool = (database as any).pool;
  (database as any).pool = {
    query: jest.fn().mockRejectedValue(new Error('Database connection failed'))
  };
  
  const roomManager = new RoomManager();
  const socketId = 'socket-db-fail';
  
  // Execute & Verify
  await expect(roomManager.addParticipant(socketId))
    .rejects
    .toThrow('Database connection failed');
    
  // Verify no participant added to memory
  expect(roomManager.getCurrentParticipantCount()).toBe(0);
  expect(roomManager.getParticipantBySocketId(socketId)).toBeUndefined();
  
  // Cleanup
  (database as any).pool = originalPool;
});
```

#### 2.4 Invalid Participant Data Error Test Cases

**Test Case ID**: `ROOM-ERROR-005`  
**Test Name**: `無効な参加者データでバリデーションエラーが発生する`  
**Description**: 入力値検証とエラーハンドリング

```typescript
test('無効な参加者データでバリデーションエラーが発生する', async () => {
  // Setup
  const roomManager = new RoomManager();
  
  // Test cases for invalid input
  const invalidInputs = [
    { input: '', expectedError: 'Socket ID cannot be empty' },
    { input: null, expectedError: 'Socket ID must be a string' },
    { input: undefined, expectedError: 'Socket ID must be a string' },
    { input: 123, expectedError: 'Socket ID must be a string' },
    { input: ' ', expectedError: 'Socket ID cannot be empty' }
  ];
  
  for (const testCase of invalidInputs) {
    await expect(roomManager.addParticipant(testCase.input as any))
      .rejects
      .toThrow(testCase.expectedError);
  }
});
```

#### 2.5 Socket Disconnection Error Recovery Test Cases

**Test Case ID**: `ROOM-ERROR-006`  
**Test Name**: `Socket切断時に自動的に参加者が削除される`  
**Description**: 突然の切断に対する自動回復機能

```typescript
test('Socket切断時に自動的に参加者が削除される', (done) => {
  // Setup
  const port = 3008;
  httpServer.listen(port, () => {
    const client = io(`http://localhost:${port}`);
    let participantId: string;
    
    client.on('room-joined', (data: RoomJoinedData) => {
      participantId = data.participant.id;
      
      // Simulate sudden disconnection
      client.disconnect();
    });
    
    // Monitor disconnect event
    socketIOServer.on('connection', (socket) => {
      socket.on('disconnect', async () => {
        // Verify participant was removed
        setTimeout(() => {
          const roomManager = getRoomManager(); // Get singleton instance
          expect(roomManager.getCurrentParticipantCount()).toBe(0);
          expect(roomManager.getParticipants().has(participantId)).toBe(false);
          done();
        }, 100);
      });
    });
    
    client.emit('join-room');
  });
});
```

### 3. 境界値テストケース（Boundary Value Test Cases）

#### 3.1 Maximum Capacity Boundary Test Cases

**Test Case ID**: `ROOM-BOUNDARY-001`  
**Test Name**: `ちょうど10人（最大容量）で正常動作する`  
**Description**: 最大容量での正常動作確認

```typescript
test('ちょうど10人（最大容量）で正常動作する', async () => {
  // Setup
  const roomManager = new RoomManager();
  const participants = [];
  
  // Execute - Add exactly 10 participants
  for (let i = 0; i < 10; i++) {
    const participant = await roomManager.addParticipant(`socket-${i}`);
    participants.push(participant);
  }
  
  // Verify
  expect(roomManager.getCurrentParticipantCount()).toBe(10);
  expect(roomManager.isRoomFull()).toBe(true);
  expect(roomManager.getAvailableSlots()).toBe(0);
  
  // All participants should be retrievable
  participants.forEach(participant => {
    expect(roomManager.getParticipants().has(participant.id)).toBe(true);
  });
  
  // Database should have 10 session records
  const sessionCount = await pool.query('SELECT COUNT(*) FROM sessions WHERE room_id = $1', ['default-room']);
  expect(parseInt(sessionCount.rows[0].count)).toBe(10);
});
```

---

**Test Case ID**: `ROOM-BOUNDARY-002`  
**Test Name**: `参加者0人から1人への遷移が正常動作する`  
**Description**: 空ルームから最初の参加者追加

```typescript
test('参加者0人から1人への遷移が正常動作する', async () => {
  // Setup
  const roomManager = new RoomManager();
  expect(roomManager.getCurrentParticipantCount()).toBe(0);
  
  // Execute
  const participant = await roomManager.addParticipant('socket-first');
  
  // Verify boundary transition
  expect(roomManager.getCurrentParticipantCount()).toBe(1);
  expect(roomManager.isRoomFull()).toBe(false);
  expect(roomManager.getAvailableSlots()).toBe(9);
  expect(participant.id).toBeDefined();
});
```

#### 3.2 Single Participant Edge Cases

**Test Case ID**: `ROOM-BOUNDARY-003`  
**Test Name**: `最後の参加者（1人→0人）の退出が正常動作する`  
**Description**: ルーム空状態への遷移

```typescript
test('最後の参加者（1人→0人）の退出が正常動作する', async () => {
  // Setup
  const roomManager = new RoomManager();
  const participant = await roomManager.addParticipant('socket-last');
  expect(roomManager.getCurrentParticipantCount()).toBe(1);
  
  // Execute
  await roomManager.removeParticipant(participant.id);
  
  // Verify empty room state
  expect(roomManager.getCurrentParticipantCount()).toBe(0);
  expect(roomManager.isRoomFull()).toBe(false);
  expect(roomManager.getAvailableSlots()).toBe(10);
  expect(roomManager.getParticipants().size).toBe(0);
});
```

#### 3.3 Null/Undefined Data Boundary Test Cases

**Test Case ID**: `ROOM-BOUNDARY-004`  
**Test Name**: `null/undefined参加者データの適切な処理`  
**Description**: NULL値境界での動作確認

```typescript
test('null/undefined参加者データの適切な処理', () => {
  // Setup
  const roomManager = new RoomManager();
  
  // Test null values
  expect(roomManager.getParticipantBySocketId(null as any)).toBeUndefined();
  expect(roomManager.getParticipantBySocketId(undefined as any)).toBeUndefined();
  expect(roomManager.getParticipantBySocketId('')).toBeUndefined();
  
  // Test non-existent participant removal
  expect(() => roomManager.removeParticipant(null as any))
    .toThrow('Participant ID cannot be null or undefined');
  expect(() => roomManager.removeParticipant(undefined as any))
    .toThrow('Participant ID cannot be null or undefined');
});
```

#### 3.4 Long Data Input Boundary Test Cases

**Test Case ID**: `ROOM-BOUNDARY-005`  
**Test Name**: `長い参加者名・無効データの境界値処理`  
**Description**: データ長制限とバリデーション

```typescript
test('長い参加者名・無効データの境界値処理', async () => {
  // Setup
  const roomManager = new RoomManager();
  
  // Test extremely long socket ID (over typical limits)
  const longSocketId = 'a'.repeat(1000);
  const participant = await roomManager.addParticipant(longSocketId);
  
  // Verify it's handled properly
  expect(participant.socketId).toBe(longSocketId);
  expect(participant.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  
  // Test socket ID with special characters
  const specialSocketId = 'socket-123!@#$%^&*()_+-=[]{}|;:,.<>?';
  const specialParticipant = await roomManager.addParticipant(specialSocketId);
  expect(specialParticipant.socketId).toBe(specialSocketId);
});
```

#### 3.5 Database Transaction Edge Cases

**Test Case ID**: `ROOM-BOUNDARY-006`  
**Test Name**: `データベーストランザクション境界での整合性`  
**Description**: 並行処理とトランザクション境界

```typescript
test('データベーストランザクション境界での整合性', async () => {
  // Setup
  await connectDatabase();
  const roomManager = new RoomManager();
  
  // Execute concurrent participant additions
  const concurrentPromises = [];
  for (let i = 0; i < 5; i++) {
    concurrentPromises.push(roomManager.addParticipant(`socket-concurrent-${i}`));
  }
  
  const participants = await Promise.all(concurrentPromises);
  
  // Verify all participants were added correctly
  expect(participants).toHaveLength(5);
  expect(roomManager.getCurrentParticipantCount()).toBe(5);
  
  // Verify database consistency
  const sessionRecords = await pool.query('SELECT COUNT(*) FROM sessions WHERE room_id = $1', ['default-room']);
  expect(parseInt(sessionRecords.rows[0].count)).toBe(5);
  
  // Verify all session records have unique participant IDs
  const participantIds = await pool.query('SELECT participant_id FROM sessions WHERE room_id = $1', ['default-room']);
  const uniqueIds = new Set(participantIds.rows.map(row => row.participant_id));
  expect(uniqueIds.size).toBe(5);
});
```

## テスト実行戦略

### テスト実行順序
1. **単体テスト**: RoomManagerクラスの各メソッド
2. **統合テスト**: Socket.IOイベント処理
3. **データベーステスト**: PostgreSQL連携
4. **E2Eテスト**: 完全なシナリオ

### テスト環境セットアップ
```typescript
// jest.setup.ts
beforeAll(async () => {
  // Test database connection
  await connectDatabase();
  
  // Clean up test data
  await pool.query('TRUNCATE TABLE sessions, event_logs');
});

afterAll(async () => {
  // Cleanup connections
  await disconnectDatabase();
});

beforeEach(() => {
  // Reset room manager state
  resetRoomManager();
});
```

### カバレッジ要件
- **Statement Coverage**: 95%以上
- **Branch Coverage**: 90%以上  
- **Function Coverage**: 100%
- **Line Coverage**: 95%以上

## 成功条件

### 機能的成功条件
- [ ] 全テストケース（18ケース）が通過する
- [ ] 参加者の入退室が正確に管理される
- [ ] データベース記録が正確に行われる
- [ ] Socket.IOイベントが適切に処理される
- [ ] エラーケースが適切に処理される

### 非機能的成功条件
- [ ] テスト実行時間が5分以内
- [ ] メモリリークが発生しない
- [ ] データベース整合性が保たれる
- [ ] 並行処理が正しく動作する

### 品質成功条件
- [ ] コードカバレッジが90%以上
- [ ] TypeScript型エラー0件
- [ ] ESLintエラー0件
- [ ] すべてのテストケースが独立して実行可能

---

**作成日**: 2025-08-05  
**対象タスク**: TASK-102: ルーム管理機能実装  
**テスト手法**: TDD (Test-Driven Development)  
**技術スタック**: TypeScript + Jest + Express + Socket.IO + PostgreSQL

この設計書に基づき、Red-Green-Refactorサイクルでの実装を進めます。