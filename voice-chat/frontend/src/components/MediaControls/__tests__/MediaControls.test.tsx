import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { MediaControls } from '../index';
import { MediaControlsProps } from '../../../types';

describe('MediaControls Component', () => {
  const defaultProps: MediaControlsProps = {
    isMuted: false,
    isScreenSharing: false,
    onToggleMute: vi.fn(),
    onToggleScreenShare: vi.fn()
  };

  test('ミュートボタンが正常に動作する', () => {
    const onToggleMute = vi.fn();
    
    render(<MediaControls {...defaultProps} onToggleMute={onToggleMute} />);
    fireEvent.click(screen.getByRole('button', { name: /ミュート/i }));
    
    expect(onToggleMute).toHaveBeenCalledTimes(1);
  });

  test('画面共有ボタンが正常に動作する', () => {
    const onToggleScreenShare = vi.fn();
    
    render(<MediaControls {...defaultProps} onToggleScreenShare={onToggleScreenShare} />);
    fireEvent.click(screen.getByRole('button', { name: /画面共有/i }));
    
    expect(onToggleScreenShare).toHaveBeenCalledTimes(1);
  });

  test('無効化状態では操作できない', () => {
    render(<MediaControls {...defaultProps} disabled={true} />);
    
    const muteButton = screen.getByRole('button', { name: /ミュート/i });
    expect(muteButton).toBeDisabled();
  });

  test('ミュート中は適切なアイコンを表示', () => {
    render(<MediaControls {...defaultProps} isMuted={true} />);
    expect(screen.getByRole('button', { name: /ミュート解除/i })).toBeInTheDocument();
  });

  test('画面共有中は適切なアイコンを表示', () => {
    render(<MediaControls {...defaultProps} isScreenSharing={true} />);
    expect(screen.getByRole('button', { name: /画面共有停止/i })).toBeInTheDocument();
  });
});