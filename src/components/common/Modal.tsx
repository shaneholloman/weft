import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './Modal.css';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  titleBadge?: ReactNode;
  children: ReactNode;
  width?: 'sm' | 'md' | 'lg' | 'full';
  showBackButton?: boolean;
  onBack?: () => void;
}

export function Modal({ isOpen, onClose, title, titleBadge, children, width = 'md', showBackButton, onBack }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="modal-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className={`modal modal-${width}`} role="dialog" aria-modal="true">
        {title && (
          <div className="modal-header">
            <div className="modal-header-left">
              {showBackButton && onBack && (
                <button className="modal-back" onClick={onBack} aria-label="Back">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                </button>
              )}
              <h2 className="modal-title">{title}</h2>
              {titleBadge}
            </div>
            <button className="modal-close" onClick={onClose} aria-label="Close">
              &times;
            </button>
          </div>
        )}
        <div className="modal-content">{children}</div>
      </div>
    </div>,
    document.body
  );
}
