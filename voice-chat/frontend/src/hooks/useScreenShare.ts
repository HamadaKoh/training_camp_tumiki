import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebRTC } from './useWebRTC';
import { useSocketConnection } from './useSocketConnection';

export interface UseScreenShareReturn {
  // 状態
  isSharing: boolean;
  isLoading: boolean;
  sharingUserId: string | null;
  screenStream: MediaStream | null;
  sharedScreenStream: MediaStream | null;

  // 制御関数
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => Promise<void>;
}

// Generate a simple user ID for demo purposes
const getCurrentUserId = () => 'current-user-' + Math.random().toString(36).substring(2, 11);

export const useScreenShare = (): UseScreenShareReturn => {
  const { peers, localStream } = useWebRTC();
  const { connectionState } = useSocketConnection();
  const socket = connectionState.socket;

  const [isSharing, setIsSharing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const operationInProgressRef = useRef(false);
  const [sharingUserId, setSharingUserId] = useState<string | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [sharedScreenStream, setSharedScreenStream] = useState<MediaStream | null>(null);

  const currentUserIdRef = useRef(getCurrentUserId());
  const originalVideoTracksRef = useRef<Map<string, MediaStreamTrack>>(new Map());

  // Socket.IO event listeners
  useEffect(() => {
    if (!socket) return;

    const handleParticipantScreenShareStarted = (data: { userId: string }) => {
      setSharingUserId(data.userId);
      // In a real app, we would receive the shared screen stream here
      // For now, we'll simulate it
    };

    const handleParticipantScreenShareStopped = (data: { userId: string }) => {
      setSharingUserId((prev) => (prev === data.userId ? null : prev));
      if (sharingUserId === data.userId) {
        setSharedScreenStream(null);
      }
    };

    const handleScreenShareRequestDenied = (data: {
      reason: string;
      currentSharingUserId: string;
    }) => {
      console.error('Screen share request denied:', data.reason);
      // Could show user notification here
    };

    socket.on('participant-screen-share-started', handleParticipantScreenShareStarted);
    socket.on('participant-screen-share-stopped', handleParticipantScreenShareStopped);
    socket.on('screen-share-request-denied', handleScreenShareRequestDenied);

    return () => {
      socket.off('participant-screen-share-started');
      socket.off('participant-screen-share-stopped');
      socket.off('screen-share-request-denied');
    };
  }, [socket, sharingUserId]);

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
    if (isLoading || operationInProgressRef.current) return;

    // Check if someone else is already sharing
    if (sharingUserId && sharingUserId !== currentUserIdRef.current) {
      throw new Error(`Screen sharing is already active by user: ${sharingUserId}`);
    }

    // Check if we're already sharing
    if (isSharing) return;

    operationInProgressRef.current = true;

    // Check if getDisplayMedia is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      throw new Error('Screen sharing is not supported by this browser');
    }

    setIsLoading(true);

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
        // Directly update state without calling stopScreenShare to avoid recursion
        setIsSharing(false);
        setSharingUserId((prev) => (prev === currentUserIdRef.current ? null : prev));
        setScreenStream(null);
      };

      // Replace video tracks in all peer connections
      await replaceVideoTracks(screenVideoTrack);

      // Update state
      setScreenStream(displayStream);
      setIsSharing(true);
      setSharingUserId(currentUserIdRef.current);

      // Notify other participants
      if (socket && socket.connected) {
        socket.emit('screen-share-started', {
          userId: currentUserIdRef.current,
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      console.error('Failed to start screen sharing:', error);
      throw error;
    } finally {
      setIsLoading(false);
      operationInProgressRef.current = false;
    }
  }, [isLoading, sharingUserId, isSharing, storeOriginalVideoTracks, replaceVideoTracks, socket]);

  const stopScreenShare = useCallback(async (): Promise<void> => {
    if (!isSharing || !screenStream || operationInProgressRef.current) return;

    operationInProgressRef.current = true;
    setIsLoading(true);

    try {
      // Stop all tracks in the screen stream
      screenStream.getTracks().forEach((track) => {
        track.stop();
      });

      // Restore original video tracks
      await restoreOriginalVideoTracks();

      // Update state
      setScreenStream(null);
      setIsSharing(false);
      if (sharingUserId === currentUserIdRef.current) {
        setSharingUserId(null);
      }

      // Notify other participants
      if (socket && socket.connected) {
        socket.emit('screen-share-stopped', {
          userId: currentUserIdRef.current,
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      console.error('Failed to stop screen sharing:', error);
      throw error;
    } finally {
      setIsLoading(false);
      operationInProgressRef.current = false;
    }
  }, [isSharing, screenStream, restoreOriginalVideoTracks, sharingUserId, socket]);

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
    sharingUserId,
    screenStream,
    sharedScreenStream,
    startScreenShare,
    stopScreenShare,
  };
};
