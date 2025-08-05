/**
 * TASK-104: 画面共有制御機能実装 - 簡単テスト
 * 
 * 【テスト目的】: 基本的な画面共有機能の動作確認
 * 【実装方針】: 最小限のテストで動作確認
 */

import { getScreenShareManager, resetScreenShareManager } from '../screen-share-manager';

describe('TASK-104: Screen Share Manager Basic Tests', () => {
  beforeEach(() => {
    resetScreenShareManager();
  });

  test('SCREEN-BASIC-001: ScreenShareManagerが正常に初期化できる', () => {
    const screenShareManager = getScreenShareManager();
    
    expect(screenShareManager.isScreenSharingActive()).toBe(false);
    expect(screenShareManager.getCurrentScreenSharingParticipant()).toBeNull();
  });

  test('SCREEN-BASIC-002: 統計情報が正常に取得できる', () => {
    const screenShareManager = getScreenShareManager();
    const stats = screenShareManager.getStats();
    
    expect(stats.totalScreenShareSessions).toBe(0);
    expect(stats.activeScreenShareSessions).toBe(0);
    expect(stats.errorSessions).toBe(0);
  });
});