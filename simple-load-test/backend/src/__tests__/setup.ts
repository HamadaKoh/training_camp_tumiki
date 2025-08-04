// Jest setup file for test environment
// テスト実行前の共通セットアップ

// テスト環境の環境変数設定
process.env.NODE_ENV = 'test';
process.env.PORT = '3001'; // テスト用ポート（本番と分離）

// タイムアウト設定（デフォルト5秒から10秒に延長）
jest.setTimeout(10000);