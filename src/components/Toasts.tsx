import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

export interface ToastInput {
  message: string;
  tone?: 'neutral' | 'success' | 'error' | 'gold';
  action?: { label: string; run: () => void | Promise<void> };
  /** Milliseconds before auto-dismiss. Toasts with an action stay longer. */
  duration?: number;
}

interface Toast extends ToastInput {
  id: number;
}

const ToastContext = createContext<((t: ToastInput) => void) | null>(null);

/** Polite live-region notifications with an optional single action (usually Undo). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-2), { ...input, id }]);
      const ms = input.duration ?? (input.action ? 8000 : 4000);
      timers.current.set(id, window.setTimeout(() => dismiss(id), ms));
    },
    [dismiss],
  );

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.tone ?? 'neutral'}`}>
            <span className="toast__msg">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="toast__action"
                onClick={async () => {
                  dismiss(t.id);
                  await t.action!.run();
                }}
              >
                {t.action.label}
              </button>
            )}
            <button type="button" className="icon-btn icon-btn--sm toast__close" aria-label="Dismiss notification" onClick={() => dismiss(t.id)}>
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): (t: ToastInput) => void {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast outside ToastProvider');
  return ctx;
}
