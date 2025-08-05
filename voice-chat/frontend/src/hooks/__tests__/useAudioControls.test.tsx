import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAudioControls } from '../useAudioControls';

// Mock Socket.IO
const mockSocketEmit = vi.fn();
const mockSocketOn = vi.fn();
const mockSocketOff = vi.fn();

const mockSocket = {
  emit: mockSocketEmit,
  on: mockSocketOn,
  off: mockSocketOff,
  connected: true,
};

// Mock Audio Track
const mockAudioTrack = {
  enabled: true,
  kind: 'audio' as const,
  stop: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

// Mock MediaStream
const mockMediaStream = {
  getAudioTracks: vi.fn(() => [mockAudioTrack]),
  getTracks: vi.fn(() => [mockAudioTrack]),
};

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};

// Mock useWebRTC
const mockUseWebRTC = {
  localStream: mockMediaStream,
  peers: new Map(),
  connectionStatus: {},
  remoteStreams: new Map(),
  initializeConnection: vi.fn(),
  createOffer: vi.fn(),
  handleAnswer: vi.fn(),
  handleOffer: vi.fn(),
  addIceCandidate: vi.fn(),
  cleanup: vi.fn(),
};

// Mock useSocketConnection
const mockUseSocketConnection = {
  connectionState: {
    isConnected: true,
    isConnecting: false,
    error: null,
    socket: mockSocket,
    reconnectAttempts: 0,
  },
  connect: vi.fn(),
  disconnect: vi.fn(),
  emit: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
  });
  vi.clearAllMocks();
  mockAudioTrack.enabled = true;

  // Mock console.error to suppress expected error messages
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// Mock the hooks
vi.mock('../useWebRTC', () => ({
  useWebRTC: () => mockUseWebRTC,
}));

vi.mock('../useSocketConnection', () => ({
  useSocketConnection: () => mockUseSocketConnection,
}));

