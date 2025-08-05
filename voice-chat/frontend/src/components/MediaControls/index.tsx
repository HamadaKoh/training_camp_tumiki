import { MediaControlsProps } from '../../types';
import './MediaControls.module.css';

export const MediaControls: React.FC<MediaControlsProps> = ({ 
  isMuted, 
  isScreenSharing,
  onToggleMute,
  onToggleScreenShare,
  disabled = false
}) => {
  return (
    <div className="media-controls">
      <button
        onClick={onToggleMute}
        disabled={disabled}
        aria-label={isMuted ? 'ミュート解除' : 'ミュート'}
        aria-pressed={isMuted}
        className={`control-button ${isMuted ? 'active' : ''}`}
      >
        {isMuted ? '🔇' : '🎤'}
      </button>
      
      <button
        onClick={onToggleScreenShare}
        disabled={disabled}
        aria-label={isScreenSharing ? '画面共有停止' : '画面共有'}
        aria-pressed={isScreenSharing}
        className={`control-button ${isScreenSharing ? 'active' : ''}`}
      >
        {isScreenSharing ? '⏹️' : '📺'}
      </button>
    </div>
  );
};