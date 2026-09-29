import { useEffect, useState } from 'react';
import { Save, UserPlus, KeyRound } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { callApi } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ACCOUNT_CATEGORIES, BUREAU_NAME } from '../../lib/constants';
import { fmtDate } from '../../lib/format';
import { Button, Card, Field, Input, PageHeader, Spinner, Textarea, useToast } from '../../components/ui';

const FEES = [
  ['fee_coleccion', ACCOUNT_CATEGORIES.coleccion.label], ['fee_charge_off', ACCOUNT_CATEGORIES.charge_off.label],
  ['fee_pagos_tarde', ACCOUNT_CATEGORIES.pagos_tarde.label], ['fee_repo', ACCOUNT_CATEGORIES.repo.label],
  ['fee_registro_publico', ACCOUNT_CATEGORIES.registro_publico.label], ['fee_otro_negativo', ACCOUNT_CATEGORIES.otro_negativo.label],
  ['fee_inquiry', 'Inquiry'], ['fee_personal', 'Info personal (alias, dirección…)'],
];

export default function Settings() {
  const { loadSettings } = useAuth();
  const toast = useToast();
  const [s, setS] = useState(null);
  const [admins, setAdmins] = useState([]);
  const [busy, setBusy] = useState(false);
  const [na, setNa] = useState({ name: '', email: '', password: '' });
  const [pw, setPw] = useState('');

  const load = async () => {
    const [a, b] = await Promise.all([supabase.from('cr_settings').select('*').eq('id', 1).maybeSingle(), supabase.from('cr_admins').select('*').order('created_at')]);
    setS(a.data || { id: 1 }); setAdmins(b.data || []);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setBusy(true);
    const row = { ...s, updated_at: new Date().toISOString() };
    FEES.forEach(([k]) => { row[k] = row[k] === '' || row[k] == null ? 0 : Number(row[k]); });
    const { error } = await supabase.from('cr_settings').upsert(row);
    setBusy(false);
    if (error) toast(error.message, 'error'); else { toast('Configuración guardada'); loadSettings(); }
  };
  const addAdmin = async () => {
    try { await callApi('admin-users', { action: 'add_admin', ...na }); toast('Administrador agregado'); setNa({ name: '', email: '', password: '' }); load(); }
    catch (e) { toast(e.message, 'error'); }
  };
  const changePw = async () => {
    if (pw.length < 8) { toast('Mínimo 8 caracteres', 'error'); return; }
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) toast(error.message, 'error'); else { toast('Contraseña cambiada'); setPw(''); }
  };

  if (!s) return <Spinner />;
  const set = (k) => (e) => setS({ ...s, [k]: e.target.value });
  return (
    <div className="space-y-5">
      <PageHeader title="Configuración" actions={<Button icon={Save} loading={busy} onClick={save}>Guardar</Button>} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Tu empresa">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre de la empresa" className="sm:col-span-2"><Input value={s.company_name || ''} onChange={set('company_name')} /></Field>
            <Field label="Teléfono"><Input value={s.company_phone || ''} onChange={set('company_phone')} /></Field>
            <Field label="Email"><Input value={s.company_email || ''} onChange={set('company_email')} /></Field>
            <Field label="Dirección" className="sm:col-span-2"><Textarea rows={2} value={s.company_address || ''} onChange={set('company_address')} /></Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={s.allow_public_signup !== false} onChange={(e) => setS({ ...s, allow_public_signup: e.target.checked })} /> Permitir que clientes nuevos se registren solos en <b>/registro</b></label>
          </div>
        </Card>
        <Card title="Precio por cada eliminación ($)">
          <p className="mb-3 text-sm text-slate-500">Cuando un reporte nuevo muestra que algo se eliminó, se crea un cobro con este precio (por bureau). Puedes cambiar el precio de un item en particular al editarlo.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {FEES.map(([k, l]) => <Field key={k} label={l}><Input type="number" step="0.01" min="0" value={s[k] ?? ''} onChange={set(k)} /></Field>)}
          </div>
        </Card>
        <Card title="Direcciones de los bureaus (para las cartas)">
          <div className="grid gap-3 sm:grid-cols-3">
            {['tu', 'ex', 'eq'].map((b) => <Field key={b} label={BUREAU_NAME[b.toUpperCase()]}><Textarea rows={4} value={s[`address_${b}`] || ''} onChange={set(`address_${b}`)} /></Field>)}
          </div>
          <p className="mt-2 text-xs text-slate-500">La primera línea es el nombre del destinatario. Verifica las direcciones vigentes en la página de cada bureau.</p>
        </Card>
        <Card title="Administradores">
          <ul className="mb-4 divide-y divide-slate-100 text-sm">
            {admins.map((a) => <li key={a.user_id} className="flex justify-between py-2"><span className="font-medium">{a.name || '—'} <span className="font-normal text-slate-500">{a.email}</span></span><span className="text-xs text-slate-400">{fmtDate(a.created_at)}</span></li>)}
          </ul>
          <div className="grid gap-2 sm:grid-cols-3">
            <Input placeholder="Nombre" value={na.name} onChange={(e) => setNa({ ...na, name: e.target.value })} />
            <Input placeholder="Email" type="email" value={na.email} onChange={(e) => setNa({ ...na, email: e.target.value })} />
            <Input placeholder="Contraseña" value={na.password} onChange={(e) => setNa({ ...na, password: e.target.value })} />
          </div>
          <Button size="sm" variant="secondary" icon={UserPlus} className="mt-2" onClick={addAdmin}>Agregar administrador</Button>
          <div className="mt-5 flex gap-2 border-t border-slate-100 pt-4">
            <Input type="password" placeholder="Nueva contraseña para tu cuenta" value={pw} onChange={(e) => setPw(e.target.value)} />
            <Button variant="secondary" icon={KeyRound} onClick={changePw}>Cambiar</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
