import { useEffect, useRef, useState } from 'react';
import type { Toast as ToastType, ToastType as ToastVariant } from '../../context/ToastContext';
import './Toast.css';

interface ToastProps {
  toast: ToastType;
  onClose: () => void;
}

const ICONS: Record<ToastVariant, string> = {
  success: '\u2713', // Check mark
  error: '\u2717',   // X mark
  warning: '\u23F8', // Pause (for approval)
  info: '\u2139',    // Info
};

export function Toast({ toast, onClose }: ToastProps) {
  const [isPaused, setIsPaused] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingRef = useRef(toast.duration || 4000);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    if (isPaused) {
      // Clear timeout and save remaining time
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      remainingRef.current -= Date.now() - startTimeRef.current;
    } else {
      // Start/resume timeout
      startTimeRef.current = Date.now();
      timeoutRef.current = setTimeout(() => {
        onClose();
      }, remainingRef.current);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isPaused, onClose]);

  const handleClick = () => {
    if (toast.taskId) {
      window.dispatchEvent(new CustomEvent('open-task', { detail: { taskId: toast.taskId } }));
      onClose();
    }
  };

  return (
    <div
      className={`toast toast-${toast.type} ${toast.taskId ? 'toast-clickable' : ''}`}
      onClick={toast.taskId ? handleClick : undefined}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <span className="toast-icon">{ICONS[toast.type]}</span>
      <span className="toast-message">{toast.message}</span>
      <button
        className="toast-close"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Close"
      >
        &times;
      </button>
    </div>
  );
}
