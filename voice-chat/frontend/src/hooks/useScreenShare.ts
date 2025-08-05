import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebRTC } from './useWebRTC';
import { useSocketConnection } from './useSocketConnection';
import { ScreenShareEvent, ScreenShareError } from '../types';

export interface UseScreenShareReturn {
  // 状態
  isSharing: boolean;
  isLoading: boolean;
  sharingParticipantId: string | null;
  screenStream: MediaStream | null;
  error: string | null;

  // 制御関数
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => Promise<void>;
  clearError: () => void;
}

export const useScreenShare = (roomId: string | null = null, participantId: string | null = null): UseScreenShareReturn => {
  const { peers, localStream } = useWebRTC();
  const { connectionState } = useSocketConnection();
  const socket = connectionState.socket;

  const [isSharing, setIsSharing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sharingParticipantId, setSharingParticipantId] = useState<string | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const operationInProgressRef = useRef(false);
  const originalVideoTracksRef = useRef<Map<string, MediaStreamTrack>>(new Map());

  // Socket.IO event listeners
  useEffect(() => {
    if (!socket) return;

    const handleScreenShareStarted = (event: ScreenShareEvent) => {
      console.log('Screen share started:', event);
      setSharingParticipantId(event.participantId);
      
      // If this is our own screen share, update local state
      if (event.participantId === participantId) {
        setIsSharing(true);
      }
    };

    const handleScreenShareStopped = (event: ScreenShareEvent) => {
      console.log('Screen share stopped:', event);
      
      // If this was our screen share or the currently sharing participant
      if (event.participantId === participantId) {
        setIsSharing(false);
        if (screenStream) {
          screenStream.getTracks().forEach(track => track.stop());
          setScreenStream(null);
        }
      }
      
      if (sharingParticipantId === event.participantId) {
        setSharingParticipantId(null);
      }
    };

    const handleScreenShareError = (error: ScreenShareError) => {
      console.error('Screen share error:', error);
      setError(error.message);
      setIsLoading(false);
      operationInProgressRef.current = false;
    };

    socket.on('screen-share-started', handleScreenShareStarted);
    socket.on('screen-share-stopped', handleScreenShareStopped);
    socket.on('screen-share-error', handleScreenShareError);

    return () => {
      socket.off('screen-share-started', handleScreenShareStarted);
      socket.off('screen-share-stopped', handleScreenShareStopped);
      socket.off('screen-share-error', handleScreenShareError);
    };
  }, [socket, sharingParticipantId, participantId, screenStream]);

  // Store original video tracks for restoration
  const storeOriginalVideoTracks = useCallback(() => {
    if (!localStream) return;

    peers.forEach((peerConnection, userId) => {
      const senders = peerConnection.getSenders();
      const videoSender = senders.find((sender) => sender.track && sender.track.kind === 'video');
      if (videoSender && videoSender.track) {
        originalVideoTracksRef.current.set(userId, videoSender.track);
      }
    });
  }, [peers, localStream]);

  // Replace video tracks in all peer connections
  const replaceVideoTracks = useCallback(
    async (newTrack: MediaStreamTrack | null) => {
      const replacePromises: Promise<void>[] = [];

      peers.forEach((peerConnection) => {
        const senders = peerConnection.getSenders();
        const videoSender = senders.find((sender) => sender.track && sender.track.kind === 'video');

        if (videoSender) {
          const promise = videoSender.replaceTrack(newTrack).catch((error) => {
            console.error('Failed to replace track:', error);
            // Continue with other connections even if one fails
          });
          replacePromises.push(promise);
        }
      });

      // Wait for all replacements to complete (or fail)
      await Promise.allSettled(replacePromises);
    },
    [peers]
  );

  // Restore original video tracks
  const restoreOriginalVideoTracks = useCallback(async () => {
    if (!localStream) return;

    const videoTracks = localStream.getVideoTracks();
    const originalTrack = videoTracks.length > 0 ? videoTracks[0] : null;

    await replaceVideoTracks(originalTrack);
    originalVideoTracksRef.current.clear();
  }, [localStream, replaceVideoTracks]);

  const startScreenShare = useCallback(async (): Promise<void> => {
    if (isLoading || operationInProgressRef.current || !roomId || !participantId) {
      return;
    }

    // Check if someone else is already sharing
    if (sharingParticipantId && sharingParticipantId !== participantId) {
      const errorMsg = `Screen sharing is already active by participant: ${sharingParticipantId}`;
      setError(errorMsg);
      throw new Error(errorMsg);
    }

    // Check if we're already sharing
    if (isSharing) return;

    // Check if getDisplayMedia is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      const errorMsg = 'Screen sharing is not supported by this browser';
      setError(errorMsg);
      throw new Error(errorMsg);
    }

    operationInProgressRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      // Get display media stream
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
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

      // Store original tracks before replacing
      storeOriginalVideoTracks();

      // Get the video track from the display stream
      const videoTracks = displayStream.getVideoTracks();
      if (videoTracks.length === 0) {
        throw new Error('No video track available in screen share stream');
      }

      const screenVideoTrack = videoTracks[0];

      // Set up track ended listener for automatic cleanup
      screenVideoTrack.onended = () => {
        // User stopped sharing through browser controls
        stopScreenShare().catch(console.error);
      };

      // Replace video tracks in all peer connections
      await replaceVideoTracks(screenVideoTrack);

      // Update local state
      setScreenStream(displayStream);

      // Send request to server
      if (socket && socket.connected) {
        socket.emit('request-screen-share', {
          roomId,
          participantId,
        });
      }
    } catch (error) {
      console.error('Failed to start screen sharing:', error);
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          setError('Screen sharing permission was denied');
        } else if (error.name === 'NotSupportedError') {
          setError('Screen sharing is not supported by this browser');
        } else {
          setError(error.message);
        }
      } else {
        setError('Failed to start screen sharing');
      }
      throw error;
    } finally {
      setIsLoading(false);
      operationInProgressRef.current = false;
    }
  }, [isLoading, sharingParticipantId, participantId, isSharing, roomId, storeOriginalVideoTracks, replaceVideoTracks, socket]);

  const stopScreenShare = useCallback(async (): Promise<void> => {
    if (!isSharing || operationInProgressRef.current || !roomId || !participantId) {
      return;
    }

    operationInProgressRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      // Stop all tracks in the screen stream
      if (screenStream) {
        screenStream.getTracks().forEach((track) => {
          track.stop();
        });
      }

      // Restore original video tracks
      await restoreOriginalVideoTracks();

      // Send stop request to server
      if (socket && socket.connected) {
        socket.emit('stop-screen-share', {
          roomId,
          participantId,
        });
      }

      // Update local state (will be confirmed by server response)
      setScreenStream(null);
    } catch (error) {
      console.error('Failed to stop screen sharing:', error);
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError('Failed to stop screen sharing');
      }
      throw error;
    } finally {
      setIsLoading(false);
      operationInProgressRef.current = false;
    }
  }, [isSharing, screenStream, restoreOriginalVideoTracks, roomId, participantId, socket]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (screenStream) {
        screenStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [screenStream]);

  return {
    isSharing,
    isLoading,
    sharingParticipantId,
    screenStream,
    error,
    startScreenShare,
    stopScreenShare,
    clearError,
  };
};
