import { useState, useEffect, useCallback, useRef } from 'react'
import { useWebRTC } from './useWebRTC'
import { useSocketConnection } from './useSocketConnection'

export type AudioQuality = 'low' | 'medium' | 'high'

export interface UseAudioControlsReturn {
  // 状態
  isMuted: boolean
  isLoading: boolean
  participantMuteStates: Record<string, boolean>
  
  // 制御関数
  toggleMute: () => Promise<void>
  setMuted: (muted: boolean) => Promise<void>
  setAudioQuality: (quality: AudioQuality) => Promise<void>
}

export const useAudioControls = (): UseAudioControlsReturn => {
  const { localStream } = useWebRTC()
  const { socket } = useSocketConnection()
  
  const [isMuted, setIsMutedState] = useState(() => {
    // Restore from localStorage
    const saved = localStorage.getItem('voice-chat-muted')
    return saved === 'true'
  })
  
  const [isLoading, setIsLoading] = useState(false)
  const [participantMuteStates, setParticipantMuteStates] = useState<Record<string, boolean>>({})
  
  const currentMuteState = useRef(isMuted)

  // Update ref when state changes
  useEffect(() => {
    currentMuteState.current = isMuted
  }, [isMuted])

  // Apply initial mute state to audio tracks
  useEffect(() => {
    if (localStream && currentMuteState.current) {
      const audioTracks = localStream.getAudioTracks()
      audioTracks.forEach(track => {
        track.enabled = false
      })
    }
  }, [localStream])

  // Persist mute state to localStorage
  useEffect(() => {
    localStorage.setItem('voice-chat-muted', isMuted.toString())
  }, [isMuted])

  // Socket.IO event listeners
  useEffect(() => {
    if (!socket) return

    const handleParticipantMuteChanged = (data: { userId: string; isMuted: boolean }) => {
      setParticipantMuteStates(prev => ({
        ...prev,
        [data.userId]: data.isMuted
      }))
    }

    const handleParticipantsUpdated = (participants: Array<{ userId: string; isMuted: boolean }>) => {
      const newStates: Record<string, boolean> = {}
      participants.forEach(participant => {
        newStates[participant.userId] = participant.isMuted
      })
      setParticipantMuteStates(newStates)
    }

    socket.on('participant-mute-changed', handleParticipantMuteChanged)
    socket.on('participants-updated', handleParticipantsUpdated)

    return () => {
      socket.off('participant-mute-changed', handleParticipantMuteChanged)
      socket.off('participants-updated', handleParticipantsUpdated)
    }
  }, [socket])

  const updateAudioTracks = useCallback((muted: boolean) => {
    if (!localStream) {
      throw new Error('No local stream available')
    }

    const audioTracks = localStream.getAudioTracks()
    if (audioTracks.length === 0) {
      throw new Error('No audio tracks available')
    }

    audioTracks.forEach(track => {
      track.enabled = !muted
    })
  }, [localStream])

  const notifyMuteChange = useCallback((muted: boolean) => {
    if (socket && socket.connected) {
      socket.emit('audio-mute-changed', {
        isMuted: muted,
        timestamp: Date.now()
      })
    }
  }, [socket])

  const setMuted = useCallback(async (muted: boolean): Promise<void> => {
    if (isLoading) return
    if (currentMuteState.current === muted) return

    setIsLoading(true)

    try {
      // Update audio tracks first
      updateAudioTracks(muted)
      
      // Update state
      setIsMutedState(muted)
      
      // Notify other participants
      notifyMuteChange(muted)
      
    } catch (error) {
      console.error('Failed to change mute state:', error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, updateAudioTracks, notifyMuteChange])

  const toggleMute = useCallback(async (): Promise<void> => {
    await setMuted(!currentMuteState.current)
  }, [setMuted])

  const setAudioQuality = useCallback(async (quality: AudioQuality): Promise<void> => {
    const validQualities: AudioQuality[] = ['low', 'medium', 'high']
    
    if (!validQualities.includes(quality)) {
      throw new Error(`Invalid audio quality: ${quality}`)
    }

    if (socket && socket.connected) {
      socket.emit('audio-quality-changed', {
        quality
      })
    }
  }, [socket])

  return {
    isMuted,
    isLoading,
    participantMuteStates,
    toggleMute,
    setMuted,
    setAudioQuality
  }
}