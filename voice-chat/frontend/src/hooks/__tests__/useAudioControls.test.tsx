import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAudioControls } from '../useAudioControls'

// Mock Socket.IO
const mockSocketEmit = vi.fn()
const mockSocketOn = vi.fn()
const mockSocketOff = vi.fn()

const mockSocket = {
  emit: mockSocketEmit,
  on: mockSocketOn,
  off: mockSocketOff,
  connected: true
}

// Mock Audio Track
const mockAudioTrack = {
  enabled: true,
  kind: 'audio' as const,
  stop: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn()
}

// Mock MediaStream
const mockMediaStream = {
  getAudioTracks: vi.fn(() => [mockAudioTrack]),
  getTracks: vi.fn(() => [mockAudioTrack])
}

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn()
}

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
  cleanup: vi.fn()
}

// Mock useSocketConnection
const mockUseSocketConnection = {
  socket: mockSocket,
  isConnected: true,
  error: null
}

beforeEach(() => {
  global.localStorage = mockLocalStorage as any
  vi.clearAllMocks()
  mockAudioTrack.enabled = true
})

// Mock the hooks
vi.mock('../useWebRTC', () => ({
  useWebRTC: () => mockUseWebRTC
}))

vi.mock('../useSocketConnection', () => ({
  useSocketConnection: () => mockUseSocketConnection
}))

