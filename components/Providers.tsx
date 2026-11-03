'use client';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react';
import Modal from './Modal';

/* ── Toasts (replace alert()) ─────────────────────────────── */
type ToastTone = 'ok' | 'error' | 'info';
type ToastItem = { id: number; message: string; tone: ToastTone };
type ToastFn = (message: string, tone?: ToastTone) => void;

const ToastCtx = createContext<ToastFn>(() => {});
export const useToast = () => useContext(ToastCtx);

/* ── Confirm dialog (replaces confirm()) ──────────────────── */
export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'accent' | 'danger';
};
type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmCtx = createContext<ConfirmFn>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);

export default function Providers({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const [ask, setAsk] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);

  const toast = useCallback<ToastFn>((message, tone = 'info') => {
    const id = nextId.current++;
    setToasts(t => [...t.slice(-2), { id, message, tone }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), tone === 'error' ? 6000 : 3600);
  }, []);

  const confirm = useCallback<ConfirmFn>(
    opts => new Promise<boolean>(resolve => setAsk({ opts, resolve })),
    [],
  );

  const settle = (v: boolean) => {
    ask?.resolve(v);
    setAsk(null);
  };

  const ctx = useMemo(() => toast, [toast]);

  return (
    <ToastCtx.Provider value={ctx}>
      <ConfirmCtx.Provider value={confirm}>
        {children}

        <div className="toasts" aria-live="polite">
          {toasts.map(t => (
            <div key={t.id} className={`toast ${t.tone}`} role={t.tone === 'error' ? 'alert' : 'status'}>
              {t.tone === 'ok' ? <CircleCheck /> : t.tone === 'error' ? <CircleAlert /> : <TriangleAlert />}
              <span>{t.message}</span>
            </div>
          ))}
        </div>

        <Modal
          open={!!ask}
          onClose={() => settle(false)}
          title={ask?.opts.title ?? ''}
          description={ask?.opts.description}
          tone={ask?.opts.tone}
          icon={<TriangleAlert size={22} />}
          actions={
            <>
              <button type="button" className="btn btn-outline" onClick={() => settle(false)} data-autofocus={ask?.opts.tone === 'danger' ? true : undefined}>
                {ask?.opts.cancelLabel ?? 'Cancel'}
              </button>
              <button
                type="button"
                className={`btn ${ask?.opts.tone === 'danger' ? 'btn-danger-solid' : 'btn-primary'}`}
                onClick={() => settle(true)}
                data-autofocus={ask?.opts.tone === 'danger' ? undefined : true}
              >
                {ask?.opts.confirmLabel ?? 'Confirm'}
              </button>
            </>
          }
        />
      </ConfirmCtx.Provider>
    </ToastCtx.Provider>
  );
}
