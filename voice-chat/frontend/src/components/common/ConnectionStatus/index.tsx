import React from 'react';
import { useRoom } from '../../../context';
import './ConnectionStatus.module.css';

export const ConnectionStatus: React.FC = () => {
  const { state } = useRoom();

  const getStatusInfo = () => {
    if (state.isConnecting) {
      return {
        label: '接続中',
        className: 'connecting',
        icon: '🔄',
      };
    }
    
    if (state.isConnected) {
      return {
        label: '接続済み',
        className: 'connected',
        icon: '🟢',
      };
    }
    
    if (state.error) {
      return {
        label: 'エラー',
        className: 'error',
        icon: '🔴',
      };
    }
    
    return {
      label: '未接続',
      className: 'disconnected',
      icon: '⚫',
    };
  };

  const statusInfo = getStatusInfo();

  return (
    <div className={`connection-status ${statusInfo.className}`}>
      <span 
        className="status-icon" 
        aria-label={statusInfo.label}
        role="img"
      >
        {statusInfo.icon}
      </span>
      <span className="status-text">{statusInfo.label}</span>
      {state.error && (
        <span className="error-message" title={state.error}>
          {state.error}
        </span>
      )}
    </div>
  );
};