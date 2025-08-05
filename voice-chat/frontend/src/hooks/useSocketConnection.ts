import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { ConnectionState, UseSocketConnection } from '../types';

export const useSocketConnection = (): UseSocketConnection => {
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    isConnected: false,
    isConnecting: false,
    error: null,
    socket: null,
    reconnectAttempts: 0,
  });

  const socketRef = useRef<Socket | null>(null);
  const eventListenersRef = useRef<Map<string, Function[]>>(new Map());

  const connect = useCallback((_roomId: string) => {
    if (socketRef.current?.connected) {
      return;
    }

    setConnectionState(prev => ({
      ...prev,
      isConnecting: true,
      error: null,
    }));

    const socket = io(import.meta.env.VITE_WS_URL || 'ws://localhost:3000', {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    // Connect event handlers
    socket.on('connect', () => {
      setConnectionState(prev => ({
        ...prev,
        isConnected: true,
        isConnecting: false,
        socket: socket,
        reconnectAttempts: 0,
      }));
    });

    socket.on('disconnect', (_reason: string) => {
      setConnectionState(prev => ({
        ...prev,
        isConnected: false,
        reconnectAttempts: prev.reconnectAttempts + 1,
      }));
    });

    socket.on('connect_error', (error: Error) => {
      setConnectionState(prev => ({
        ...prev,
        isConnected: false,
        isConnecting: false,
        error: error.message,
        reconnectAttempts: prev.reconnectAttempts + 1,
      }));
    });

    socketRef.current = socket;
    socket.connect();
  }, []);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    
    setConnectionState({
      isConnected: false,
      isConnecting: false,
      error: null,
      socket: null,
      reconnectAttempts: 0,
    });
  }, []);

  const emit = useCallback((event: string, data: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    }
  }, []);

  const addEventListener = useCallback((event: string, handler: Function) => {
    if (socketRef.current) {
      socketRef.current.on(event, handler as any);
    }
    
    // Store for cleanup
    const handlers = eventListenersRef.current.get(event) || [];
    handlers.push(handler);
    eventListenersRef.current.set(event, handlers);
  }, []);

  const removeEventListener = useCallback((event: string, handler: Function) => {
    if (socketRef.current) {
      socketRef.current.off(event, handler as any);
    }
    
    // Remove from stored handlers
    const handlers = eventListenersRef.current.get(event) || [];
    const filteredHandlers = handlers.filter(h => h !== handler);
    eventListenersRef.current.set(event, filteredHandlers);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  return {
    connectionState,
    connect,
    disconnect,
    emit,
    addEventListener,
    removeEventListener,
  };
};