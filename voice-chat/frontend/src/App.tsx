import { useState } from 'react';
import { RoomView } from './components/RoomView';
import { LoadingSpinner } from './components/common/LoadingSpinner';
import { ErrorAlert } from './components/common/ErrorAlert';
import { Participant } from './types';
import './App.css';

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const currentUser: Participant = {
    id: 'current-user',
    name: 'あなた',
    isMuted: false,
    isScreenSharing: false,
    joinedAt: new Date()
  };

  const handleLeaveRoom = () => {
    console.log('Leaving room...');
    // TODO: Socket.IO実装時に接続終了処理を追加
  };

  const handleJoinRoom = () => {
    setLoading(true);
    // TODO: Socket.IO接続処理
    setTimeout(() => {
      setIsConnected(true);
      setLoading(false);
      setParticipants([currentUser]);
    }, 1000);
  };

  if (loading) {
    return <LoadingSpinner message="ルームに接続中..." />;
  }

  if (error) {
    return (
      <ErrorAlert 
        message={error} 
        onRetry={() => {
          setError('');
          handleJoinRoom();
        }} 
      />
    );
  }

  if (!isConnected) {
    return (
      <div className="app-welcome">
        <h1>Voice Chat</h1>
        <button onClick={handleJoinRoom} className="join-button">
          ルームに参加
        </button>
      </div>
    );
  }

  return (
    <RoomView
      roomId="default-room"
      isConnected={isConnected}
      participants={participants}
      currentUser={currentUser}
      onLeaveRoom={handleLeaveRoom}
    />
  );
}

export default App;