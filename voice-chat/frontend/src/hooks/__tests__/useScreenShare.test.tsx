import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScreenShare } from '../useScreenShare';

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

// Mock Video Track
const mockVideoTrack = {
  enabled: true,
  kind: 'video' as const,
  stop: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  onended: null,
};

// Mock Screen Stream
const mockScreenStream = {
  getVideoTracks: vi.fn(() => [mockVideoTrack]),
  getTracks: vi.fn(() => [mockVideoTrack]),
  addTrack: vi.fn(),
  removeTrack: vi.fn(),
};

// Mock DisplayMedia API
const mockGetDisplayMedia = vi.fn(() => Promise.resolve(mockScreenStream));

// Mock RTC Sender
const mockSender = {
  replaceTrack: vi.fn(() => Promise.resolve()),
  track: mockVideoTrack,
};

// Mock PeerConnection
const mockPeerConnection = {
  getSenders: vi.fn(() => [mockSender]),
};

// Mock useWebRTC
const mockUseWebRTC = {
  localStream: {
    getVideoTracks: vi.fn(() => [mockVideoTrack]),
  },
  peers: new Map([
    ['user1', mockPeerConnection],
    ['user2', mockPeerConnection],
  ]),
  connectionStatus: {},
  remoteStreams: new Map(),
  initializeConnection: vi.fn(),
  createOffer: vi.fn(),
  handleAnswer: vi.fn(),
  handleOffer: vi.fn(),
  addIceCandidate: vi.fn(),
  cleanup: vi.fn(),
};

// Mock useAudioControls
const mockUseAudioControls = {
  isMuted: false,
  isLoading: false,
  participantMuteStates: {},
  toggleMute: vi.fn(),
  setMuted: vi.fn(),
  setAudioQuality: vi.fn(),
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
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      mediaDevices: {
        getDisplayMedia: mockGetDisplayMedia,
      },
    },
    writable: true,
  });

  vi.clearAllMocks();
  mockVideoTrack.onended = null;

  // Mock console.error to suppress expected error messages
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// Mock the hooks
vi.mock('../useWebRTC', () => ({
  useWebRTC: () => mockUseWebRTC,
}));

vi.mock('../useAudioControls', () => ({
  useAudioControls: () => mockUseAudioControls,
}));

vi.mock('../useSocketConnection', () => ({
  useSocketConnection: () => mockUseSocketConnection,
}));

