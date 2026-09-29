import { useEffect, useState } from 'react';
import { LogOut, ShieldCheck, CheckCircle2, User, FolderOpen, PartyPopper, Mail, AlertOctagon, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { BUREAU_NAME, BUREAU_COLOR, ACCOUNT_CATEGORIES, PERSONAL_CATEGORIES } from '../../lib/constants';
import { fmtDate, fullName } from '../../lib/format';
import { Badge, Button, Card, useToast, cx } from '../../components/ui';
import ClientForm from '../../components/ClientForm';
import DocManager from '../../components/DocManager';

const EDITABLE = ['first_name', 'middle_name', 'last_name', 'suffix', 'dob', 'ssn', 'email', 'phone', 'phone2', 'address', 'address2', 'city', 'state', 'zip', 'prev_address', 'employer'];
const REQUIRED = [['first_name', 'Nombre'], ['last_name', 'Apellido'], ['dob', 'Fecha de nacimiento'], ['ssn', 'Seguro Social'], ['phone', 'Teléfono'], ['address', 'Dirección'], ['city', 'Ciudad'], ['state', 'Estado'], ['zip', 'ZIP']];

export default function Portal() {
  const { client, refreshClient, signOut, settings } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [docs, setDocs] = useState([]);
  const [items, setItems] = useState([]);
  const [letters, setLetters] = useState(0);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => { if (client) setForm(Object.fromEntries(EDITABLE.map((k) => [k, client[k] ?? '']))); }, [client]);
  useEffect(() => {
    if (!client) return;
    supabase.from('cr_items').select('id,kind,category,bureau,name,status,is_negative,removed_at').eq('client_id', client.id).then(({ data }) => setItems(data || []));
    supabase.from('cr_letters').select('id', { count: 'exact', head: true }).eq('client_id', client.id).then(({ count }) => setLetters(count || 0));
  }, [client]);

  if (!client || !form) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  const missing = REQUIRED.filter(([k]) => !String(form[k] || '').trim());
  const ssnOk = String(form.ssn || '').replace(/\D/g, '').length === 9;
  const hasLicense = docs.some((d) => d.doc_type === 'licencia_frente');
  const hasBill = docs.some((d) => d.doc_type === 'bill');

  const save = async (complete) => {
    if (complete) {
      if (missing.length) { toast('Falta: ' + missing.map((m) => m[1]).join(', '), 'error'); return; }
      if (!ssnOk) { toast('El Seguro Social debe tener 9 dígitos', 'error'); return; }
      if (!hasLicense || !hasBill) { toast('Sube la foto de tu licencia (frente) y de un bill', 'error'); return; }
    }
    setBusy(true);
    const row = { ...form };
    if (!row.dob) row.dob = null;
    if (complete) row.intake_completed = true;
    const { error } = await supabase.from('cr_clients').update(row).eq('id', client.id);
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast(complete ? '¡Listo! Recibimos tu información' : 'Guardado');
    setEditing(false);
    refreshClient();
  };

  const removed = items.filter((i) => i.status === 'eliminada' && (i.kind !== 'cuenta' || i.is_negative));
  const disputing = items.filter((i) => i.status === 'en_disputa').length;
  const activeNeg = items.filter((i) => i.kind === 'cuenta' && i.is_negative && i.status !== 'eliminada').length;
  const showForm = !client.intake_completed || editing;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-brand-900 text-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4">
          <div className="rounded-lg bg-emerald-400/20 p-2"><ShieldCheck className="h-5 w-5 text-emerald-300" /></div>
          <div className="flex-1"><div className="font-bold">{settings?.company_name || 'Crédito Pro'}</div><div className="text-xs text-brand-100/70">Portal del cliente</div></div>
          <button onClick={signOut} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-brand-100 hover:bg-white/10"><LogOut className="h-4 w-4" /> Salir</button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
        <div>
          <h1 className="text-2xl font-bold">Hola, {client.first_name || fullName(client)} 👋</h1>
          <p className="text-slate-500">{client.intake_completed ? 'Aquí puedes ver el progreso de tu caso.' : 'Completa estos 2 pasos para empezar tu proceso de reparación de crédito.'}</p>
        </div>

        {!client.intake_completed && (
          <div className="grid grid-cols-2 gap-3">
            <StepBox n={1} icon={User} title="Tu información" done={!missing.length && ssnOk} />
            <StepBox n={2} icon={FolderOpen} title="Licencia y bill" done={hasLicense && hasBill} />
          </div>
        )}

        {client.intake_completed && !editing && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Box tone="green" icon={PartyPopper} label="Eliminados" value={removed.length} />
              <Box tone="blue" icon={Mail} label="En disputa" value={disputing} />
              <Box tone="red" icon={AlertOctagon} label="Negativos pendientes" value={activeNeg} />
              <Box tone="slate" icon={Mail} label="Cartas enviadas" value={letters} />
            </div>
            <Card title="🎉 Lo que hemos eliminado de tu reporte">
              {!removed.length ? <p className="text-sm text-slate-500">Todavía no hay eliminaciones. Estamos trabajando en tus disputas; aquí verás cada cuenta que se elimine.</p> : (
                <ul className="divide-y divide-slate-100">
                  {removed.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      <span className="font-medium">{i.name}</span>
                      <Badge className={BUREAU_COLOR[i.bureau]}>{BUREAU_NAME[i.bureau]}</Badge>
                      <span className="text-slate-500">{i.kind === 'cuenta' ? ACCOUNT_CATEGORIES[i.category]?.label : i.kind === 'inquiry' ? 'Inquiry' : PERSONAL_CATEGORIES[i.category]}</span>
                      <span className="ml-auto text-xs text-slate-400">{fmtDate(i.removed_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon={User} onClick={() => setEditing(true)}>Actualizar mi información</Button>
            </div>
            <Card title="Mis documentos"><DocManager clientId={client.id} uploadedBy="cliente" types={['licencia_frente', 'licencia_atras', 'bill', 'ssn']} onChange={setDocs} /></Card>
          </>
        )}

        {showForm && (
          <>
            <Card title="Paso 1 — Tu información personal">
              <ClientForm value={form} onChange={setForm} showSSNFull />
              <p className="mt-3 text-xs text-slate-500">🔒 Tu información se guarda de forma privada y solo la usa nuestro equipo para tus disputas.</p>
            </Card>
            <Card title="Paso 2 — Foto de tu licencia y de un bill">
              <p className="mb-3 text-sm text-slate-500">Desde el celular toca <b>Tomar foto</b>. El bill (luz, agua, teléfono, banco) debe mostrar tu nombre y dirección actual.</p>
              <DocManager clientId={client.id} uploadedBy="cliente" types={['licencia_frente', 'licencia_atras', 'bill', 'ssn']} onChange={setDocs} highlight={['licencia_frente', 'bill']} />
            </Card>
            <div className="flex flex-wrap justify-end gap-2">
              {editing && <Button variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>}
              <Button variant="secondary" loading={busy} onClick={() => save(false)}>Guardar y seguir después</Button>
              <Button size="lg" variant="success" icon={CheckCircle2} loading={busy} onClick={() => save(true)}>{client.intake_completed ? 'Guardar cambios' : 'Enviar mi información'}</Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function StepBox({ n, title, done, icon: Icon }) {
  return (
    <div className={cx('flex items-center gap-3 rounded-xl border p-3', done ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white')}>
      <div className={cx('flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold', done ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600')}>{done ? <CheckCircle2 className="h-5 w-5" /> : n}</div>
      <div className="flex items-center gap-1.5 text-sm font-semibold"><Icon className="h-4 w-4 text-slate-400" />{title}</div>
    </div>
  );
}
function Box({ label, value, tone, icon: Icon }) {
  const t = { green: 'bg-emerald-50 text-emerald-800 border-emerald-100', blue: 'bg-blue-50 text-blue-800 border-blue-100', red: 'bg-red-50 text-red-800 border-red-100', slate: 'bg-white text-slate-800 border-slate-200' }[tone];
  return <div className={cx('rounded-xl border p-4', t)}><Icon className="mb-1 h-5 w-5 opacity-70" /><div className="text-3xl font-bold">{value}</div><div className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</div></div>;
}
