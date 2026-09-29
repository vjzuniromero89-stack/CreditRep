import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Users, UserPlus, AlertOctagon, CheckCircle2, DollarSign, Mail, Clock, Copy } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { BUREAU_NAME } from '../../lib/constants';
import { fmtDate, fullName, money } from '../../lib/format';
import { Badge, Card, PageHeader, Spinner, Stat, useToast } from '../../components/ui';

export default function Dashboard() {
  const nav = useNavigate();
  const toast = useToast();
  const [d, setD] = useState(null);

  useEffect(() => {
    (async () => {
      const monthStart = new Date(); monthStart.setDate(1);
      const ms = monthStart.toISOString().slice(0, 10);
      const d30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
      const [clients, items, charges, letters, act] = await Promise.all([
        supabase.from('cr_clients').select('id,first_name,middle_name,last_name,status,reviewed,source,created_at,intake_completed'),
        supabase.from('cr_items').select('id,client_id,kind,is_negative,status,removed_at'),
        supabase.from('cr_charges').select('*').eq('status', 'pendiente').order('created_at', { ascending: false }),
        supabase.from('cr_letters').select('id,client_id,created_at,status,sent_at,bureau,template_name,recipient_name'),
        supabase.from('cr_activity').select('*').order('created_at', { ascending: false }).limit(15),
      ]);
      const cl = clients.data || []; const it = items.data || []; const le = letters.data || [];
      const names = Object.fromEntries(cl.map((c) => [c.id, fullName(c)]));
      setD({
        names,
        active: cl.filter((c) => c.status === 'activo').length,
        total: cl.length,
        newOnes: cl.filter((c) => !c.reviewed),
        neg: it.filter((i) => i.kind === 'cuenta' && i.is_negative && i.status !== 'eliminada').length,
        removedMonth: it.filter((i) => i.status === 'eliminada' && i.removed_at >= ms && (i.kind !== 'cuenta' || i.is_negative)).length,
        removedTotal: it.filter((i) => i.status === 'eliminada' && (i.kind !== 'cuenta' || i.is_negative)).length,
        pending: (charges.data || []).reduce((s, c) => s + Number(c.amount || 0), 0),
        charges: (charges.data || []).slice(0, 8),
        lettersMonth: le.filter((l) => l.created_at >= ms).length,
        followUp: le.filter((l) => l.status === 'enviada' && l.sent_at && l.sent_at <= d30).slice(0, 8),
        activity: act.data || [],
      });
    })();
  }, []);

  if (!d) return <Spinner />;
  const signupUrl = `${window.location.origin}/registro`;
  return (
    <div className="space-y-6">
      <PageHeader title="Panel" subtitle={new Date().toLocaleDateString('es-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Stat icon={Users} label="Clientes activos" value={d.active} sub={`${d.total} en total`} onClick={() => nav('/admin/clientes')} />
        <Stat icon={AlertOctagon} tone="red" label="Negativas activas" value={d.neg} sub="cuentas negativas por bureau" />
        <Stat icon={CheckCircle2} tone="green" label="Eliminadas este mes" value={d.removedMonth} sub={`${d.removedTotal} en total`} onClick={() => nav('/admin/cobros')} />
        <Stat icon={DollarSign} tone="amber" label="Por cobrar" value={money(d.pending)} sub="cobros pendientes por eliminaciones" onClick={() => nav('/admin/cobros')} />
        <Stat icon={Mail} tone="slate" label="Cartas este mes" value={d.lettersMonth} onClick={() => nav('/admin/cartas')} />
        <Stat icon={UserPlus} tone="brand" label="Registros nuevos" value={d.newOnes.length} sub="desde el portal, sin revisar" onClick={() => nav('/admin/clientes')} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Eliminadas por cobrar" actions={<Link to="/admin/cobros" className="text-sm font-medium text-brand-700">Ver todo →</Link>} bodyClass="p-0">
          {!d.charges.length ? <p className="p-4 text-sm text-slate-500">No hay cobros pendientes.</p> : (
            <ul className="divide-y divide-slate-100">
              {d.charges.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0"><Link to={`/admin/clientes/${c.client_id}`} className="text-sm font-semibold hover:underline">{d.names[c.client_id]}</Link><div className="truncate text-xs text-slate-500">{c.description}</div></div>
                  <span className="font-semibold">{money(c.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Seguimiento: cartas enviadas hace +30 días" bodyClass="p-0">
          {!d.followUp.length ? <p className="p-4 text-sm text-slate-500">Nada pendiente. Cuando pasen 30 días de enviar una carta, aparecerá aquí para subir un reporte nuevo o mandar la siguiente ronda.</p> : (
            <ul className="divide-y divide-slate-100">
              {d.followUp.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0"><Link to={`/admin/clientes/${l.client_id}`} className="text-sm font-semibold hover:underline">{d.names[l.client_id]}</Link><div className="truncate text-xs text-slate-500">{l.template_name} → {l.bureau ? BUREAU_NAME[l.bureau] : l.recipient_name}</div></div>
                  <Badge className="bg-amber-100 text-amber-800 ring-amber-200"><Clock className="mr-1 h-3 w-3" />{fmtDate(l.sent_at)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Registros nuevos del portal" bodyClass="p-0">
          {!d.newOnes.length ? <p className="p-4 text-sm text-slate-500">No hay registros nuevos.</p> : (
            <ul className="divide-y divide-slate-100">
              {d.newOnes.map((c) => (
                <li key={c.id} className="flex items-center justify-between px-4 py-2.5">
                  <Link to={`/admin/clientes/${c.id}`} className="text-sm font-semibold hover:underline">{fullName(c)}</Link>
                  <span className="text-xs text-slate-500">{fmtDate(c.created_at)} {c.intake_completed ? '· info completa' : '· llenando info'}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            <span className="truncate">Enlace de registro para clientes: <b>{signupUrl}</b></span>
            <button className="flex items-center gap-1 font-semibold text-brand-700" onClick={() => { navigator.clipboard.writeText(signupUrl); toast('Enlace copiado'); }}><Copy className="h-3.5 w-3.5" />Copiar</button>
          </div>
        </Card>
        <Card title="Actividad reciente">
          <ul className="space-y-2.5">
            {d.activity.map((a) => (
              <li key={a.id} className="text-sm">
                <Link to={`/admin/clientes/${a.client_id}`} className="font-semibold text-slate-800 hover:underline">{d.names[a.client_id] || '—'}</Link>
                <span className="text-slate-600"> — {a.message}</span>
                <div className="text-xs text-slate-400">{new Date(a.created_at).toLocaleString('es-US')}</div>
              </li>
            ))}
            {!d.activity.length && <li className="text-sm text-slate-500">Sin actividad todavía.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
