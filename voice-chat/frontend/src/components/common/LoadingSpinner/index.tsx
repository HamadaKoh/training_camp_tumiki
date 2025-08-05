import { LoadingSpinnerProps } from '../../../types';
import './LoadingSpinner.module.css';

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  message = '読み込み中...' 
}) => {
  return (
    <div role="status" aria-label={message}>
      <div className="spinner"></div>
      {message && <p>{message}</p>}
    </div>
  );
};