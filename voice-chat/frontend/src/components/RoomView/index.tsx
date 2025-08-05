import { RoomViewProps } from '../../types';
import { ParticipantsList } from '../ParticipantsList';
import { MediaControls } from '../MediaControls';
import './RoomView.module.css';

export const RoomView: React.FC<RoomViewProps> = ({ 
  roomId, 
  isConnected, 
  participants,
  currentUser,
  onLeaveRoom
}) => {
  if (!isConnected) {
    return (
      <div className="room-view connecting">
        <p>接続中...</p>
      </div>
    );
  }

  return (
    <div className="room-view" data-testid="room-view-container">
      <header className="room-header">
        <h1>ルーム: {roomId}</h1>
        <button onClick={onLeaveRoom} className="leave-button">
          退室
        </button>
      </header>
      
      <main className="room-content">
        <div className="screen-share-area">
          {/* 画面共有エリア（将来の実装） */}
        </div>
        
        <aside className="participants-sidebar">
          <ParticipantsList 
            participants={participants}
            currentUserId={currentUser?.id}
          />
        </aside>
      </main>
      
      <footer className="room-footer">
        <MediaControls
          isMuted={currentUser?.isMuted || false}
          isScreenSharing={currentUser?.isScreenSharing || false}
          onToggleMute={() => {/* TODO: 実装 */}}
          onToggleScreenShare={() => {/* TODO: 実装 */}}
        />
      </footer>
    </div>
  );
};