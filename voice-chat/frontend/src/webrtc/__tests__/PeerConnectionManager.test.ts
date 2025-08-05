import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PeerConnectionManager } from '../PeerConnectionManager'

// Mock WebRTC APIs
const mockCreateOffer = vi.fn()
const mockCreateAnswer = vi.fn()
const mockSetLocalDescription = vi.fn()
const mockSetRemoteDescription = vi.fn()
const mockAddIceCandidate = vi.fn()
const mockClose = vi.fn()

const mockRTCPeerConnection = vi.fn().mockImplementation(() => ({
  createOffer: mockCreateOffer,
  createAnswer: mockCreateAnswer,
  setLocalDescription: mockSetLocalDescription,
  setRemoteDescription: mockSetRemoteDescription,
  addIceCandidate: mockAddIceCandidate,
  close: mockClose,
  connectionState: 'new',
  onicecandidate: null,
  ontrack: null,
  onconnectionstatechange: null,
  addTrack: vi.fn(),
  getTransceivers: vi.fn(() => [])
}))

// Mock Socket.IO
const mockSocketEmit = vi.fn()
const mockSocket = {
  emit: mockSocketEmit,
  on: vi.fn(),
  off: vi.fn()
}

// Setup global mocks
beforeEach(() => {
  global.RTCPeerConnection = mockRTCPeerConnection as any
  vi.clearAllMocks()
})