describe('useScreenShare', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('Hook Initialization', () => {
    it('should initialize with correct default values', () => {
      // SCREEN-001: useScreenShare初期化
      const { result } = renderHook(() => useScreenShare());

      expect(result.current.isSharing).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.sharingUserId).toBeNull();
      expect(result.current.screenStream).toBeNull();
      expect(result.current.sharedScreenStream).toBeNull();
    });

    it('should integrate with existing hooks', () => {
      // SCREEN-002: WebRTC統合確認
      renderHook(() => useScreenShare());

      expect(mockUseWebRTC).toBeDefined();
      expect(mockUseAudioControls).toBeDefined();
      expect(mockUseSocketConnection).toBeDefined();
    });
  });

  describe('Screen Share Start', () => {
    it('should start screen sharing successfully', async () => {
      // SCREEN-003: 画面共有開始
      const { result } = renderHook(() => useScreenShare());

      await act(async () => {
        await result.current.startScreenShare();
      });

      expect(mockGetDisplayMedia).toHaveBeenCalledWith({
        video: {
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 30, max: 60 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      expect(result.current.isSharing).toBe(true);
      expect(result.current.screenStream).toBe(mockScreenStream);
      expect(mockSocketEmit).toHaveBeenCalledWith('screen-share-started', {
        userId: expect.any(String),
        timestamp: expect.any(Number),
      });
    });

    it('should execute replaceTrack for all peer connections', async () => {
      // SCREEN-004: replaceTrack実行
      const { result } = renderHook(() => useScreenShare());

      await act(async () => {
        await result.current.startScreenShare();
      });

      expect(mockSender.replaceTrack).toHaveBeenCalledTimes(2); // 2 peer connections
      expect(mockSender.replaceTrack).toHaveBeenCalledWith(mockVideoTrack);
    });

    it('should stop screen sharing successfully', async () => {
      // SCREEN-005: 画面共有停止
      const { result } = renderHook(() => useScreenShare());

      // First start sharing
      await act(async () => {
        await result.current.startScreenShare();
      });

      // Then stop sharing
      await act(async () => {
        await result.current.stopScreenShare();
      });

      expect(result.current.isSharing).toBe(false);
      expect(result.current.screenStream).toBeNull();
      expect(mockVideoTrack.stop).toHaveBeenCalled();
      expect(mockSocketEmit).toHaveBeenCalledWith('screen-share-stopped', {
        userId: expect.any(String),
        timestamp: expect.any(Number),
      });
    });
  });

  describe('Exclusive Control', () => {
    it('should prevent concurrent sharing', async () => {
      // SCREEN-006: 同時共有防止
      const { result } = renderHook(() => useScreenShare());

      // Simulate another user sharing
      await act(async () => {
        const mockEventHandler = mockSocketOn.mock.calls.find(
          (call) => call[0] === 'participant-screen-share-started'
        )?.[1];

        if (mockEventHandler) {
          mockEventHandler({ userId: 'other-user' });
        }
      });

      // Try to start sharing
      await act(async () => {
        await expect(result.current.startScreenShare()).rejects.toThrow();
      });

      expect(result.current.isSharing).toBe(false);
      expect(mockGetDisplayMedia).not.toHaveBeenCalled();
    });

    it('should handle sharing user disconnection', async () => {
      // SCREEN-007: 共有者の切断処理
      const { result } = renderHook(() => useScreenShare());

      // Set up sharing user
      await act(async () => {
        const mockEventHandler = mockSocketOn.mock.calls.find(
          (call) => call[0] === 'participant-screen-share-started'
        )?.[1];

        if (mockEventHandler) {
          mockEventHandler({ userId: 'sharing-user' });
        }
      });

      expect(result.current.sharingUserId).toBe('sharing-user');

      // Simulate user disconnection
      await act(async () => {
        const mockEventHandler = mockSocketOn.mock.calls.find(
          (call) => call[0] === 'participant-screen-share-stopped'
        )?.[1];

        if (mockEventHandler) {
          mockEventHandler({ userId: 'sharing-user' });
        }
      });

      expect(result.current.sharingUserId).toBeNull();
      expect(result.current.sharedScreenStream).toBeNull();
    });
  });

  describe('Loading State Management', () => {
    it('should show loading state during screen share operation', async () => {
      // SCREEN-008: 画面共有開始中のローディング
      const { result } = renderHook(() => useScreenShare());

      let resolvePromise: (value: MediaStream) => void;
      const delayedPromise = new Promise<MediaStream>((resolve) => {
        resolvePromise = resolve;
      });

      mockGetDisplayMedia.mockImplementation(
        () => delayedPromise as unknown as Promise<typeof mockScreenStream>
      );

      act(() => {
        void result.current.startScreenShare();
      });

      // Should be loading
      expect(result.current.isLoading).toBe(true);

      // Complete the operation
      await act(async () => {
        resolvePromise(mockScreenStream as unknown as MediaStream);
        await delayedPromise;
      });

      // Should not be loading anymore
      expect(result.current.isLoading).toBe(false);
    });

    it('should prevent concurrent operations', async () => {
      // SCREEN-009: 同時操作の防止
      const { result } = renderHook(() => useScreenShare());

      // Start first operation
      const firstOperation = act(async () => {
        await result.current.startScreenShare();
      });

      // Try second operation while first is in progress
      await act(async () => {
        await result.current.startScreenShare();
      });

      await firstOperation;

      // Only one share operation should have occurred
      expect(mockGetDisplayMedia).toHaveBeenCalledTimes(1);
    });
  });

  describe('Stream Management', () => {
    it('should call getDisplayMedia with correct constraints', async () => {
      // STREAM-001: getDisplayMedia呼び出し
      const { result } = renderHook(() => useScreenShare());

      await act(async () => {
        await result.current.startScreenShare();
      });

      expect(mockGetDisplayMedia).toHaveBeenCalledWith({
        video: {
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 30, max: 60 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
    });

    it('should manage screen stream correctly', async () => {
      // STREAM-002: 画面共有ストリーム取得
      const { result } = renderHook(() => useScreenShare());

      await act(async () => {
        await result.current.startScreenShare();
      });

      expect(result.current.screenStream).toBe(mockScreenStream);
      expect(mockScreenStream.getVideoTracks).toHaveBeenCalled();
    });

    it('should stop stream tracks on share stop', async () => {
      // STREAM-003: ストリーム停止処理
      const { result } = renderHook(() => useScreenShare());

      await act(async () => {
        await result.current.startScreenShare();
      });

      await act(async () => {
        await result.current.stopScreenShare();
      });

      expect(mockVideoTrack.stop).toHaveBeenCalled();
      expect(result.current.screenStream).toBeNull();
    });

    it('should detect automatic stream stop', async () => {
      // STREAM-004: ストリーム自動停止検知
      const { result } = renderHook(() => useScreenShare());

      await act(async () => {
        await result.current.startScreenShare();
      });

      // Simulate browser UI stop
      await act(async () => {
        const track = mockVideoTrack as unknown as MediaStreamTrack & {
          onended: ((this: MediaStreamTrack, ev: Event) => unknown) | null;
        };
        if (track.onended) {
          track.onended({} as Event);
        }
      });

      expect(result.current.isSharing).toBe(false);
    });
  });

  describe('ReplaceTrack Processing', () => {
    it('should replace video tracks', async () => {
      // REPLACE-001: 映像トラック置換
      const { result } = renderHook(() => useScreenShare());

      await act(async () => {
        await result.current.startScreenShare();
      });

      expect(mockSender.replaceTrack).toHaveBeenCalledWith(mockVideoTrack);
    });

    it('should replace tracks for multiple connections', async () => {
      // REPLACE-002: 複数接続でのトラック置換
      const { result } = renderHook(() => useScreenShare());

      await act(async () => {
        await result.current.startScreenShare();
      });

      // Should replace track for both peer connections
      expect(mockSender.replaceTrack).toHaveBeenCalledTimes(2);
    });

    it('should restore original tracks on stop', async () => {
      // REPLACE-003: トラック復元処理
      const { result } = renderHook(() => useScreenShare());

      await act(async () => {
        await result.current.startScreenShare();
      });

      await act(async () => {
        await result.current.stopScreenShare();
      });

      // Should restore original video track from localStream
      expect(mockSender.replaceTrack).toHaveBeenCalledWith(mockVideoTrack);
    });

    it('should handle replaceTrack failure gracefully', async () => {
      // REPLACE-004: replaceTrack失敗処理
      mockSender.replaceTrack.mockRejectedValueOnce(new Error('Replace failed'));

      const { result } = renderHook(() => useScreenShare());

      await act(async () => {
        // Should not throw error despite replaceTrack failure
        await result.current.startScreenShare();
      });

      expect(result.current.isSharing).toBe(true); // Still sharing despite partial failure
    });
  });

  describe('Socket.IO Integration', () => {
    it('should send screen share start events', async () => {
      // SOCKET-001: 画面共有開始通知
      const { result } = renderHook(() => useScreenShare());

      await act(async () => {
        await result.current.startScreenShare();
      });

      expect(mockSocketEmit).toHaveBeenCalledWith('screen-share-started', {
        userId: expect.any(String),
        timestamp: expect.any(Number),
      });
    });

    it('should send screen share stop events', async () => {
      // SOCKET-002: 画面共有停止通知
      const { result } = renderHook(() => useScreenShare());

      await act(async () => {
        await result.current.startScreenShare();
      });

      await act(async () => {
        await result.current.stopScreenShare();
      });

      expect(mockSocketEmit).toHaveBeenCalledWith('screen-share-stopped', {
        userId: expect.any(String),
        timestamp: expect.any(Number),
      });
    });

    it('should handle participant screen share start', async () => {
      // SOCKET-003: 他参加者の画面共有開始受信
      const { result } = renderHook(() => useScreenShare());

      await act(async () => {
        const mockEventHandler = mockSocketOn.mock.calls.find(
          (call) => call[0] === 'participant-screen-share-started'
        )?.[1];

        if (mockEventHandler) {
          mockEventHandler({ userId: 'other-user' });
        }
      });

      expect(result.current.sharingUserId).toBe('other-user');
    });

    it('should handle participant screen share stop', async () => {
      // SOCKET-004: 他参加者の画面共有停止受信
      const { result } = renderHook(() => useScreenShare());

      // First set sharing user
      await act(async () => {
        const mockEventHandler = mockSocketOn.mock.calls.find(
          (call) => call[0] === 'participant-screen-share-started'
        )?.[1];

        if (mockEventHandler) {
          mockEventHandler({ userId: 'other-user' });
        }
      });

      // Then stop sharing
      await act(async () => {
        const mockEventHandler = mockSocketOn.mock.calls.find(
          (call) => call[0] === 'participant-screen-share-stopped'
        )?.[1];

        if (mockEventHandler) {
          mockEventHandler({ userId: 'other-user' });
        }
      });

      expect(result.current.sharingUserId).toBeNull();
      expect(result.current.sharedScreenStream).toBeNull();
    });

    it('should setup event listeners', () => {
      renderHook(() => useScreenShare());

      expect(mockSocketOn).toHaveBeenCalledWith(
        'participant-screen-share-started',
        expect.any(Function)
      );
      expect(mockSocketOn).toHaveBeenCalledWith(
        'participant-screen-share-stopped',
        expect.any(Function)
      );
      expect(mockSocketOn).toHaveBeenCalledWith(
        'screen-share-request-denied',
        expect.any(Function)
      );
    });

    it('should cleanup event listeners on unmount', () => {
      const { unmount } = renderHook(() => useScreenShare());

      unmount();

      expect(mockSocketOff).toHaveBeenCalledWith('participant-screen-share-started');
      expect(mockSocketOff).toHaveBeenCalledWith('participant-screen-share-stopped');
      expect(mockSocketOff).toHaveBeenCalledWith('screen-share-request-denied');
    });
  });

  describe('Error Handling', () => {
    it('should handle screen share permission denial', async () => {
      // ERROR-001: 画面共有許可拒否
      const error = new Error('Permission denied');
      mockGetDisplayMedia.mockRejectedValue(error);

      const { result } = renderHook(() => useScreenShare());

      await act(async () => {
        await expect(result.current.startScreenShare()).rejects.toThrow('Permission denied');
      });

      expect(result.current.isSharing).toBe(false);
      expect(result.current.screenStream).toBeNull();
    });

    it('should handle getDisplayMedia API unavailable', async () => {
      // ERROR-002: getDisplayMedia API未対応
      const originalGetDisplayMedia = (
        globalThis as typeof globalThis & {
          navigator: { mediaDevices: { getDisplayMedia: typeof mockGetDisplayMedia } };
        }
      ).navigator.mediaDevices.getDisplayMedia;
      Object.defineProperty(globalThis.navigator.mediaDevices, 'getDisplayMedia', {
        value: undefined,
        writable: true,
      });

      const { result } = renderHook(() => useScreenShare());

      await act(async () => {
        await expect(result.current.startScreenShare()).rejects.toThrow();
      });

      expect(result.current.isSharing).toBe(false);

      // Restore original mock
      Object.defineProperty(globalThis.navigator.mediaDevices, 'getDisplayMedia', {
        value: originalGetDisplayMedia,
        writable: true,
      });
    });

    it('should handle WebRTC not initialized error', async () => {
      // ERROR-003: PeerConnection未初期化エラー
      const originalPeers = mockUseWebRTC.peers;
      mockUseWebRTC.peers = new Map(); // No peer connections
      mockGetDisplayMedia.mockClear();
      mockGetDisplayMedia.mockResolvedValue(mockScreenStream);

      const { result } = renderHook(() => useScreenShare());

      await act(async () => {
        await result.current.startScreenShare();
      });

      // Should still work even without peer connections
      expect(result.current.isSharing).toBe(true);

      // Restore original peers
      mockUseWebRTC.peers = originalPeers;
    });

    it('should handle concurrent sharing attempt', async () => {
      // ERROR-005: 同時共有試行エラー
      const { result } = renderHook(() => useScreenShare());

      // Set another user as sharing
      await act(async () => {
        const mockEventHandler = mockSocketOn.mock.calls.find(
          (call) => call[0] === 'participant-screen-share-started'
        )?.[1];

        if (mockEventHandler) {
          mockEventHandler({ userId: 'other-user' });
        }
      });

      await act(async () => {
        await expect(result.current.startScreenShare()).rejects.toThrow();
      });

      expect(result.current.isSharing).toBe(false);
    });
  });

  describe('Performance', () => {
    it('should not create duplicate operations', async () => {
      const { result } = renderHook(() => useScreenShare());

      // Try multiple rapid starts
      await act(async () => {
        await Promise.all([
          result.current.startScreenShare(),
          result.current.startScreenShare(),
          result.current.startScreenShare(),
        ]);
      });

      // Should only call getDisplayMedia once
      expect(mockGetDisplayMedia).toHaveBeenCalledTimes(1);
    });

    it('should cleanup properly to prevent memory leaks', async () => {
      mockGetDisplayMedia.mockClear();
      mockGetDisplayMedia.mockResolvedValue(mockScreenStream);

      const { result, unmount } = renderHook(() => useScreenShare());

      await act(async () => {
        await result.current.startScreenShare();
      });

      unmount();

      expect(mockVideoTrack.stop).toHaveBeenCalled();
    });
  });
});
