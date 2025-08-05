import { ErrorAlertProps } from '../../../types';
import './ErrorAlert.module.css';

export const ErrorAlert: React.FC<ErrorAlertProps> = ({ 
  message, 
  onRetry 
}) => {
  return (
    <div role="alert" className="error-alert">
      <p>{message}</p>
      {onRetry && (
        <button onClick={onRetry} type="button">
          再試行
        </button>
      )}
    </div>
  );
};