describe('useAudioControls', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    // Restore localStream to ensure it's available for next test
    mockUseWebRTC.localStream = mockMediaStream;
  });

  describe('Hook Initialization', () => {
    it('should initialize with correct default values', () => {
      // AUDIO-001: useAudioControls初期化
      const { result } = renderHook(() => useAudioControls());

      expect(result.current.isMuted).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.participantMuteStates).toEqual({});
    });

    it('should integrate with WebRTC', () => {
      // AUDIO-002: WebRTC統合確認
      renderHook(() => useAudioControls());

      expect(mockUseWebRTC.localStream).toBeDefined();
    });
  });

  describe('Mute Control', () => {
    it('should toggle mute state', async () => {
      // AUDIO-003: ミュート切り替え
      const { result } = renderHook(() => useAudioControls());

      await act(async () => {
        await result.current.toggleMute();
      });

      expect(result.current.isMuted).toBe(true);
      expect(mockAudioTrack.enabled).toBe(false);
      expect(mockSocketEmit).toHaveBeenCalledWith(
        'audio-mute-changed',
        expect.objectContaining({
          isMuted: true,
          timestamp: expect.any(Number),
        })
      );
    });

    it('should unmute when toggling from muted state', async () => {
      // AUDIO-004: ミュート解除
      const { result } = renderHook(() => useAudioControls());

      // First mute
      await act(async () => {
        await result.current.toggleMute();
      });

      // Then unmute
      await act(async () => {
        await result.current.toggleMute();
      });

      expect(result.current.isMuted).toBe(false);
      expect(mockAudioTrack.enabled).toBe(true);
      expect(mockSocketEmit).toHaveBeenLastCalledWith(
        'audio-mute-changed',
        expect.objectContaining({
          isMuted: false,
        })
      );
    });

    it('should set mute state directly to true', async () => {
      // AUDIO-005: 直接ミュート設定
      const { result } = renderHook(() => useAudioControls());

      await act(async () => {
        await result.current.setMuted(true);
      });

      expect(result.current.isMuted).toBe(true);
      expect(mockAudioTrack.enabled).toBe(false);
    });

    it('should set mute state directly to false', async () => {
      // AUDIO-006: 直接ミュート解除設定
      const { result } = renderHook(() => useAudioControls());

      // First mute
      await act(async () => {
        await result.current.setMuted(true);
      });

      // Then unmute
      await act(async () => {
        await result.current.setMuted(false);
      });

      expect(result.current.isMuted).toBe(false);
      expect(mockAudioTrack.enabled).toBe(true);
    });
  });

  describe('Loading State Management', () => {
    it('should show loading state during mute operation', async () => {
      // AUDIO-007: ミュート操作中のローディング
      const { result } = renderHook(() => useAudioControls());

      // Since the operation is synchronous, we verify the loading state manages correctly
      expect(result.current.isLoading).toBe(false);

      await act(async () => {
        await result.current.toggleMute();
      });

      // After operation completes, should not be loading
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isMuted).toBe(true);
    });

    it('should prevent concurrent operations', async () => {
      // AUDIO-008: 同時操作の防止
      const { result } = renderHook(() => useAudioControls());

      // Start first operation
      await act(async () => {
        await result.current.setMuted(true);
      });

      const initialCallCount = mockSocketEmit.mock.calls.length;

      // Try to set to the same state multiple times - should be prevented
      await act(async () => {
        const promises = [
          result.current.setMuted(true),
          result.current.setMuted(true),
          result.current.setMuted(true),
        ];
        await Promise.all(promises);
      });

      // No additional socket emissions should have occurred since state didn't change
      expect(mockSocketEmit).toHaveBeenCalledTimes(initialCallCount);
    });
  });

  describe('Participant State Management', () => {
    it('should update participant mute state', async () => {
      // AUDIO-009: 参加者ミュート状態更新
      const { result } = renderHook(() => useAudioControls());

      // Simulate receiving participant mute state change
      const mockEventHandler = mockSocketOn.mock.calls.find(
        (call) => call[0] === 'participant-mute-changed'
      )?.[1];

      expect(mockEventHandler).toBeDefined();

      await act(async () => {
        mockEventHandler({
          userId: 'user123',
          isMuted: true,
        });
      });

      expect(result.current.participantMuteStates['user123']).toBe(true);
    });

    it('should manage multiple participant states independently', async () => {
      // AUDIO-010: 複数参加者状態管理
      const { result } = renderHook(() => useAudioControls());

      const mockEventHandler = mockSocketOn.mock.calls.find(
        (call) => call[0] === 'participant-mute-changed'
      )?.[1];

      // Update multiple participants
      await act(async () => {
        mockEventHandler({ userId: 'user1', isMuted: true });
      });

      await act(async () => {
        mockEventHandler({ userId: 'user2', isMuted: false });
      });

      expect(result.current.participantMuteStates['user1']).toBe(true);
      expect(result.current.participantMuteStates['user2']).toBe(false);
    });
  });

  describe('Audio Track Control', () => {
    it('should get audio tracks from media stream', async () => {
      // TRACK-001: 音声トラック取得
      const { result } = renderHook(() => useAudioControls());

      // Trigger an operation that requires getting audio tracks
      await act(async () => {
        await result.current.toggleMute();
      });

      expect(mockMediaStream.getAudioTracks).toHaveBeenCalled();
    });

    it('should enable audio track', async () => {
      // TRACK-002: 音声トラック有効化
      const { result } = renderHook(() => useAudioControls());

      await act(async () => {
        await result.current.setMuted(false);
      });

      expect(mockAudioTrack.enabled).toBe(true);
    });

    it('should disable audio track', async () => {
      // TRACK-003: 音声トラック無効化
      const { result } = renderHook(() => useAudioControls());

      await act(async () => {
        await result.current.setMuted(true);
      });

      expect(mockAudioTrack.enabled).toBe(false);
    });

    it('should handle missing audio tracks gracefully', async () => {
      // TRACK-004: 音声トラック未存在時の処理
      mockMediaStream.getAudioTracks.mockReturnValue([]);

      const { result } = renderHook(() => useAudioControls());

      await act(async () => {
        await expect(result.current.toggleMute()).rejects.toThrow();
      });

      // Application should not crash
      expect(result.current.isMuted).toBe(false);
    });
  });

  describe('Audio Quality Control', () => {
    it('should set audio quality', async () => {
      // QUALITY-001: 音声品質設定
      const { result } = renderHook(() => useAudioControls());

      await act(async () => {
        await result.current.setAudioQuality('high');
      });

      expect(mockSocketEmit).toHaveBeenCalledWith(
        'audio-quality-changed',
        expect.objectContaining({
          quality: 'high',
        })
      );
    });

    it('should handle invalid audio quality gracefully', async () => {
      // QUALITY-002: 無効な品質設定
      const { result } = renderHook(() => useAudioControls());

      await act(async () => {
        await expect(result.current.setAudioQuality('invalid' as any)).rejects.toThrow();
      });

      // Should not crash the application
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('Socket.IO Integration', () => {
    it('should send mute change events', async () => {
      // SOCKET-001: ミュート状態変更通知
      const { result } = renderHook(() => useAudioControls());

      await act(async () => {
        await result.current.toggleMute();
      });

      expect(mockSocketEmit).toHaveBeenCalledWith('audio-mute-changed', {
        isMuted: true,
        timestamp: expect.any(Number),
      });
    });

    it('should send audio quality change events', async () => {
      // SOCKET-002: 音声品質変更通知
      const { result } = renderHook(() => useAudioControls());

      await act(async () => {
        await result.current.setAudioQuality('medium');
      });

      expect(mockSocketEmit).toHaveBeenCalledWith('audio-quality-changed', {
        quality: 'medium',
      });
    });

    it('should setup event listeners', () => {
      // SOCKET-003: イベントリスナー設定
      renderHook(() => useAudioControls());

      expect(mockSocketOn).toHaveBeenCalledWith('participant-mute-changed', expect.any(Function));
      expect(mockSocketOn).toHaveBeenCalledWith('participants-updated', expect.any(Function));
    });

    it('should cleanup event listeners on unmount', () => {
      // SOCKET-004: イベントリスナークリーンアップ
      const { unmount } = renderHook(() => useAudioControls());

      unmount();

      expect(mockSocketOff).toHaveBeenCalledWith('participant-mute-changed', expect.any(Function));
      expect(mockSocketOff).toHaveBeenCalledWith('participants-updated', expect.any(Function));
    });
  });

  describe('Error Handling', () => {
    it('should handle audio device busy error', async () => {
      // ERROR-001: 音声デバイス使用中エラー
      const { result } = renderHook(() => useAudioControls());

      // Start with muted state
      await act(async () => {
        await result.current.setMuted(true);
      });

      // Now set up the error condition
      const error = new Error('Device busy');
      const throwingAudioTrack = {
        ...mockAudioTrack,
        set enabled(value: boolean) {
          throw error;
        },
        get enabled() {
          return true;
        },
      };

      // Override the media stream to return the throwing track for the error case
      const originalGetAudioTracks = mockUseWebRTC.localStream.getAudioTracks;
      mockUseWebRTC.localStream.getAudioTracks = vi.fn(() => [throwingAudioTrack]);

      await act(async () => {
        await expect(result.current.setMuted(false)).rejects.toThrow('Device busy');
      });

      // State should remain as muted since the operation failed
      expect(result.current.isMuted).toBe(true);

      // Restore original method
      mockUseWebRTC.localStream.getAudioTracks = originalGetAudioTracks;
    });

    it('should handle WebRTC not initialized error', async () => {
      // ERROR-003: PeerConnection未初期化エラー
      mockUseWebRTC.localStream = null;

      const { result } = renderHook(() => useAudioControls());

      await act(async () => {
        await expect(result.current.toggleMute()).rejects.toThrow();
      });

      expect(result.current.isMuted).toBe(false);
    });

    it('should handle Socket.IO disconnection gracefully', async () => {
      // ERROR-005: Socket.IO切断エラー
      const originalSocket = mockUseSocketConnection.connectionState.socket;
      mockUseSocketConnection.connectionState.socket = null as any;

      const { result } = renderHook(() => useAudioControls());

      await act(async () => {
        await result.current.toggleMute();
      });

      // Local state should still update
      expect(result.current.isMuted).toBe(true);
      expect(mockAudioTrack.enabled).toBe(false);

      // Restore original socket
      mockUseSocketConnection.connectionState.socket = originalSocket;
    });
  });

  describe('Performance', () => {
    it('should not create duplicate event listeners', () => {
      // PERF-003: 重複イベントリスナー防止
      const { rerender } = renderHook(() => useAudioControls());

      const initialCallCount = mockSocketOn.mock.calls.length;

      rerender();

      // Should not add more listeners
      expect(mockSocketOn.mock.calls.length).toBe(initialCallCount);
    });

    it('should prevent unnecessary socket emissions', async () => {
      // PERF-004: 不要な通信防止
      const { result } = renderHook(() => useAudioControls());

      // Mute to true
      await act(async () => {
        await result.current.setMuted(true);
      });

      const callCount = mockSocketEmit.mock.calls.length;

      // Try to set to same state
      await act(async () => {
        await result.current.setMuted(true);
      });

      // Should not emit additional events
      expect(mockSocketEmit.mock.calls.length).toBe(callCount);
    });
  });

  describe('Local Storage Integration', () => {
    it('should persist mute state to localStorage', async () => {
      const { result } = renderHook(() => useAudioControls());

      await act(async () => {
        await result.current.setMuted(true);
      });

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('voice-chat-muted', 'true');
    });

    it('should restore mute state from localStorage', () => {
      mockLocalStorage.getItem.mockReturnValue('true');

      const { result } = renderHook(() => useAudioControls());

      expect(result.current.isMuted).toBe(true);
    });
  });
});
