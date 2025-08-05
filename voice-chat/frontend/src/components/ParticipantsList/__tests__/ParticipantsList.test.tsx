import { render, screen } from '@testing-library/react';
import { ParticipantsList } from '../index';
import { ParticipantsListProps } from '../../../types';

describe('ParticipantsList Component', () => {
  test('参加者リストを正しく表示', () => {
    const participants = [
      { id: '1', name: 'Alice', isMuted: false, isScreenSharing: false, joinedAt: new Date() },
      { id: '2', name: 'Bob', isMuted: true, isScreenSharing: true, joinedAt: new Date() }
    ];
    
    render(<ParticipantsList participants={participants} />);
    
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('参加者: 2人')).toBeInTheDocument();
  });

  test('空のリストでも正常に表示', () => {
    render(<ParticipantsList participants={[]} />);
    expect(screen.getByText('参加者: 0人')).toBeInTheDocument();
  });

  test('現在のユーザーをハイライト表示', () => {
    const participants = [
      { id: '1', name: 'Alice', isMuted: false, isScreenSharing: false, joinedAt: new Date() },
      { id: '2', name: 'Bob', isMuted: true, isScreenSharing: false, joinedAt: new Date() }
    ];
    
    render(<ParticipantsList participants={participants} currentUserId="1" />);
    
    const aliceElement = screen.getByText('Alice').closest('li');
    expect(aliceElement).toHaveClass('current-user');
  });

  test('ミュート状態アイコンを表示', () => {
    const participants = [
      { id: '1', name: 'Alice', isMuted: true, isScreenSharing: false, joinedAt: new Date() }
    ];
    
    render(<ParticipantsList participants={participants} />);
    expect(screen.getByLabelText('ミュート中')).toBeInTheDocument();
  });

  test('画面共有状態アイコンを表示', () => {
    const participants = [
      { id: '1', name: 'Alice', isMuted: false, isScreenSharing: true, joinedAt: new Date() }
    ];
    
    render(<ParticipantsList participants={participants} />);
    expect(screen.getByLabelText('画面共有中')).toBeInTheDocument();
  });
});