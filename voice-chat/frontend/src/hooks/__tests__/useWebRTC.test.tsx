import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWebRTC } from '../useWebRTC'

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

// Mock getUserMedia
const mockGetUserMedia = vi.fn()
const mockMediaStream = {
  getTracks: () => [
    {
      kind: 'audio',
      stop: vi.fn(),
      enabled: true
    }
  ],
  getAudioTracks: () => [
    {
      kind: 'audio',
      stop: vi.fn(),
      enabled: true
    }
  ]
} as any

// Mock WebRTC APIs
const mockCreateOffer = vi.fn()
const mockCreateAnswer = vi.fn()
const mockSetLocalDescription = vi.fn()
const mockSetRemoteDescription = vi.fn()
const mockAddIceCandidate = vi.fn()
const mockClose = vi.fn()
const mockAddTrack = vi.fn()

const mockRTCPeerConnection = vi.fn().mockImplementation(() => ({
  createOffer: mockCreateOffer,
  createAnswer: mockCreateAnswer,
  setLocalDescription: mockSetLocalDescription,
  setRemoteDescription: mockSetRemoteDescription,
  addIceCandidate: mockAddIceCandidate,
  addTrack: mockAddTrack,
  close: mockClose,
  connectionState: 'new',
  onicecandidate: null,
  ontrack: null,
  onconnectionstatechange: null,
  getTransceivers: vi.fn(() => [])
}))

// Setup global mocks
beforeEach(() => {
  global.RTCPeerConnection = mockRTCPeerConnection as any
  global.navigator.mediaDevices = {
    getUserMedia: mockGetUserMedia
  } as any
  
  // Mock MediaStream
  global.MediaStream = vi.fn().mockImplementation(() => ({
    getTracks: vi.fn(() => []),
    getAudioTracks: vi.fn(() => []),
    getVideoTracks: vi.fn(() => [])
  })) as any
  
  mockGetUserMedia.mockResolvedValue(mockMediaStream)
  vi.clearAllMocks()
})

// Mock the socket context
vi.mock('../useSocketConnection', () => ({
  useSocketConnection: () => ({
    socket: mockSocket,
    isConnected: true,
    error: null
  })
}))

