import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { ACCOUNT_CATEGORIES, BUREAU_COLOR, BUREAU_NAME, CHARGE_STATUS, PERSONAL_CATEGORIES } from '../../lib/constants';
import { fmtDate, fullName, money } from '../../lib/format';
import { Badge, Card, Empty, Input, PageHeader, Select, Spinner, Tabs } from '../../components/ui';
import ChargesTable from '../../components/ChargesTable';

export default function Charges() {
  const [tab, setTab] = useState('cobros');
  const [charges, setCharges] = useState(null);
  const [removed, setRemoved] = useState([]);
  const [names, setNames] = useState({});
  const [status, setStatus] = useState('pendiente');
  const [month, setMonth] = useState('');
  const [q, setQ] = useState('');

  const load = async () => {
    const [c, i, cl] = await Promise.all([
      supabase.from('cr_charges').select('*').order('created_at', { ascending: false }),
      supabase.from('cr_items').select('*').eq('status', 'eliminada').order('removed_at', { ascending: false }),
      supabase.from('cr_clients').select('id,first_name,middle_name,last_name'),
    ]);
    setCharges(c.data || []); setRemoved(i.data || []);
    setNames(Object.fromEntries((cl.data || []).map((x) => [x.id, fullName(x)])));
  };
  useEffect(() => { load(); }, []);

  const chargeIds = useMemo(() => new Map((charges || []).filter((c) => c.item_id).map((c) => [c.item_id, c])), [charges]);
  const fc = (charges || []).filter((c) => (!status || c.status === status) && (!month || c.created_at.slice(0, 7) === month) && (!q || (names[c.client_id] || '').toLowerCase().includes(q.toLowerCase())));
  const fr = removed.filter((i) => (!month || (i.removed_at || '').slice(0, 7) === month) && (!q || (names[i.client_id] || '').toLowerCase().includes(q.toLowerCase())));

  if (!charges) return <Spinner />;
  return (
    <div className="space-y-4">
      <PageHeader title="Eliminadas y cobros" subtitle="Cada vez que un reporte nuevo muestra que algo se eliminó, se registra aquí y se crea el cobro al cliente." />
      <div className="flex flex-wrap gap-2">
        <Input className="w-full sm:w-64" placeholder="Buscar cliente…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Input className="w-auto" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        {tab === 'cobros' && <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)} options={Object.entries(CHARGE_STATUS).map(([k, x]) => [k, x.label])} placeholder="Todos" />}
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'cobros', label: 'Cobros', count: fc.length }, { id: 'eliminadas', label: 'Items eliminados', count: fr.length }]} />
      {tab === 'cobros' ? <ChargesTable charges={fc} clients={names} showClient onReload={load} /> : (
        <Card bodyClass="p-0">
          {!fr.length ? <Empty title="No hay items eliminados en este periodo" /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead className="bg-slate-50"><tr><th className="th">Eliminada</th><th className="th">Cliente</th><th className="th">Bureau</th><th className="th">Item</th><th className="th">Tipo</th><th className="th">Cobro</th></tr></thead>
                <tbody>
                  {fr.map((i) => {
                    const ch = chargeIds.get(i.id);
                    return (
                      <tr key={i.id} className="border-t border-slate-100">
                        <td className="td whitespace-nowrap">{fmtDate(i.removed_at)}</td>
                        <td className="td"><Link className="font-medium text-brand-700 hover:underline" to={`/admin/clientes/${i.client_id}`}>{names[i.client_id]}</Link></td>
                        <td className="td"><Badge className={BUREAU_COLOR[i.bureau]}>{BUREAU_NAME[i.bureau]}</Badge></td>
                        <td className="td font-medium">{i.name}<div className="text-xs font-normal text-slate-500">{i.account_number || i.item_date || ''}{i.balance != null ? ` · ${money(i.balance)}` : ''}</div></td>
                        <td className="td text-sm">{i.kind === 'cuenta' ? ACCOUNT_CATEGORIES[i.category]?.label : i.kind === 'inquiry' ? 'Inquiry' : PERSONAL_CATEGORIES[i.category]}</td>
                        <td className="td">{ch ? <><Badge className={CHARGE_STATUS[ch.status]?.color}>{CHARGE_STATUS[ch.status]?.label}</Badge> <span className="text-sm font-semibold">{money(ch.amount)}</span></> : <span className="text-xs text-slate-400">sin cobro</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
