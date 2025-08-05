import { RoomProvider, useRoom } from './context';
import { RoomView } from './components/RoomView';
import { LoadingSpinner } from './components/common/LoadingSpinner';
import { ErrorAlert } from './components/common/ErrorAlert';
import { ConnectionStatus } from './components/common/ConnectionStatus';
import { ReconnectionNotification } from './components/common/ReconnectionNotification';
import './App.css';

const AppContent = () => {
  const { state, actions } = useRoom();

  const handleJoinRoom = () => {
    actions.joinRoom('default-room', 'あなた');
  };

  if (state.isConnecting) {
    return <LoadingSpinner message="ルームに接続中..." />;
  }

  if (state.error && !state.isConnected && !state.isConnecting) {
    return (
      <ErrorAlert
        message={state.error}
        onRetry={() => {
          actions.clearError();
          handleJoinRoom();
        }}
      />
    );
  }

  if (!state.isConnected && !state.isConnecting) {
    return (
      <div className="app-welcome">
        <h1>Voice Chat</h1>
        <button onClick={handleJoinRoom} className="join-button">
          ルームに参加
        </button>
        <div className="connection-status-container">
          <ConnectionStatus />
        </div>
      </div>
    );
  }

  return (
    <>
      <RoomView
        roomId={state.roomId || 'default-room'}
        isConnected={state.isConnected}
        participants={state.participants}
        currentUser={state.currentUser || undefined}
        onLeaveRoom={actions.leaveRoom}
      />
      <ReconnectionNotification />
    </>
  );
};

function App() {
  return (
    <RoomProvider>
      <AppContent />
    </RoomProvider>
  );
}

export default App;
