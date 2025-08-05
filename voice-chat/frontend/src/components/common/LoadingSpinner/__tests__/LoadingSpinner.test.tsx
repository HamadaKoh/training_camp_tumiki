import { render, screen } from '@testing-library/react';
import { LoadingSpinner } from '../index';

describe('LoadingSpinner Component', () => {
  test('ローディングスピナーが表示される', () => {
    render(<LoadingSpinner />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByLabelText(/読み込み中/i)).toBeInTheDocument();
  });

  test('カスタムメッセージが表示される', () => {
    render(<LoadingSpinner message="接続中..." />);
    expect(screen.getByText('接続中...')).toBeInTheDocument();
  });
});