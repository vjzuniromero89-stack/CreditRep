import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileUp, Mail, KeyRound, Trash2, Save, User, CreditCard, Search as SearchIcon, IdCard, FolderOpen, FileText, DollarSign, History, LayoutGrid, Download, TrendingUp, TrendingDown, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { callApi } from '../../lib/api';
import { ACCOUNT_CATEGORIES, BUREAUS, BUREAU_NAME, CLIENT_STATUS } from '../../lib/constants';
import { fmtDate, fullName, maskSSN, money } from '../../lib/format';
import { Badge, Button, Card, Field, Input, Select, Spinner, Tabs, Textarea, useConfirm, useToast, cx } from '../../components/ui';
import ClientForm from '../../components/ClientForm';
import DocManager from '../../components/DocManager';
import ItemsTable from '../../components/ItemsTable';
import ItemForm from '../../components/ItemForm';
import ImportReport from '../../components/ImportReport';
import LetterWizard from '../../components/LetterWizard';
import ChargesTable from '../../components/ChargesTable';
import LettersTable from '../../components/LettersTable';
import CredentialsModal from '../../components/CredentialsModal';

export default function ClientDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState('resumen');
  const [client, setClient] = useState(null);
  const [form, setForm] = useState(null);
  const [items, setItems] = useState([]);
  const [reports, setReports] = useState([]);
  const [letters, setLetters] = useState([]);
  const [charges, setCharges] = useState([]);
  const [activity, setActivity] = useState([]);
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [letterOpen, setLetterOpen] = useState(false);
  const [letterPre, setLetterPre] = useState([]);
  const [editItem, setEditItem] = useState(null);
  const [newKind, setNewKind] = useState(null);
  const [creds, setCreds] = useState(null);
  const [busyCred, setBusyCred] = useState(false);

  const loadClient = useCallback(async () => {
    const { data, error } = await supabase.from('cr_clients').select('*').eq('id', id).maybeSingle();
    if (error || !data) { toast('Cliente no encontrado', 'error'); nav('/admin/clientes'); return; }
    setClient(data); setForm(data);
    if (!data.reviewed) await supabase.from('cr_clients').update({ reviewed: true }).eq('id', id);
  }, [id]); // eslint-disable-line
  const loadItems = useCallback(async () => {
    const { data } = await supabase.from('cr_items').select('*').eq('client_id', id).order('name');
    setItems(data || []);
  }, [id]);
  const loadRest = useCallback(async () => {
    const [r, l, c, a] = await Promise.all([
      supabase.from('cr_reports').select('*').eq('client_id', id).order('created_at', { ascending: false }),
      supabase.from('cr_letters').select('*').eq('client_id', id).order('created_at', { ascending: false }),
      supabase.from('cr_charges').select('*').eq('client_id', id).order('created_at', { ascending: false }),
      supabase.from('cr_activity').select('*').eq('client_id', id).order('created_at', { ascending: false }).limit(200),
    ]);
    setReports(r.data || []); setLetters(l.data || []); setCharges(c.data || []); setActivity(a.data || []);
  }, [id]);
  const reloadAll = useCallback(() => { loadClient(); loadItems(); loadRest(); }, [loadClient, loadItems, loadRest]);
  useEffect(() => { reloadAll(); }, [reloadAll]);

  const stats = useMemo(() => {
    const neg = items.filter((i) => i.kind === 'cuenta' && i.is_negative);
    const by = (arr, f) => arr.filter(f).length;
    const table = {};
    Object.keys(ACCOUNT_CATEGORIES).filter((k) => k !== 'positiva').forEach((cat) => {
      table[cat] = {};
      BUREAUS.forEach((b) => { table[cat][b] = by(neg, (i) => i.category === cat && i.bureau === b && i.status !== 'eliminada'); });
    });
    const inq = {}; const pers = {};
    BUREAUS.forEach((b) => {
      inq[b] = by(items, (i) => i.kind === 'inquiry' && i.bureau === b && i.status !== 'eliminada');
      pers[b] = by(items, (i) => i.kind === 'personal' && i.bureau === b && i.status !== 'eliminada' && ['alias', 'direccion', 'telefono', 'empleador'].includes(i.category));
    });
    return {
      activeNeg: by(neg, (i) => i.status !== 'eliminada'),
      disputing: by(items, (i) => i.status === 'en_disputa'),
      removed: by(items, (i) => i.status === 'eliminada'),
      removedNeg: by(items, (i) => i.status === 'eliminada' && (i.kind !== 'cuenta' || i.is_negative)),
      pending: charges.filter((c) => c.status === 'pendiente').reduce((s, c) => s + Number(c.amount || 0), 0),
      table, inq, pers,
    };
  }, [items, charges]);

  if (!client || !form) return <Spinner />;

  const save = async () => {
    setSaving(true);
    const row = { ...form };
    ['id', 'client_no', 'created_at', 'updated_at', 'user_id', 'username'].forEach((k) => delete row[k]);
    if (!row.dob) row.dob = null;
    if (row.monthly_fee === '') row.monthly_fee = null;
    if (!row.start_date) row.start_date = null;
    const { error } = await supabase.from('cr_clients').update(row).eq('id', id);
    setSaving(false);
    if (error) toast(error.message, 'error'); else { toast('Cliente guardado'); loadClient(); }
  };

  const deleteClient = async () => {
    if (!(await confirm({ title: 'Borrar cliente', message: `Se borrará ${fullName(client)} con TODO su historial: reportes, cuentas, cartas, cobros, documentos y su acceso al portal. No se puede deshacer.`, ok: 'Borrar cliente' }))) return;
    try { await callApi('admin-users', { action: 'delete_client', client_id: id }); toast('Cliente borrado'); nav('/admin/clientes'); }
    catch (e) { toast(e.message, 'error'); }
  };

  const access = async () => {
    setBusyCred(true);
    try {
      const r = await callApi('admin-users', { action: client.user_id ? 'reset_password' : 'create_login', client_id: id });
      setCreds(r); loadClient();
    } catch (e) { toast(e.message, 'error'); }
    setBusyCred(false);
  };

  const deleteReport = async (r) => {
    if (!(await confirm({ title: 'Borrar reporte', message: 'Se borra el registro del reporte y su archivo. Las cuentas guardadas se quedan.', ok: 'Borrar' }))) return;
    if (r.file_path) await supabase.storage.from('cr-files').remove([r.file_path]);
    const { error } = await supabase.from('cr_reports').delete().eq('id', r.id);
    if (error) toast(error.message, 'error'); else { toast('Reporte borrado'); loadRest(); }
  };
  const downloadReport = async (r) => {
    const { data } = await supabase.storage.from('cr-files').createSignedUrl(r.file_path, 600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  const latest = reports[0]; const prev = reports[1];
  const count = (k) => items.filter((i) => i.kind === k && (k !== 'cuenta' || i.is_negative) && i.status !== 'eliminada').length;

  const tabs = [
    { id: 'resumen', label: 'Resumen', icon: LayoutGrid },
    { id: 'cuentas', label: 'Cuentas', icon: CreditCard, count: count('cuenta') },
    { id: 'inquiries', label: 'Inquiries', icon: SearchIcon, count: count('inquiry') },
    { id: 'personal', label: 'Info del reporte', icon: IdCard, count: count('personal') },
    { id: 'datos', label: 'Datos del cliente', icon: User },
    { id: 'docs', label: 'Documentos', icon: FolderOpen },
    { id: 'reportes', label: 'Reportes', icon: FileText, count: reports.length },
    { id: 'cartas', label: 'Cartas', icon: Mail, count: letters.length },
    { id: 'cobros', label: 'Cobros', icon: DollarSign, count: charges.filter((c) => c.status === 'pendiente').length },
    { id: 'historial', label: 'Historial', icon: History },
  ];

  return (
    <div className="space-y-5">
      <Link to="/admin/clientes" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Clientes</Link>

      <div className="card flex flex-wrap items-center gap-4 p-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-xl font-bold text-brand-800">
          {(client.first_name || '?')[0]}{(client.last_name || '')[0]}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{fullName(client)}</h1>
            <Badge className={CLIENT_STATUS[client.status]?.color}>{CLIENT_STATUS[client.status]?.label}</Badge>
            {client.source === 'portal' && <Badge className="bg-violet-100 text-violet-800 ring-violet-200">Registro del portal</Badge>}
            {!client.intake_completed && <Badge className="bg-amber-100 text-amber-800 ring-amber-200">Info incompleta</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
            <span>#{client.client_no}</span>
            <span>SSN {maskSSN(client.ssn)}</span>
            {client.phone && <span>{client.phone}</span>}
            {client.username ? <span>Usuario: <b className="text-slate-700">{client.username}</b></span> : <span>Sin acceso al portal</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={FileUp} onClick={() => setImportOpen(true)}>Subir reporte</Button>
          <Button variant="secondary" icon={Mail} onClick={() => { setLetterPre([]); setLetterOpen(true); }}>Generar cartas</Button>
          <Button variant="secondary" icon={KeyRound} loading={busyCred} onClick={access}>{client.user_id ? 'Nueva contraseña' : 'Crear acceso'}</Button>
        </div>
      </div>

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'resumen' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <div className="grid gap-3 sm:grid-cols-4">
              <MiniStat label="Negativas activas" value={stats.activeNeg} tone="red" />
              <MiniStat label="En disputa" value={stats.disputing} tone="blue" />
              <MiniStat label="Eliminadas" value={stats.removedNeg} tone="green" />
              <MiniStat label="Por cobrar" value={money(stats.pending)} tone="amber" />
            </div>
            <Card title="Scores" actions={latest && <span className="text-xs text-slate-500">Reporte del {fmtDate(latest.report_date)}</span>}>
              {!latest ? <p className="text-sm text-slate-500">Todavía no hay reportes. <button className="font-semibold text-brand-700" onClick={() => setImportOpen(true)}>Subir el primero</button></p> : (
                <div className="grid grid-cols-3 gap-3">
                  {BUREAUS.map((b) => {
                    const s = latest[`score_${b.toLowerCase()}`]; const p = prev?.[`score_${b.toLowerCase()}`];
                    const d = s != null && p != null ? s - p : null;
                    return (
                      <div key={b} className="rounded-xl border border-slate-200 p-3 text-center">
                        <div className="text-xs font-medium text-slate-500">{BUREAU_NAME[b]}</div>
                        <div className="text-3xl font-bold text-slate-900">{s ?? '—'}</div>
                        {d != null && d !== 0 && <div className={cx('inline-flex items-center gap-1 text-xs font-semibold', d > 0 ? 'text-emerald-600' : 'text-red-600')}>{d > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{d > 0 ? '+' : ''}{d}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
            <Card title="Negativos activos por bureau" bodyClass="p-0">
              <table className="w-full">
                <thead className="bg-slate-50"><tr><th className="th">Tipo</th>{BUREAUS.map((b) => <th key={b} className="th text-center">{BUREAU_NAME[b]}</th>)}<th className="th text-center">Total</th></tr></thead>
                <tbody>
                  {Object.entries(stats.table).map(([cat, row]) => (
                    <tr key={cat} className="border-t border-slate-100">
                      <td className="td"><Badge className={ACCOUNT_CATEGORIES[cat].color}>{ACCOUNT_CATEGORIES[cat].label}</Badge></td>
                      {BUREAUS.map((b) => <td key={b} className="td text-center font-semibold">{row[b] || <span className="text-slate-300">0</span>}</td>)}
                      <td className="td text-center font-bold">{BUREAUS.reduce((s, b) => s + row[b], 0)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-100"><td className="td"><Badge>Inquiries</Badge></td>{BUREAUS.map((b) => <td key={b} className="td text-center font-semibold">{stats.inq[b]}</td>)}<td className="td text-center font-bold">{BUREAUS.reduce((s, b) => s + stats.inq[b], 0)}</td></tr>
                  <tr className="border-t border-slate-100"><td className="td"><Badge>Alias / direcciones / tel. / empleos</Badge></td>{BUREAUS.map((b) => <td key={b} className="td text-center font-semibold">{stats.pers[b]}</td>)}<td className="td text-center font-bold">{BUREAUS.reduce((s, b) => s + stats.pers[b], 0)}</td></tr>
                </tbody>
              </table>
            </Card>
          </div>
          <Card title="Actividad reciente" bodyClass="max-h-[520px] overflow-auto p-4">
            <ActivityList list={activity.slice(0, 25)} />
          </Card>
        </div>
      )}

      {tab === 'cuentas' && <ItemsTable items={items} kind="cuenta" onEdit={setEditItem} onAdd={() => setNewKind('cuenta')} onReload={loadItems} onLetters={(ids) => { setLetterPre(ids); setLetterOpen(true); }} />}
      {tab === 'inquiries' && <ItemsTable items={items} kind="inquiry" onEdit={setEditItem} onAdd={() => setNewKind('inquiry')} onReload={loadItems} onLetters={(ids) => { setLetterPre(ids); setLetterOpen(true); }} />}
      {tab === 'personal' && <ItemsTable items={items} kind="personal" onEdit={setEditItem} onAdd={() => setNewKind('personal')} onReload={loadItems} onLetters={(ids) => { setLetterPre(ids); setLetterOpen(true); }} />}

      {tab === 'datos' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card title="Información personal" className="lg:col-span-2">
            <ClientForm value={form} onChange={setForm} />
          </Card>
          <div className="space-y-5">
            <Card title="Servicio">
              <div className="space-y-3">
                <Field label="Estado del cliente"><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} options={Object.entries(CLIENT_STATUS).map(([k, x]) => [k, x.label])} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Fecha de inicio"><Input type="date" value={form.start_date || ''} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></Field>
                  <Field label="Pago mensual ($)"><Input type="number" step="0.01" value={form.monthly_fee ?? ''} onChange={(e) => setForm({ ...form, monthly_fee: e.target.value })} /></Field>
                </div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.intake_completed} onChange={(e) => setForm({ ...form, intake_completed: e.target.checked })} /> Información completa</label>
                <Field label="Notas internas"><Textarea rows={4} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
              </div>
            </Card>
            <div className="flex flex-wrap gap-2">
              <Button icon={Save} loading={saving} onClick={save} className="flex-1">Guardar cambios</Button>
              <Button variant="dangerGhost" icon={Trash2} onClick={deleteClient}>Borrar cliente</Button>
            </div>
          </div>
        </div>
      )}

      {tab === 'docs' && <Card title="Licencia, bill y otros documentos"><DocManager clientId={id} uploadedBy="admin" /></Card>}

      {tab === 'reportes' && (
        <Card title="Reportes de crédito subidos" actions={<Button size="sm" icon={FileUp} onClick={() => setImportOpen(true)}>Subir reporte</Button>} bodyClass="p-0">
          {!reports.length ? <p className="p-6 text-sm text-slate-500">No hay reportes.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead className="bg-slate-50"><tr><th className="th">Fecha</th><th className="th">Proveedor</th><th className="th text-center">TU</th><th className="th text-center">EX</th><th className="th text-center">EQ</th><th className="th">Contenido</th><th className="th w-24" /></tr></thead>
                <tbody>
                  {reports.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="td">{fmtDate(r.report_date)}<div className="text-[11px] text-slate-400">subido {fmtDate(r.created_at)}</div></td>
                      <td className="td">{r.provider}</td>
                      <td className="td text-center font-semibold">{r.score_tu ?? '—'}</td>
                      <td className="td text-center font-semibold">{r.score_ex ?? '—'}</td>
                      <td className="td text-center font-semibold">{r.score_eq ?? '—'}</td>
                      <td className="td text-xs text-slate-500">{r.summary?.counts ? `${r.summary.counts.cuentas} cuentas (${r.summary.counts.negativas} neg.) · ${r.summary.counts.inquiries} inquiries` : ''}</td>
                      <td className="td"><div className="flex justify-end gap-0.5">
                        {r.file_path && <button title="Descargar" className="rounded p-1 text-slate-400 hover:bg-slate-100" onClick={() => downloadReport(r)}><Download className="h-4 w-4" /></button>}
                        <button title="Borrar" className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => deleteReport(r)}><Trash2 className="h-4 w-4" /></button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'cartas' && <LettersTable letters={letters} onReload={loadRest} />}
      {tab === 'cobros' && <ChargesTable charges={charges} clientId={id} onReload={loadRest} />}
      {tab === 'historial' && <Card><ActivityList list={activity} /></Card>}

      <ImportReport open={importOpen} onClose={() => setImportOpen(false)} client={client} onDone={reloadAll} />
      <LetterWizard open={letterOpen} onClose={() => setLetterOpen(false)} client={client} items={items} preselect={letterPre} onDone={() => { loadItems(); loadRest(); }} />
      <ItemForm open={!!editItem || !!newKind} onClose={() => { setEditItem(null); setNewKind(null); }} item={editItem} kind={editItem?.kind || newKind || 'cuenta'} clientId={id} onSaved={() => { loadItems(); loadRest(); }} />
      <CredentialsModal open={!!creds} onClose={() => setCreds(null)} creds={creds} clientName={client.first_name} />
    </div>
  );
}

function MiniStat({ label, value, tone }) {
  const t = { red: 'text-red-700 bg-red-50 border-red-100', blue: 'text-blue-700 bg-blue-50 border-blue-100', green: 'text-emerald-700 bg-emerald-50 border-emerald-100', amber: 'text-amber-700 bg-amber-50 border-amber-100' }[tone];
  return <div className={cx('rounded-xl border p-3', t)}><div className="text-xs font-semibold uppercase tracking-wide opacity-75">{label}</div><div className="text-2xl font-bold">{value}</div></div>;
}

export function ActivityList({ list }) {
  if (!list.length) return <p className="text-sm text-slate-500">Sin actividad.</p>;
  return (
    <ol className="space-y-3">
      {list.map((a) => (
        <li key={a.id} className="flex gap-3 text-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
          <div><div className="text-slate-700">{a.message}</div><div className="text-xs text-slate-400">{new Date(a.created_at).toLocaleString('es-US')}</div></div>
        </li>
      ))}
    </ol>
  );
}
