import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { RoomView } from '../index';
import { RoomViewProps } from '../../../types';

describe('RoomView Component', () => {
  const defaultProps: RoomViewProps = {
    roomId: 'test-room',
    isConnected: true,
    participants: [],
    onLeaveRoom: vi.fn()
  };

  test('正常にレンダリングされる', () => {
    render(<RoomView {...defaultProps} />);
    
    expect(screen.getByText(/test-room/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /退室/i })).toBeInTheDocument();
  });

  test('参加者リストが表示される', () => {
    const participants = [
      { id: '1', name: 'Alice', isMuted: false, isScreenSharing: false, joinedAt: new Date() },
      { id: '2', name: 'Bob', isMuted: true, isScreenSharing: false, joinedAt: new Date() }
    ];
    
    render(<RoomView {...defaultProps} participants={participants} />);
    
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  test('退室ボタンクリックでコールバックが呼ばれる', () => {
    const onLeaveRoom = vi.fn();
    
    render(<RoomView {...defaultProps} onLeaveRoom={onLeaveRoom} />);
    fireEvent.click(screen.getByRole('button', { name: /退室/i }));
    
    expect(onLeaveRoom).toHaveBeenCalledTimes(1);
  });

  test('未接続時は適切なメッセージを表示', () => {
    render(<RoomView {...defaultProps} isConnected={false} />);
    expect(screen.getByText(/接続中/i)).toBeInTheDocument();
  });
});