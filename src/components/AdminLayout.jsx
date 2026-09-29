import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, DollarSign, Mail, FileText, Settings, LogOut, Menu, X, ShieldCheck } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { cx } from './ui';

export default function AdminLayout() {
  const { signOut, settings, session } = useAuth();
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState({});
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    (async () => {
      const [a, b] = await Promise.all([
        supabase.from('cr_clients').select('id', { count: 'exact', head: true }).eq('reviewed', false),
        supabase.from('cr_charges').select('id', { count: 'exact', head: true }).eq('status', 'pendiente'),
      ]);
      setCounts({ nuevos: a.count || 0, cobros: b.count || 0 });
    })();
  }, [loc.pathname]);

  const nav = [
    { to: '/admin', label: 'Panel', icon: LayoutDashboard, end: true },
    { to: '/admin/clientes', label: 'Clientes', icon: Users, badge: counts.nuevos },
    { to: '/admin/cobros', label: 'Eliminadas y cobros', icon: DollarSign, badge: counts.cobros },
    { to: '/admin/cartas', label: 'Cartas', icon: Mail },
    { to: '/admin/plantillas', label: 'Plantillas', icon: FileText },
    { to: '/admin/configuracion', label: 'Configuración', icon: Settings },
  ];

  const sidebar = (
    <div className="flex h-full flex-col bg-brand-900 text-brand-100">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="rounded-lg bg-emerald-400/20 p-2"><ShieldCheck className="h-5 w-5 text-emerald-300" /></div>
        <div className="min-w-0">
          <div className="truncate font-bold text-white">{settings?.company_name || 'Crédito Pro'}</div>
          <div className="text-xs text-brand-100/60">Reparación de crédito</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}
            className={({ isActive }) => cx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
              isActive ? 'bg-white/10 text-white' : 'text-brand-100/75 hover:bg-white/5 hover:text-white')}>
            <n.icon className="h-4 w-4" />
            <span className="flex-1">{n.label}</span>
            {!!n.badge && <span className="rounded-full bg-emerald-400 px-2 text-xs font-bold text-brand-900">{n.badge}</span>}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="truncate px-3 pb-2 text-xs text-brand-100/60">{session?.user?.email}</div>
        <button onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-brand-100/75 hover:bg-white/5 hover:text-white">
          <LogOut className="h-4 w-4" /> Cerrar sesión
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 hidden w-64 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64">{sidebar}</aside>
          <button className="absolute left-64 top-3 ml-2 rounded-md bg-white p-1.5" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button>
        </div>
      )}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <button onClick={() => setOpen(true)} className="rounded-md p-1 hover:bg-slate-100" aria-label="Menú"><Menu className="h-6 w-6" /></button>
        <span className="font-semibold">{settings?.company_name || 'Crédito Pro'}</span>
      </header>
      <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8"><Outlet /></main>
    </div>
  );
}