describe('PeerConnectionManager', () => {
  let pcManager: PeerConnectionManager

  beforeEach(() => {
    pcManager = new PeerConnectionManager(mockSocket as any)
  })

  afterEach(() => {
    pcManager.cleanup()
  })

  describe('Initialization', () => {
    it('should create PeerConnectionManager instance', () => {
      // PCM-001: PeerConnectionManager初期化
      expect(pcManager).toBeDefined()
      expect(pcManager.getPeers).toBeDefined()
      expect(pcManager.getConnectionStatus).toBeDefined()
    })

    it('should initialize with default ICE servers', () => {
      // PCM-002: デフォルト設定での初期化
      expect(mockRTCPeerConnection).not.toHaveBeenCalled() // No connections yet
      expect(pcManager.getPeers().size).toBe(0)
    })
  })

  describe('Connection Management', () => {
    it('should add new peer connection', async () => {
      // PCM-003: ピア接続の追加
      const userId = 'user123'
      
      await pcManager.initializeConnection(userId)
      
      expect(pcManager.getPeers().has(userId)).toBe(true)
      expect(mockRTCPeerConnection).toHaveBeenCalled()
    })

    it('should remove peer connection', () => {
      // PCM-004: ピア接続の削除
      const userId = 'user123'
      
      // First add connection
      pcManager.initializeConnection(userId)
      expect(pcManager.getPeers().has(userId)).toBe(true)
      
      // Then remove it
      pcManager.cleanup(userId)
      expect(pcManager.getPeers().has(userId)).toBe(false)
      expect(mockClose).toHaveBeenCalled()
    })

    it('should prevent duplicate peer connections', async () => {
      // PCM-005: 重複ピア接続の防止
      const userId = 'user123'
      
      await pcManager.initializeConnection(userId)
      const initialSize = pcManager.getPeers().size
      
      await pcManager.initializeConnection(userId) // Try to add same user again
      
      expect(pcManager.getPeers().size).toBe(initialSize)
    })
  })

  describe('Offer/Answer Processing', () => {
    it('should create offer', async () => {
      // PCM-006: Offer作成
      const userId = 'user123'
      const mockOffer = { type: 'offer', sdp: 'mock-sdp' } as RTCSessionDescriptionInit
      
      mockCreateOffer.mockResolvedValue(mockOffer)
      
      await pcManager.initializeConnection(userId)
      const offer = await pcManager.createOffer(userId)
      
      expect(mockCreateOffer).toHaveBeenCalled()
      expect(mockSetLocalDescription).toHaveBeenCalledWith(mockOffer)
      expect(offer).toEqual(mockOffer)
    })

    it('should handle offer and create answer', async () => {
      // PCM-007: Answer作成
      const userId = 'user123'
      const mockOffer = { type: 'offer', sdp: 'remote-sdp' } as RTCSessionDescriptionInit
      const mockAnswer = { type: 'answer', sdp: 'local-sdp' } as RTCSessionDescriptionInit
      
      mockCreateAnswer.mockResolvedValue(mockAnswer)
      
      await pcManager.initializeConnection(userId)
      const answer = await pcManager.handleOffer(userId, mockOffer)
      
      expect(mockSetRemoteDescription).toHaveBeenCalledWith(mockOffer)
      expect(mockCreateAnswer).toHaveBeenCalled()
      expect(mockSetLocalDescription).toHaveBeenCalledWith(mockAnswer)
      expect(answer).toEqual(mockAnswer)
    })

    it('should handle answer', async () => {
      // PCM-008: Remote SDP設定
      const userId = 'user123'
      const mockAnswer = { type: 'answer', sdp: 'remote-sdp' } as RTCSessionDescriptionInit
      
      await pcManager.initializeConnection(userId)
      await pcManager.handleAnswer(userId, mockAnswer)
      
      expect(mockSetRemoteDescription).toHaveBeenCalledWith(mockAnswer)
    })
  })

  describe('ICE Candidate Handling', () => {
    it('should add ICE candidate', async () => {
      // PCM-009: ICE候補追加
      const userId = 'user123'
      const mockCandidate = {
        candidate: 'candidate:mock',
        sdpMid: '0',
        sdpMLineIndex: 0
      } as RTCIceCandidate
      
      await pcManager.initializeConnection(userId)
      await pcManager.addIceCandidate(userId, mockCandidate)
      
      expect(mockAddIceCandidate).toHaveBeenCalledWith(mockCandidate)
    })

    it('should emit ICE candidate via socket', async () => {
      // PCM-010: ICE候補イベント処理
      const userId = 'user123'
      
      await pcManager.initializeConnection(userId)
      
      // Get the peer connection instance
      const peers = pcManager.getPeers()
      const peerConnection = peers.get(userId)
      
      // Simulate ICE candidate event
      const mockCandidate = {
        candidate: 'candidate:mock'
      } as RTCIceCandidate
      
      if (peerConnection?.onicecandidate) {
        peerConnection.onicecandidate({ candidate: mockCandidate } as RTCPeerConnectionIceEvent)
      }
      
      expect(mockSocketEmit).toHaveBeenCalledWith('ice-candidate', {
        targetUserId: userId,
        candidate: mockCandidate
      })
    })
  })

  describe('Connection Status Tracking', () => {
    it('should track connection status changes', async () => {
      // Connection status tracking
      const userId = 'user123'
      
      await pcManager.initializeConnection(userId)
      const status = pcManager.getConnectionStatus()
      
      expect(status[userId]).toBeDefined()
    })
  })

  describe('Error Handling', () => {
    it('should handle createOffer failure', async () => {
      // Error handling for offer creation
      const userId = 'user123'
      const error = new Error('Failed to create offer')
      
      mockCreateOffer.mockRejectedValue(error)
      
      await pcManager.initializeConnection(userId)
      
      await expect(pcManager.createOffer(userId)).rejects.toThrow('Failed to create offer')
    })

    it('should handle non-existent peer operations', async () => {
      // Handle operations on non-existent peers
      const nonExistentUserId = 'nonexistent'
      
      await expect(pcManager.createOffer(nonExistentUserId)).rejects.toThrow()
      await expect(pcManager.handleOffer(nonExistentUserId, {} as RTCSessionDescriptionInit)).rejects.toThrow()
      await expect(pcManager.handleAnswer(nonExistentUserId, {} as RTCSessionDescriptionInit)).rejects.toThrow()
      await expect(pcManager.addIceCandidate(nonExistentUserId, {} as RTCIceCandidate)).rejects.toThrow()
    })
  })

  describe('Cleanup', () => {
    it('should cleanup all connections', async () => {
      // Test cleanup of all connections
      const userIds = ['user1', 'user2', 'user3']
      
      // Add multiple connections
      for (const userId of userIds) {
        await pcManager.initializeConnection(userId)
      }
      
      expect(pcManager.getPeers().size).toBe(3)
      
      // Cleanup all
      pcManager.cleanup()
      
      expect(pcManager.getPeers().size).toBe(0)
      expect(mockClose).toHaveBeenCalledTimes(3)
    })

    it('should cleanup specific connection', async () => {
      // Test cleanup of specific connection
      const user1 = 'user1'
      const user2 = 'user2'
      
      await pcManager.initializeConnection(user1)
      await pcManager.initializeConnection(user2)
      
      expect(pcManager.getPeers().size).toBe(2)
      
      // Cleanup specific user
      pcManager.cleanup(user1)
      
      expect(pcManager.getPeers().size).toBe(1)
      expect(pcManager.getPeers().has(user1)).toBe(false)
      expect(pcManager.getPeers().has(user2)).toBe(true)
    })
  })
})