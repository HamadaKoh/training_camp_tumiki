import React from 'react';
import { useRoom } from '../../../context';
import './ReconnectionNotification.module.css';

export const ReconnectionNotification: React.FC = () => {
  const { state, actions } = useRoom();

  if (!state.error || state.isConnected) {
    return null;
  }

  const isReconnecting = state.isConnecting;

  return (
    <div className={`reconnection-notification ${isReconnecting ? 'reconnecting' : 'error'}`}>
      <div className="notification-content">
        {isReconnecting ? (
          <>
            <span className="spinner" role="status" aria-label="再接続中">
              ⟳
            </span>
            <span>再接続中...</span>
          </>
        ) : (
          <>
            <span className="error-icon" role="img" aria-label="エラー">
              ⚠️
            </span>
            <span>接続に失敗しました</span>
            <button 
              onClick={() => actions.clearError()}
              className="retry-button"
              type="button"
            >
              再試行
            </button>
          </>
        )}
      </div>
    </div>
  );
};