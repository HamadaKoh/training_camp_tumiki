import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { ErrorAlert } from '../index';

describe('ErrorAlert Component', () => {
  test('エラーメッセージが表示される', () => {
    render(<ErrorAlert message="接続エラーが発生しました" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('接続エラーが発生しました')).toBeInTheDocument();
  });

  test('再試行ボタンが動作する', () => {
    const onRetry = vi.fn();
    render(<ErrorAlert message="エラー" onRetry={onRetry} />);
    
    fireEvent.click(screen.getByRole('button', { name: /再試行/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test('再試行ボタンが表示されない場合', () => {
    render(<ErrorAlert message="エラー" />);
    expect(screen.queryByRole('button', { name: /再試行/i })).not.toBeInTheDocument();
  });
});