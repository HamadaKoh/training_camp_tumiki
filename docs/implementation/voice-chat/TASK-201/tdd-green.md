# TASK-201: React基本構成とUI実装 - GREEN Phase

## 目的
失敗するテストを通すための最小限の実装を行う。

## 実装方針
1. テストが通る最小限の実装
2. 過度な機能追加は行わない
3. 型安全性を確保
4. 基本的なアクセシビリティ要件を満たす

## 実装順序

### 1. 共通コンポーネントから実装
- LoadingSpinner
- ErrorAlert
- Button (共通ボタンコンポーネント)

### 2. メインコンポーネント実装
- ParticipantsList
- MediaControls  
- RoomView

## 共通コンポーネント実装

### LoadingSpinner Component
最小限のローディングスピナー実装

### ErrorAlert Component  
基本的なエラー表示機能

### Button Component
再利用可能なボタンコンポーネント

## メインコンポーネント実装

### ParticipantsList Component
- 参加者一覧の表示
- ミュート・画面共有状態のアイコン表示
- 現在ユーザーのハイライト

### MediaControls Component
- ミュート/ミュート解除ボタン
- 画面共有開始/停止ボタン
- 無効化状態の対応
- 適切なARIA属性

### RoomView Component
- ルーム情報の表示
- 子コンポーネントの統合
- 接続状態の表示
- 退室ボタン

## テスト通過確認
すべてのテストが通ることを確認し、必要最小限の機能が実装されていることを検証。