describe('useWebRTC', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Hook Initialization', () => {
    it('should initialize with correct default values', () => {
      // HOOK-001: フック初期化
      const { result } = renderHook(() => useWebRTC())

      expect(result.current.peers.size).toBe(0)
      expect(result.current.localStream).toBeNull()
      expect(Object.keys(result.current.connectionStatus)).toHaveLength(0)
      expect(result.current.remoteStreams.size).toBe(0)
    })

    it('should initialize media stream on mount', async () => {
      // HOOK-002: メディアストリーム取得
      const { result } = renderHook(() => useWebRTC())

      await act(async () => {
        // Wait for initial media stream setup
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      expect(mockGetUserMedia).toHaveBeenCalledWith({
        video: false,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })
    })
  })

  describe('Connection Management', () => {
    it('should initialize peer connection', async () => {
      // HOOK-003: ピア接続初期化
      const { result } = renderHook(() => useWebRTC())
      const userId = 'user123'

      await act(async () => {
        await result.current.initializeConnection(userId)
      })

      expect(result.current.peers.has(userId)).toBe(true)
      expect(result.current.connectionStatus[userId]).toBeDefined()
    })

    it('should handle remote stream addition', async () => {
      // HOOK-004: リモートストリーム追加
      const { result } = renderHook(() => useWebRTC())
      const userId = 'user123'

      await act(async () => {
        await result.current.initializeConnection(userId)
      })

      // Get the peer connection to trigger ontrack event
      const peerConnection = result.current.peers.get(userId)
      expect(peerConnection).toBeDefined()

      // Simulate remote stream
      const remoteStream = new MediaStream()
      const track = mockMediaStream.getAudioTracks()[0]

      await act(async () => {
        if (peerConnection?.ontrack) {
          peerConnection.ontrack({
            streams: [remoteStream],
            track
          } as RTCTrackEvent)
        }
      })

      expect(result.current.remoteStreams.has(userId)).toBe(true)
    })
  })

  describe('State Updates', () => {
    it('should update connection status', async () => {
      // HOOK-005: 接続状態更新
      const { result } = renderHook(() => useWebRTC())
      const userId = 'user123'

      await act(async () => {
        await result.current.initializeConnection(userId)
      })

      const peerConnection = result.current.peers.get(userId)
      
      await act(async () => {
        // Simulate connection state change
        if (peerConnection) {
          (peerConnection as any).connectionState = 'connected'
          if (peerConnection.onconnectionstatechange) {
            peerConnection.onconnectionstatechange({} as Event)
          }
        }
      })

      expect(result.current.connectionStatus[userId]).toBe('connected')
    })

    it('should cleanup resources', async () => {
      // HOOK-006: クリーンアップ処理
      const { result } = renderHook(() => useWebRTC())
      const userId = 'user123'

      await act(async () => {
        await result.current.initializeConnection(userId)
      })

      expect(result.current.peers.has(userId)).toBe(true)

      await act(async () => {
        result.current.cleanup(userId)
      })

      expect(result.current.peers.has(userId)).toBe(false)
      expect(result.current.remoteStreams.has(userId)).toBe(false)
      expect(mockClose).toHaveBeenCalled()
    })
  })

  describe('WebRTC Operations', () => {
    it('should create offer', async () => {
      const { result } = renderHook(() => useWebRTC())
      const userId = 'user123'
      const mockOffer = { type: 'offer', sdp: 'mock-sdp' } as RTCSessionDescriptionInit

      mockCreateOffer.mockResolvedValue(mockOffer)

      // Wait for initialization and then initialize connection
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0))
        await result.current.initializeConnection(userId)
      })

      let offer: RTCSessionDescriptionInit | undefined
      await act(async () => {
        offer = await result.current.createOffer(userId)
      })

      expect(offer).toEqual(mockOffer)
      expect(mockCreateOffer).toHaveBeenCalled()
    })

    it('should handle offer and create answer', async () => {
      const { result } = renderHook(() => useWebRTC())
      const userId = 'user123'
      const mockOffer = { type: 'offer', sdp: 'remote-sdp' } as RTCSessionDescriptionInit
      const mockAnswer = { type: 'answer', sdp: 'local-sdp' } as RTCSessionDescriptionInit

      mockCreateAnswer.mockResolvedValue(mockAnswer)

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0))
        await result.current.initializeConnection(userId)
      })

      let answer: RTCSessionDescriptionInit | undefined
      await act(async () => {
        answer = await result.current.handleOffer(userId, mockOffer)
      })

      expect(answer).toEqual(mockAnswer)
      expect(mockSetRemoteDescription).toHaveBeenCalledWith(mockOffer)
      expect(mockCreateAnswer).toHaveBeenCalled()
    })

    it('should handle answer', async () => {
      const { result } = renderHook(() => useWebRTC())
      const userId = 'user123'
      const mockAnswer = { type: 'answer', sdp: 'remote-sdp' } as RTCSessionDescriptionInit

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0))
        await result.current.initializeConnection(userId)
      })

      await act(async () => {
        await result.current.handleAnswer(userId, mockAnswer)
      })

      expect(mockSetRemoteDescription).toHaveBeenCalledWith(mockAnswer)
    })

    it('should add ICE candidate', async () => {
      const { result } = renderHook(() => useWebRTC())
      const userId = 'user123'
      const mockCandidate = {
        candidate: 'candidate:mock',
        sdpMid: '0',
        sdpMLineIndex: 0
      } as RTCIceCandidate

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0))
        await result.current.initializeConnection(userId)
      })

      await act(async () => {
        await result.current.addIceCandidate(userId, mockCandidate)
      })

      expect(mockAddIceCandidate).toHaveBeenCalledWith(mockCandidate)
    })
  })

  describe('Error Handling', () => {
    it('should handle getUserMedia failure', async () => {
      const error = new Error('Permission denied')
      mockGetUserMedia.mockRejectedValue(error)

      const { result } = renderHook(() => useWebRTC())

      await act(async () => {
        // Wait for initialization
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      expect(result.current.localStream).toBeNull()
    })

    it('should handle WebRTC operation failures', async () => {
      const { result } = renderHook(() => useWebRTC())
      const userId = 'user123'
      const error = new Error('WebRTC operation failed')

      mockCreateOffer.mockRejectedValue(error)

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0))
        await result.current.initializeConnection(userId)
      })

      await act(async () => {
        await expect(result.current.createOffer(userId)).rejects.toThrow('WebRTC operation failed')
      })
    })

    it('should handle operations on non-existent peers', async () => {
      const { result } = renderHook(() => useWebRTC())
      const nonExistentUserId = 'nonexistent'

      await act(async () => {
        await expect(result.current.createOffer(nonExistentUserId)).rejects.toThrow()
        await expect(result.current.handleOffer(nonExistentUserId, {} as RTCSessionDescriptionInit)).rejects.toThrow()
        await expect(result.current.handleAnswer(nonExistentUserId, {} as RTCSessionDescriptionInit)).rejects.toThrow()
        await expect(result.current.addIceCandidate(nonExistentUserId, {} as RTCIceCandidate)).rejects.toThrow()
      })
    })
  })

  describe('Socket.IO Integration', () => {
    it('should setup Socket.IO event listeners', () => {
      renderHook(() => useWebRTC())

      expect(mockSocketOn).toHaveBeenCalledWith('webrtc-offer', expect.any(Function))
      expect(mockSocketOn).toHaveBeenCalledWith('webrtc-answer', expect.any(Function))
      expect(mockSocketOn).toHaveBeenCalledWith('ice-candidate', expect.any(Function))
    })

    it('should cleanup Socket.IO event listeners on unmount', () => {
      const { unmount } = renderHook(() => useWebRTC())

      unmount()

      expect(mockSocketOff).toHaveBeenCalledWith('webrtc-offer')
      expect(mockSocketOff).toHaveBeenCalledWith('webrtc-answer')
      expect(mockSocketOff).toHaveBeenCalledWith('ice-candidate')
    })
  })

  describe('Performance', () => {
    it('should not create duplicate connections', async () => {
      const { result } = renderHook(() => useWebRTC())
      const userId = 'user123'

      await act(async () => {
        await result.current.initializeConnection(userId)
        await result.current.initializeConnection(userId) // Try to add same user again
      })

      expect(result.current.peers.size).toBe(1)
    })

    it('should cleanup properly to prevent memory leaks', async () => {
      const { result, unmount } = renderHook(() => useWebRTC())
      const userId = 'user123'

      await act(async () => {
        await result.current.initializeConnection(userId)
      })

      unmount()

      expect(mockClose).toHaveBeenCalled()
    })
  })
})