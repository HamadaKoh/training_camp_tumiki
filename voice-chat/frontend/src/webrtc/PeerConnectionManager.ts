import { Socket } from 'socket.io-client'

export interface PeerConnectionConfig {
  iceServers?: RTCIceServer[]
}

export class PeerConnectionManager {
  private peers: Map<string, RTCPeerConnection> = new Map()
  private connectionStatus: Record<string, RTCPeerConnectionState> = {}
  private socket: Socket
  private config: RTCConfiguration

  constructor(socket: Socket, config?: PeerConnectionConfig) {
    this.socket = socket
    this.config = {
      iceServers: config?.iceServers || [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 10
    }
  }

  getPeers(): Map<string, RTCPeerConnection> {
    return new Map(this.peers)
  }

  getConnectionStatus(): Record<string, RTCPeerConnectionState> {
    return { ...this.connectionStatus }
  }

  async initializeConnection(userId: string): Promise<void> {
    // Prevent duplicate connections
    if (this.peers.has(userId)) {
      return
    }

    const peerConnection = new RTCPeerConnection(this.config)
    
    // Set up event handlers
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('ice-candidate', {
          targetUserId: userId,
          candidate: event.candidate
        })
      }
    }

    peerConnection.onconnectionstatechange = () => {
      this.connectionStatus[userId] = peerConnection.connectionState
    }

    // Store the peer connection
    this.peers.set(userId, peerConnection)
    this.connectionStatus[userId] = peerConnection.connectionState
  }

  async createOffer(userId: string): Promise<RTCSessionDescriptionInit> {
    const peerConnection = this.peers.get(userId)
    if (!peerConnection) {
      throw new Error(`No peer connection found for user: ${userId}`)
    }

    const offer = await peerConnection.createOffer()
    await peerConnection.setLocalDescription(offer)
    return offer
  }

  async handleOffer(userId: string, offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    const peerConnection = this.peers.get(userId)
    if (!peerConnection) {
      throw new Error(`No peer connection found for user: ${userId}`)
    }

    await peerConnection.setRemoteDescription(offer)
    const answer = await peerConnection.createAnswer()
    await peerConnection.setLocalDescription(answer)
    return answer
  }

  async handleAnswer(userId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const peerConnection = this.peers.get(userId)
    if (!peerConnection) {
      throw new Error(`No peer connection found for user: ${userId}`)
    }

    await peerConnection.setRemoteDescription(answer)
  }

  async addIceCandidate(userId: string, candidate: RTCIceCandidate): Promise<void> {
    const peerConnection = this.peers.get(userId)
    if (!peerConnection) {
      throw new Error(`No peer connection found for user: ${userId}`)
    }

    await peerConnection.addIceCandidate(candidate)
  }

  cleanup(userId?: string): void {
    if (userId) {
      // Cleanup specific peer connection
      const peerConnection = this.peers.get(userId)
      if (peerConnection) {
        peerConnection.close()
        this.peers.delete(userId)
        delete this.connectionStatus[userId]
      }
    } else {
      // Cleanup all peer connections
      this.peers.forEach((peerConnection) => {
        peerConnection.close()
      })
      this.peers.clear()
      this.connectionStatus = {}
    }
  }
}