describe('useAudioControls', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Hook Initialization', () => {
    it('should initialize with correct default values', () => {
      // AUDIO-001: useAudioControls初期化
      const { result } = renderHook(() => useAudioControls())

      expect(result.current.isMuted).toBe(false)
      expect(result.current.isLoading).toBe(false)
      expect(result.current.participantMuteStates).toEqual({})
    })

    it('should integrate with WebRTC', () => {
      // AUDIO-002: WebRTC統合確認
      renderHook(() => useAudioControls())

      expect(mockUseWebRTC.localStream).toBeDefined()
    })
  })

  describe('Mute Control', () => {
    it('should toggle mute state', async () => {
      // AUDIO-003: ミュート切り替え
      const { result } = renderHook(() => useAudioControls())

      await act(async () => {
        await result.current.toggleMute()
      })

      expect(result.current.isMuted).toBe(true)
      expect(mockAudioTrack.enabled).toBe(false)
      expect(mockSocketEmit).toHaveBeenCalledWith('audio-mute-changed', expect.objectContaining({
        isMuted: true,
        timestamp: expect.any(Number)
      }))
    })

    it('should unmute when toggling from muted state', async () => {
      // AUDIO-004: ミュート解除
      const { result } = renderHook(() => useAudioControls())

      // First mute
      await act(async () => {
        await result.current.toggleMute()
      })

      // Then unmute
      await act(async () => {
        await result.current.toggleMute()
      })

      expect(result.current.isMuted).toBe(false)
      expect(mockAudioTrack.enabled).toBe(true)
      expect(mockSocketEmit).toHaveBeenLastCalledWith('audio-mute-changed', expect.objectContaining({
        isMuted: false
      }))
    })

    it('should set mute state directly to true', async () => {
      // AUDIO-005: 直接ミュート設定
      const { result } = renderHook(() => useAudioControls())

      await act(async () => {
        await result.current.setMuted(true)
      })

      expect(result.current.isMuted).toBe(true)
      expect(mockAudioTrack.enabled).toBe(false)
    })

    it('should set mute state directly to false', async () => {
      // AUDIO-006: 直接ミュート解除設定
      const { result } = renderHook(() => useAudioControls())

      // First mute
      await act(async () => {
        await result.current.setMuted(true)
      })

      // Then unmute
      await act(async () => {
        await result.current.setMuted(false)
      })

      expect(result.current.isMuted).toBe(false)
      expect(mockAudioTrack.enabled).toBe(true)
    })
  })

  describe('Loading State Management', () => {
    it('should show loading state during mute operation', async () => {
      // AUDIO-007: ミュート操作中のローディング
      const { result } = renderHook(() => useAudioControls())

      let resolvePromise: (value: void) => void
      const delayedPromise = new Promise<void>((resolve) => {
        resolvePromise = resolve
      })

      // Mock a delayed operation
      mockSocketEmit.mockImplementation(() => delayedPromise)

      act(() => {
        result.current.toggleMute()
      })

      // Should be loading
      expect(result.current.isLoading).toBe(true)

      // Complete the operation
      await act(async () => {
        resolvePromise()
        await delayedPromise
      })

      // Should not be loading anymore
      expect(result.current.isLoading).toBe(false)
    })

    it('should prevent concurrent operations', async () => {
      // AUDIO-008: 同時操作の防止
      const { result } = renderHook(() => useAudioControls())

      // Start first operation
      const firstOperation = act(async () => {
        await result.current.toggleMute()
      })

      // Try second operation while first is in progress
      await act(async () => {
        await result.current.toggleMute()
      })

      await firstOperation

      // Only one mute operation should have occurred
      expect(mockSocketEmit).toHaveBeenCalledTimes(1)
    })
  })

  describe('Participant State Management', () => {
    it('should update participant mute state', async () => {
      // AUDIO-009: 参加者ミュート状態更新
      const { result } = renderHook(() => useAudioControls())

      // Simulate receiving participant mute state change
      const mockEventHandler = mockSocketOn.mock.calls.find(
        call => call[0] === 'participant-mute-changed'
      )?.[1]

      expect(mockEventHandler).toBeDefined()

      await act(async () => {
        mockEventHandler({
          userId: 'user123',
          isMuted: true
        })
      })

      expect(result.current.participantMuteStates['user123']).toBe(true)
    })

    it('should manage multiple participant states independently', async () => {
      // AUDIO-010: 複数参加者状態管理
      const { result } = renderHook(() => useAudioControls())

      const mockEventHandler = mockSocketOn.mock.calls.find(
        call => call[0] === 'participant-mute-changed'
      )?.[1]

      // Update multiple participants
      await act(async () => {
        mockEventHandler({ userId: 'user1', isMuted: true })
      })

      await act(async () => {
        mockEventHandler({ userId: 'user2', isMuted: false })
      })

      expect(result.current.participantMuteStates['user1']).toBe(true)
      expect(result.current.participantMuteStates['user2']).toBe(false)
    })
  })

  describe('Audio Track Control', () => {
    it('should get audio tracks from media stream', () => {
      // TRACK-001: 音声トラック取得
      renderHook(() => useAudioControls())

      expect(mockMediaStream.getAudioTracks).toHaveBeenCalled()
    })

    it('should enable audio track', async () => {
      // TRACK-002: 音声トラック有効化
      const { result } = renderHook(() => useAudioControls())

      await act(async () => {
        await result.current.setMuted(false)
      })

      expect(mockAudioTrack.enabled).toBe(true)
    })

    it('should disable audio track', async () => {
      // TRACK-003: 音声トラック無効化
      const { result } = renderHook(() => useAudioControls())

      await act(async () => {
        await result.current.setMuted(true)
      })

      expect(mockAudioTrack.enabled).toBe(false)
    })

    it('should handle missing audio tracks gracefully', async () => {
      // TRACK-004: 音声トラック未存在時の処理
      mockMediaStream.getAudioTracks.mockReturnValue([])
      
      const { result } = renderHook(() => useAudioControls())

      await act(async () => {
        await expect(result.current.toggleMute()).rejects.toThrow()
      })

      // Application should not crash
      expect(result.current.isMuted).toBe(false)
    })
  })

  describe('Audio Quality Control', () => {
    it('should set audio quality', async () => {
      // QUALITY-001: 音声品質設定
      const { result } = renderHook(() => useAudioControls())

      await act(async () => {
        await result.current.setAudioQuality('high')
      })

      expect(mockSocketEmit).toHaveBeenCalledWith('audio-quality-changed', expect.objectContaining({
        quality: 'high'
      }))
    })

    it('should handle invalid audio quality gracefully', async () => {
      // QUALITY-002: 無効な品質設定
      const { result } = renderHook(() => useAudioControls())

      await act(async () => {
        await expect(result.current.setAudioQuality('invalid' as any)).rejects.toThrow()
      })

      // Should not crash the application
      expect(result.current.isLoading).toBe(false)
    })
  })

  describe('Socket.IO Integration', () => {
    it('should send mute change events', async () => {
      // SOCKET-001: ミュート状態変更通知
      const { result } = renderHook(() => useAudioControls())

      await act(async () => {
        await result.current.toggleMute()
      })

      expect(mockSocketEmit).toHaveBeenCalledWith('audio-mute-changed', {
        isMuted: true,
        timestamp: expect.any(Number)
      })
    })

    it('should send audio quality change events', async () => {
      // SOCKET-002: 音声品質変更通知
      const { result } = renderHook(() => useAudioControls())

      await act(async () => {
        await result.current.setAudioQuality('medium')
      })

      expect(mockSocketEmit).toHaveBeenCalledWith('audio-quality-changed', {
        quality: 'medium'
      })
    })

    it('should setup event listeners', () => {
      // SOCKET-003: イベントリスナー設定
      renderHook(() => useAudioControls())

      expect(mockSocketOn).toHaveBeenCalledWith('participant-mute-changed', expect.any(Function))
      expect(mockSocketOn).toHaveBeenCalledWith('participants-updated', expect.any(Function))
    })

    it('should cleanup event listeners on unmount', () => {
      // SOCKET-004: イベントリスナークリーンアップ
      const { unmount } = renderHook(() => useAudioControls())

      unmount()

      expect(mockSocketOff).toHaveBeenCalledWith('participant-mute-changed')
      expect(mockSocketOff).toHaveBeenCalledWith('participants-updated')
    })
  })

  describe('Error Handling', () => {
    it('should handle audio device busy error', async () => {
      // ERROR-001: 音声デバイス使用中エラー
      const error = new Error('Device busy')
      mockAudioTrack.enabled = false
      Object.defineProperty(mockAudioTrack, 'enabled', {
        set: vi.fn(() => { throw error }),
        configurable: true
      })

      const { result } = renderHook(() => useAudioControls())

      await act(async () => {
        await expect(result.current.setMuted(false)).rejects.toThrow('Device busy')
      })

      // State should remain consistent
      expect(result.current.isMuted).toBe(false)
    })

    it('should handle WebRTC not initialized error', async () => {
      // ERROR-003: PeerConnection未初期化エラー
      mockUseWebRTC.localStream = null

      const { result } = renderHook(() => useAudioControls())

      await act(async () => {
        await expect(result.current.toggleMute()).rejects.toThrow()
      })

      expect(result.current.isMuted).toBe(false)
    })

    it('should handle Socket.IO disconnection gracefully', async () => {
      // ERROR-005: Socket.IO切断エラー
      mockUseSocketConnection.isConnected = false

      const { result } = renderHook(() => useAudioControls())

      await act(async () => {
        await result.current.toggleMute()
      })

      // Local state should still update
      expect(result.current.isMuted).toBe(true)
      expect(mockAudioTrack.enabled).toBe(false)
    })
  })

  describe('Performance', () => {
    it('should not create duplicate event listeners', () => {
      // PERF-003: 重複イベントリスナー防止
      const { rerender } = renderHook(() => useAudioControls())

      const initialCallCount = mockSocketOn.mock.calls.length

      rerender()

      // Should not add more listeners
      expect(mockSocketOn.mock.calls.length).toBe(initialCallCount)
    })

    it('should prevent unnecessary socket emissions', async () => {
      // PERF-004: 不要な通信防止
      const { result } = renderHook(() => useAudioControls())

      // Mute to true
      await act(async () => {
        await result.current.setMuted(true)
      })

      const callCount = mockSocketEmit.mock.calls.length

      // Try to set to same state
      await act(async () => {
        await result.current.setMuted(true)
      })

      // Should not emit additional events
      expect(mockSocketEmit.mock.calls.length).toBe(callCount)
    })
  })

  describe('Local Storage Integration', () => {
    it('should persist mute state to localStorage', async () => {
      const { result } = renderHook(() => useAudioControls())

      await act(async () => {
        await result.current.setMuted(true)
      })

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('voice-chat-muted', 'true')
    })

    it('should restore mute state from localStorage', () => {
      mockLocalStorage.getItem.mockReturnValue('true')

      const { result } = renderHook(() => useAudioControls())

      expect(result.current.isMuted).toBe(true)
    })
  })
})