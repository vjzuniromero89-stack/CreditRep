import { createContext, forwardRef, useCallback, useContext, useEffect, useState } from 'react';
import { Loader2, X, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

export const cx = (...a) => a.filter(Boolean).join(' ');

export function Button({ variant = 'primary', size = 'md', className, loading, children, icon: Icon, ...p }) {
  const v = {
    primary: 'bg-brand-700 text-white hover:bg-brand-800 shadow-sm',
    secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-sm',
    danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
    violet: 'bg-violet-600 text-white hover:bg-violet-700 shadow-sm',
    ghost: 'text-slate-600 hover:bg-slate-100',
    dangerGhost: 'text-red-600 hover:bg-red-50',
  }[variant];
  const s = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-3.5 py-2 text-sm', lg: 'px-5 py-2.5 text-base' }[size];
  return (
    <button className={cx('inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50', v, s, className)} disabled={loading || p.disabled} {...p}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} /> : null}
      {children}
    </button>
  );
}

export function Field({ label, children, className, hint }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export const Input = forwardRef((p, ref) => <input ref={ref} {...p} className={cx('input', p.className)} />);
export const Textarea = forwardRef((p, ref) => <textarea ref={ref} {...p} className={cx('input', p.className)} />);
export function Select({ options, className, placeholder, ...p }) {
  return (
    <select {...p} className={cx('input', className)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>))}
    </select>
  );
}

export function Badge({ className, children }) {
  return <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', className || 'bg-slate-100 text-slate-700 ring-slate-200')}>{children}</span>;
}

export function Card({ title, actions, children, className, bodyClass }) {
  return (
    <div className={cx('card', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h3 className="font-semibold text-slate-800">{title}</h3>
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </div>
      )}
      <div className={cx(bodyClass ?? 'p-4')}>{children}</div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return;
    const f = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [open, onClose]);
  if (!open) return null;
  const w = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-3 sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={cx('my-4 w-full rounded-xl bg-white shadow-2xl', w)}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Cerrar"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3 rounded-b-xl">{footer}</div>}
      </div>
    </div>
  );
}

export function Spinner({ label = 'Cargando…' }) {
  return <div className="flex items-center justify-center gap-2 py-12 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" />{label}</div>;
}

export function Empty({ icon: Icon = Info, title, children }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-slate-500">
      <Icon className="h-8 w-8 text-slate-300" />
      <p className="font-medium text-slate-600">{title}</p>
      {children && <div className="text-sm">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, icon: Icon, tone = 'brand', onClick }) {
  const t = { brand: 'bg-brand-50 text-brand-700', green: 'bg-emerald-50 text-emerald-700', red: 'bg-red-50 text-red-700', amber: 'bg-amber-50 text-amber-700', slate: 'bg-slate-100 text-slate-700' }[tone];
  return (
    <button onClick={onClick} disabled={!onClick} className="card flex items-center gap-3 p-4 text-left transition enabled:hover:border-brand-200 enabled:hover:shadow">
      {Icon && <div className={cx('rounded-lg p-2.5', t)}><Icon className="h-5 w-5" /></div>}
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
        <div className="text-2xl font-bold text-slate-900">{value}</div>
        {sub && <div className="truncate text-xs text-slate-500">{sub}</div>}
      </div>
    </button>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={cx('-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition',
            value === t.id ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-800')}>
          {t.icon && <t.icon className="h-4 w-4" />}{t.label}
          {t.count != null && <span className={cx('rounded-full px-1.5 text-xs', value === t.id ? 'bg-brand-100' : 'bg-slate-100')}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Confirmación
const ConfirmCtx = createContext(null);
const ToastCtx = createContext(null);

export function UIProvider({ children }) {
  const [confirmState, setConfirm] = useState(null);
  const [toasts, setToasts] = useState([]);
  const confirm = useCallback((opts) => new Promise((resolve) => setConfirm({ ...opts, resolve })), []);
  const toast = useCallback((msg, type = 'ok') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 7000 : 3500);
  }, []);
  const close = (v) => { confirmState?.resolve(v); setConfirm(null); };
  return (
    <ConfirmCtx.Provider value={confirm}>
      <ToastCtx.Provider value={toast}>
        {children}
        <Modal open={!!confirmState} onClose={() => close(false)} title={confirmState?.title || '¿Estás seguro?'} size="sm"
          footer={<>
            <Button variant="secondary" onClick={() => close(false)}>Cancelar</Button>
            <Button variant={confirmState?.danger === false ? 'primary' : 'danger'} onClick={() => close(true)}>{confirmState?.ok || 'Sí, continuar'}</Button>
          </>}>
          <div className="flex gap-3">
            <AlertTriangle className={cx('h-6 w-6 shrink-0', confirmState?.danger === false ? 'text-brand-600' : 'text-red-500')} />
            <p className="text-sm text-slate-600">{confirmState?.message}</p>
          </div>
        </Modal>
        <div className="no-print fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
          {toasts.map((t) => (
            <div key={t.id} className={cx('flex items-start gap-2 rounded-lg px-4 py-3 text-sm text-white shadow-lg', t.type === 'error' ? 'bg-red-600' : 'bg-slate-900')}>
              {t.type === 'error' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />}
              <span>{t.msg}</span>
            </div>
          ))}
        </div>
      </ToastCtx.Provider>
    </ConfirmCtx.Provider>
  );
}
export const useConfirm = () => useContext(ConfirmCtx);
export const useToast = () => useContext(ToastCtx);

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
