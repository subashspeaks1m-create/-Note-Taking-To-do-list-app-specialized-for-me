import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Modal built on the native <dialog>: the browser provides focus trapping,
 * Escape to close and the inert background; focus returns to the opener.
 */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md' }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      opener.current = document.activeElement;
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    const onClosed = () => {
      if (opener.current instanceof HTMLElement && opener.current.isConnected) opener.current.focus();
    };
    el.addEventListener('cancel', onCancel);
    el.addEventListener('close', onClosed);
    return () => {
      el.removeEventListener('cancel', onCancel);
      el.removeEventListener('close', onClosed);
    };
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className={`dialog dialog--${size}`}
      aria-labelledby="dialog-title"
      aria-describedby={description ? 'dialog-desc' : undefined}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="dialog__inner">
          <header className="dialog__head">
            <div>
              <h2 id="dialog-title" className="dialog__title">
                {title}
              </h2>
              {description && (
                <p id="dialog-desc" className="dialog__desc">
                  {description}
                </p>
              )}
            </div>
            <button type="button" className="icon-btn icon-btn--sm" aria-label="Close" onClick={onClose}>
              <Icon name="close" size={18} />
            </button>
          </header>
          <div className="dialog__body">{children}</div>
          {footer && <footer className="dialog__foot">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
