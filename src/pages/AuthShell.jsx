import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../lib/auth';

export default function AuthShell({ title, subtitle, children, wide }) {
  const { settings } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 via-brand-800 to-slate-900 p-4">
      <div className={`w-full ${wide ? 'max-w-xl' : 'max-w-md'}`}>
        <div className="mb-6 flex items-center justify-center gap-2.5 text-white">
          <div className="rounded-xl bg-emerald-400/20 p-2.5"><ShieldCheck className="h-6 w-6 text-emerald-300" /></div>
          <span className="text-xl font-bold">{settings?.company_name || 'Crédito Pro'}</span>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </div>
      </div>
    </div>
  );
}
