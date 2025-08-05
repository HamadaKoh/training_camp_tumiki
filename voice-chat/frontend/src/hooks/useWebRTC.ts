import { useState, useEffect, useCallback, useRef } from 'react'
import { PeerConnectionManager } from '../webrtc/PeerConnectionManager'
import { useSocketConnection } from './useSocketConnection'

export interface UseWebRTCReturn {
  peers: Map<string, RTCPeerConnection>
  connectionStatus: Record<string, RTCPeerConnectionState>
  localStream: MediaStream | null
  remoteStreams: Map<string, MediaStream>
  initializeConnection: (userId: string) => Promise<void>
  createOffer: (userId: string) => Promise<RTCSessionDescriptionInit>
  handleAnswer: (userId: string, answer: RTCSessionDescriptionInit) => Promise<void>
  handleOffer: (userId: string, offer: RTCSessionDescriptionInit) => Promise<RTCSessionDescriptionInit>
  addIceCandidate: (userId: string, candidate: RTCIceCandidate) => Promise<void>
  cleanup: (userId?: string) => void
}

export const useWebRTC = (): UseWebRTCReturn => {
  const { socket } = useSocketConnection()
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map())
  const [connectionStatus, setConnectionStatus] = useState<Record<string, RTCPeerConnectionState>>({})
  
  const pcManagerRef = useRef<PeerConnectionManager | null>(null)
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map())

  // Initialize PeerConnectionManager when socket is available
  useEffect(() => {
    if (socket && !pcManagerRef.current) {
      pcManagerRef.current = new PeerConnectionManager(socket)
    }
  }, [socket])

  // Initialize media stream
  useEffect(() => {
    const initMediaStream = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        })
        setLocalStream(stream)
      } catch (error) {
        console.error('Failed to get media stream:', error)
        setLocalStream(null)
      }
    }

    initMediaStream()
  }, [])

  // Setup Socket.IO event listeners
  useEffect(() => {
    if (!socket) return

    const handleWebRTCOffer = async (data: { fromUserId: string; offer: RTCSessionDescriptionInit }) => {
      try {
        const answer = await handleOffer(data.fromUserId, data.offer)
        socket.emit('webrtc-answer', {
          targetUserId: data.fromUserId,
          answer
        })
      } catch (error) {
        console.error('Failed to handle WebRTC offer:', error)
      }
    }

    const handleWebRTCAnswer = async (data: { fromUserId: string; answer: RTCSessionDescriptionInit }) => {
      try {
        await handleAnswer(data.fromUserId, data.answer)
      } catch (error) {
        console.error('Failed to handle WebRTC answer:', error)
      }
    }

    const handleIceCandidate = async (data: { fromUserId: string; candidate: RTCIceCandidate }) => {
      try {
        await addIceCandidate(data.fromUserId, data.candidate)
      } catch (error) {
        console.error('Failed to handle ICE candidate:', error)
      }
    }

    socket.on('webrtc-offer', handleWebRTCOffer)
    socket.on('webrtc-answer', handleWebRTCAnswer)
    socket.on('ice-candidate', handleIceCandidate)

    return () => {
      socket.off('webrtc-offer')
      socket.off('webrtc-answer')
      socket.off('ice-candidate')
    }
  }, [socket])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pcManagerRef.current) {
        pcManagerRef.current.cleanup()
      }
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop())
      }
    }
  }, [localStream])

  const initializeConnection = useCallback(async (userId: string) => {
    if (!pcManagerRef.current) {
      throw new Error('PeerConnectionManager not initialized')
    }

    await pcManagerRef.current.initializeConnection(userId)
    
    // Get the peer connection and set up additional event handlers
    const peers = pcManagerRef.current.getPeers()
    const peerConnection = peers.get(userId)
    
    if (peerConnection) {
      // Add local stream tracks
      if (localStream) {
        localStream.getTracks().forEach(track => {
          peerConnection.addTrack(track, localStream)
        })
      }

      // Handle remote stream
      peerConnection.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          setRemoteStreams(prev => {
            const newMap = new Map(prev)
            newMap.set(userId, event.streams[0])
            return newMap
          })
        }
      }

      // Handle connection state changes
      peerConnection.onconnectionstatechange = () => {
        setConnectionStatus(prev => ({
          ...prev,
          [userId]: peerConnection.connectionState
        }))
      }

      // Update local peers reference
      peersRef.current.set(userId, peerConnection)
    }

    // Update connection status
    const status = pcManagerRef.current.getConnectionStatus()
    setConnectionStatus(status)
  }, [localStream])

  const createOffer = useCallback(async (userId: string): Promise<RTCSessionDescriptionInit> => {
    if (!pcManagerRef.current) {
      throw new Error('PeerConnectionManager not initialized')
    }
    return await pcManagerRef.current.createOffer(userId)
  }, [])

  const handleOffer = useCallback(async (userId: string, offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> => {
    if (!pcManagerRef.current) {
      throw new Error('PeerConnectionManager not initialized')
    }
    return await pcManagerRef.current.handleOffer(userId, offer)
  }, [])

  const handleAnswer = useCallback(async (userId: string, answer: RTCSessionDescriptionInit): Promise<void> => {
    if (!pcManagerRef.current) {
      throw new Error('PeerConnectionManager not initialized')
    }
    await pcManagerRef.current.handleAnswer(userId, answer)
  }, [])

  const addIceCandidate = useCallback(async (userId: string, candidate: RTCIceCandidate): Promise<void> => {
    if (!pcManagerRef.current) {
      throw new Error('PeerConnectionManager not initialized')
    }
    await pcManagerRef.current.addIceCandidate(userId, candidate)
  }, [])

  const cleanup = useCallback((userId?: string) => {
    if (pcManagerRef.current) {
      pcManagerRef.current.cleanup(userId)
    }

    if (userId) {
      // Remove from local state
      setRemoteStreams(prev => {
        const newMap = new Map(prev)
        newMap.delete(userId)
        return newMap
      })
      
      setConnectionStatus(prev => {
        const newStatus = { ...prev }
        delete newStatus[userId]
        return newStatus
      })

      peersRef.current.delete(userId)
    } else {
      // Clear all
      setRemoteStreams(new Map())
      setConnectionStatus({})
      peersRef.current.clear()
    }
  }, [])

  return {
    peers: peersRef.current,
    connectionStatus,
    localStream,
    remoteStreams,
    initializeConnection,
    createOffer,
    handleAnswer,
    handleOffer,
    addIceCandidate,
    cleanup
  }
}