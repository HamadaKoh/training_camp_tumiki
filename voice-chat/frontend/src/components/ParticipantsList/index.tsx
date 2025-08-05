import { ParticipantsListProps } from '../../types';
import './ParticipantsList.module.css';

export const ParticipantsList: React.FC<ParticipantsListProps> = ({ 
  participants, 
  currentUserId,
  maxParticipants: _maxParticipants = 10
}) => {
  return (
    <div className="participants-list">
      <h3>参加者: {participants.length}人</h3>
      <ul>
        {participants.map((participant) => (
          <li 
            key={participant.id}
            className={participant.id === currentUserId ? 'current-user' : ''}
          >
            <span>{participant.name}</span>
            {participant.isMuted && (
              <span aria-label="ミュート中" className="muted-icon">🔇</span>
            )}
            {participant.isScreenSharing && (
              <span aria-label="画面共有中" className="sharing-icon">📺</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};