import React from 'react';
import { ParticipantsListProps } from '../../types';
import styles from './ParticipantsList.module.css';

export const ParticipantsList: React.FC<ParticipantsListProps> = ({ 
  participants, 
  currentUserId,
  maxParticipants = 10
}) => {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>
          Participants ({participants.length}/{maxParticipants})
        </h3>
      </div>
      
      <ul className={styles.list}>
        {participants.map((participant) => (
          <li 
            key={participant.id}
            className={`${styles.participant} ${
              participant.id === currentUserId ? styles.currentUser : ''
            }`}
          >
            <div className={styles.participantInfo}>
              <div className={styles.participantName}>
                {participant.name}
                {participant.id === currentUserId && (
                  <span className={styles.youLabel}>(You)</span>
                )}
              </div>
              
              <div className={styles.statusIcons}>
                {participant.isMuted && (
                  <div 
                    className={`${styles.statusIcon} ${styles.mutedIcon}`}
                    aria-label="Muted"
                    title="Microphone is muted"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
                    </svg>
                  </div>
                )}
                
                {participant.isScreenSharing && (
                  <div 
                    className={`${styles.statusIcon} ${styles.sharingIcon}`}
                    aria-label="Screen sharing"
                    title="Currently sharing screen"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M21 3H3c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h6l-2 2v1h8v-1l-2-2h6c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 13H3V5h18v11z"/>
                      <path d="M12 8l-4 4h3v4h2v-4h3z"/>
                    </svg>
                  </div>
                )}
              </div>
            </div>
            
            {participant.isScreenSharing && (
              <div className={styles.sharingIndicator}>
                <div className={styles.sharingPulse} />
                <span className={styles.sharingText}>Sharing screen</span>
              </div>
            )}
            
            <div className={`${styles.connectionStatus} ${
              participant.isConnected ? styles.connected : styles.disconnected
            }`} />
          </li>
        ))}
      </ul>
      
      {participants.length === 0 && (
        <div className={styles.emptyState}>
          <p>No participants yet</p>
        </div>
      )}
      
      {participants.length >= maxParticipants && (
        <div className={styles.fullNotice}>
          <p>Room is full ({maxParticipants} participants)</p>
        </div>
      )}
    </div>
  );
};