import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, Trash2, UserPlus, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { callApi } from '../../lib/api';
import { CLIENT_STATUS } from '../../lib/constants';
import { fmtDate, fullName, money } from '../../lib/format';
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, Select, Spinner, useConfirm, useToast } from '../../components/ui';
import ClientForm from '../../components/ClientForm';
import CredentialsModal from '../../components/CredentialsModal';

export default function Clients() {
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [clients, setClients] = useState(null);
  const [agg, setAgg] = useState({});
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState({});
  const [withLogin, setWithLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [creds, setCreds] = useState(null);
  const [createdId, setCreatedId] = useState(null);

  const load = async () => {
    const [c, i, ch] = await Promise.all([
      supabase.from('cr_clients').select('*').order('created_at', { ascending: false }),
      supabase.from('cr_items').select('client_id,kind,is_negative,status'),
      supabase.from('cr_charges').select('client_id,amount,status').eq('status', 'pendiente'),
    ]);
    setClients(c.data || []);
    const a = {};
    (i.data || []).forEach((it) => {
      const x = (a[it.client_id] = a[it.client_id] || { neg: 0, removed: 0, pending: 0 });
      const negative = it.kind !== 'cuenta' || it.is_negative;
      if (it.kind === 'cuenta' && it.is_negative && it.status !== 'eliminada') x.neg++;
      if (negative && it.status === 'eliminada') x.removed++;
    });
    (ch.data || []).forEach((c2) => { const x = (a[c2.client_id] = a[c2.client_id] || { neg: 0, removed: 0, pending: 0 }); x.pending += Number(c2.amount || 0); });
    setAgg(a);
  };
  useEffect(() => { load(); }, []);

  const list = useMemo(() => (clients || []).filter((c) => (!status || c.status === status || (status === 'sin_revisar' && !c.reviewed))
    && (!q || `${fullName(c)} ${c.phone || ''} ${c.email || ''} ${c.username || ''} ${c.client_no}`.toLowerCase().includes(q.toLowerCase()))), [clients, q, status]);

  const openNew = () => { setForm({ status: 'activo' }); setUsername(''); setPassword(''); setWithLogin(true); setNewOpen(true); };

  const create = async () => {
    if (!form.first_name || !form.last_name) { toast('Nombre y apellido son obligatorios', 'error'); return; }
    setBusy(true);
    try {
      const r = await callApi('admin-users', { action: 'create_client', client: form, with_login: withLogin, username: username || undefined, password: password || undefined });
      setNewOpen(false);
      toast('Cliente creado');
      if (r.username) { setCreds({ username: r.username, password: r.password }); setCreatedId(r.client.id); }
      else nav(`/admin/clientes/${r.client.id}`);
      load();
    } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };

  const del = async (c) => {
    if (!(await confirm({ title: 'Borrar cliente', message: `¿Borrar a ${fullName(c)} con todo su historial y su acceso al portal? No se puede deshacer.`, ok: 'Borrar' }))) return;
    try { await callApi('admin-users', { action: 'delete_client', client_id: c.id }); toast('Cliente borrado'); load(); } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div>
      <PageHeader title="Clientes" subtitle={clients ? `${clients.length} clientes` : ''} actions={<Button icon={UserPlus} onClick={openNew}>Nuevo cliente</Button>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input className="pl-8" placeholder="Buscar por nombre, teléfono, usuario…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Todos los estados"
          options={[['sin_revisar', '🔔 Registros nuevos sin revisar'], ...Object.entries(CLIENT_STATUS).map(([k, x]) => [k, x.label])]} />
      </div>
      {!clients ? <Spinner /> : !list.length ? (
        <div className="card"><Empty icon={Users} title="No hay clientes">Crea tu primer cliente o comparte el enlace de registro: <b>{window.location.origin}/registro</b></Empty></div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="bg-slate-50"><tr>
              <th className="th">Cliente</th><th className="th">Contacto</th><th className="th">Estado</th><th className="th text-center">Negativas activas</th><th className="th text-center">Eliminadas</th><th className="th text-right">Por cobrar</th><th className="th">Desde</th><th className="th w-10" />
            </tr></thead>
            <tbody>
              {list.map((c) => {
                const a = agg[c.id] || {};
                return (
                  <tr key={c.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => nav(`/admin/clientes/${c.id}`)}>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <Link to={`/admin/clientes/${c.id}`} className="font-semibold text-slate-900 hover:underline" onClick={(e) => e.stopPropagation()}>{fullName(c)}</Link>
                        {!c.reviewed && <Badge className="bg-violet-600 text-white ring-violet-600">Nuevo</Badge>}
                      </div>
                      <div className="text-xs text-slate-500">#{c.client_no}{c.username ? ` · ${c.username}` : ''}{!c.intake_completed ? ' · info incompleta' : ''}</div>
                    </td>
                    <td className="td text-sm">{c.phone || '—'}<div className="text-xs text-slate-500">{c.email}</div></td>
                    <td className="td"><Badge className={CLIENT_STATUS[c.status]?.color}>{CLIENT_STATUS[c.status]?.label}</Badge></td>
                    <td className="td text-center font-semibold text-red-700">{a.neg || 0}</td>
                    <td className="td text-center font-semibold text-emerald-700">{a.removed || 0}</td>
                    <td className="td text-right font-semibold">{a.pending ? money(a.pending) : '—'}</td>
                    <td className="td text-sm">{fmtDate(c.created_at)}</td>
                    <td className="td" onClick={(e) => e.stopPropagation()}>
                      <button className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => del(c)} aria-label="Borrar"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Nuevo cliente" size="lg"
        footer={<><Button variant="secondary" onClick={() => setNewOpen(false)}>Cancelar</Button><Button icon={Plus} loading={busy} onClick={create}>Crear cliente</Button></>}>
        <div className="space-y-5">
          <ClientForm value={form} onChange={setForm} compact />
          <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4">
            <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={withLogin} onChange={(e) => setWithLogin(e.target.checked)} /> Crear usuario y contraseña para el portal del cliente</label>
            {withLogin && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Usuario" hint="Vacío = se crea automático (nombre.apellido)"><Input value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" /></Field>
                <Field label="Contraseña" hint="Vacío = se genera una segura"><Input value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
              </div>
            )}
          </div>
        </div>
      </Modal>
      <CredentialsModal open={!!creds} onClose={() => { setCreds(null); if (createdId) nav(`/admin/clientes/${createdId}`); }} creds={creds} clientName={form.first_name} />
    </div>
  );
}
