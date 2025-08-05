import React from 'react';
import { useScreenShare } from '../../hooks';
import { useRoom } from '../../context';
import styles from './ScreenShare.module.css';

interface ScreenShareProps {
  roomId: string;
  participantId: string;
  disabled?: boolean;
}

export const ScreenShare: React.FC<ScreenShareProps> = ({
  roomId,
  participantId,
  disabled = false,
}) => {
  const { state } = useRoom();
  const {
    isSharing,
    isLoading,
    sharingParticipantId,
    screenStream,
    error,
    startScreenShare,
    stopScreenShare,
    clearError,
  } = useScreenShare(roomId, participantId);

  const handleToggleScreenShare = async () => {
    try {
      if (isSharing) {
        await stopScreenShare();
      } else {
        await startScreenShare();
      }
    } catch (err) {
      // Error is already handled by the hook
      console.error('Screen share toggle failed:', err);
    }
  };

  const isDisabled = disabled || isLoading || !state.isConnected;
  const isSomeoneElseSharing = sharingParticipantId && sharingParticipantId !== participantId;

  return (
    <div className={styles.container}>
      {/* Screen Share Control Button */}
      <button
        onClick={handleToggleScreenShare}
        disabled={isDisabled || isSomeoneElseSharing}
        className={`${styles.button} ${isSharing ? styles.active : ''} ${
          isSomeoneElseSharing ? styles.disabled : ''
        }`}
        aria-label={
          isSharing
            ? 'Stop screen sharing'
            : isSomeoneElseSharing
            ? `Screen sharing is active by ${sharingParticipantId}`
            : 'Start screen sharing'
        }
        title={
          isSomeoneElseSharing
            ? `${sharingParticipantId} is currently sharing their screen`
            : isSharing
            ? 'Stop sharing your screen'
            : 'Share your screen'
        }
      >
        {isLoading ? (
          <div className={styles.loading}>
            <div className={styles.spinner} />
          </div>
        ) : (
          <>
            <div className={`${styles.icon} ${isSharing ? styles.iconActive : ''}`}>
              {isSharing ? (
                // Stop screen share icon
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21 3H3c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h6l-2 2v1h8v-1l-2-2h6c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 13H3V5h18v11z"/>
                  <path d="M8.5 8.5L12 12l3.5-3.5L12 5z" fill="red"/>
                </svg>
              ) : (
                // Start screen share icon
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21 3H3c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h6l-2 2v1h8v-1l-2-2h6c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 13H3V5h18v11z"/>
                  <path d="M12 8l-4 4h3v4h2v-4h3z"/>
                </svg>
              )}
            </div>
            <span className={styles.label}>
              {isSharing ? 'Stop Sharing' : 'Share Screen'}
            </span>
          </>
        )}
      </button>

      {/* Screen Share Status */}
      {sharingParticipantId && (
        <div className={styles.status}>
          {sharingParticipantId === participantId ? (
            <div className={styles.statusActive}>
              <div className={styles.statusIcon}>🔴</div>
              <span>You are sharing your screen</span>
            </div>
          ) : (
            <div className={styles.statusOther}>
              <div className={styles.statusIcon}>👁️</div>
              <span>{sharingParticipantId} is sharing their screen</span>
            </div>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className={styles.error}>
          <div className={styles.errorMessage}>{error}</div>
          <button onClick={clearError} className={styles.errorClose} aria-label="Close error">
            ×
          </button>
        </div>
      )}

      {/* Screen Preview (if sharing) */}
      {isSharing && screenStream && (
        <div className={styles.preview}>
          <div className={styles.previewHeader}>
            <span>Your screen preview</span>
            <button
              onClick={stopScreenShare}
              className={styles.previewStop}
              aria-label="Stop screen sharing"
            >
              Stop
            </button>
          </div>
          <video
            ref={(video) => {
              if (video && screenStream) {
                video.srcObject = screenStream;
              }
            }}
            autoPlay
            muted
            className={styles.previewVideo}
          />
        </div>
      )}
    </div>
  );
};