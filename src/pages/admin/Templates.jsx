import { useEffect, useRef, useState } from 'react';
import { Plus, Copy, Trash2, Save, Eye } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { PLACEHOLDERS, renderLetter, bureauRecipient } from '../../lib/letters';
import { Badge, Button, Card, Field, Input, PageHeader, Select, Spinner, Textarea, useConfirm, useToast, cx } from '../../components/ui';

const SAMPLE_CLIENT = { first_name: 'Juan', middle_name: 'Carlos', last_name: 'Pérez', address: '123 Main St', address2: 'Apt 4', city: 'Wilmington', state: 'DE', zip: '19801', dob: '1989-01-15', ssn: '123-45-6789', phone: '(302) 555-1212', email: 'juan@email.com' };
const SAMPLE_ITEMS = [
  { id: 'a', kind: 'cuenta', name: 'MIDLAND CREDIT MGMT', account_number: '8547****', balance: 1245, original_creditor: 'COMENITY BANK' },
  { id: 'b', kind: 'cuenta', name: 'CAPITAL ONE', account_number: '517805******', balance: 845, late_30: 1, late_60: 1 },
];

export default function Templates() {
  const { settings } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState(null);
  const [cur, setCur] = useState(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const ta = useRef(null);

  const load = async (selectId) => {
    const { data } = await supabase.from('cr_templates').select('*').order('round').order('name');
    setList(data || []);
    const pick = (data || []).find((t) => t.id === (selectId || cur?.id)) || data?.[0] || null;
    setCur(pick ? { ...pick } : null);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  const save = async () => {
    setBusy(true);
    const row = { name: cur.name, recipient: cur.recipient, applies_to: cur.applies_to, round: Number(cur.round || 1), default_reason: cur.default_reason, body: cur.body, active: cur.active !== false };
    const res = cur.id ? await supabase.from('cr_templates').update(row).eq('id', cur.id).select().single() : await supabase.from('cr_templates').insert(row).select().single();
    setBusy(false);
    if (res.error) toast(res.error.message, 'error'); else { toast('Plantilla guardada'); load(res.data.id); }
  };
  const del = async () => {
    if (!cur.id) { setCur(list[0] ? { ...list[0] } : null); return; }
    if (!(await confirm({ title: 'Borrar plantilla', message: `¿Borrar "${cur.name}"? Las cartas ya generadas no se afectan.`, ok: 'Borrar' }))) return;
    const { error } = await supabase.from('cr_templates').delete().eq('id', cur.id);
    if (error) toast(error.message, 'error'); else { toast('Plantilla borrada'); setCur(null); load(); }
  };
  const insert = (ph) => {
    const el = ta.current; if (!el) return;
    const s = el.selectionStart; const e = el.selectionEnd;
    const body = cur.body.slice(0, s) + ph + cur.body.slice(e);
    setCur({ ...cur, body });
    setTimeout(() => { el.focus(); el.selectionStart = el.selectionEnd = s + ph.length; }, 0);
  };

  if (!list) return <Spinner />;
  const r = bureauRecipient('EQ', settings);
  return (
    <div>
      <PageHeader title="Plantillas de cartas" subtitle="Edita las cartas que se mandan a los bureaus y acreedores. Usa los campos {{...}} para llenar los datos del cliente automáticamente."
        actions={<Button icon={Plus} onClick={() => setCur({ name: 'Nueva plantilla', recipient: 'bureau', applies_to: 'cuenta', round: 1, body: '', default_reason: '', active: true })}>Nueva plantilla</Button>} />
      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <div className="card divide-y divide-slate-100 self-start">
          {list.map((t) => (
            <button key={t.id} onClick={() => { setCur({ ...t }); setPreview(false); }} className={cx('block w-full px-4 py-3 text-left hover:bg-slate-50', cur?.id === t.id && 'bg-brand-50')}>
              <div className="text-sm font-semibold">{t.name}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                <Badge>{t.recipient === 'bureau' ? 'Bureaus' : 'Acreedor'}</Badge>
                <Badge>R{t.round}</Badge>
                {!t.active && <Badge className="bg-slate-200 text-slate-500 ring-slate-300">Inactiva</Badge>}
              </div>
            </button>
          ))}
        </div>
        {cur && (
          <Card title={cur.id ? 'Editar plantilla' : 'Nueva plantilla'} actions={<>
            <Button size="sm" variant="secondary" icon={Eye} onClick={() => setPreview(!preview)}>{preview ? 'Editar' : 'Vista previa'}</Button>
            {cur.id && <Button size="sm" variant="secondary" icon={Copy} onClick={() => setCur({ ...cur, id: undefined, name: cur.name + ' (copia)' })}>Duplicar</Button>}
            <Button size="sm" variant="dangerGhost" icon={Trash2} onClick={del}>Borrar</Button>
            <Button size="sm" icon={Save} loading={busy} onClick={save}>Guardar</Button>
          </>}>
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Nombre" className="sm:col-span-2"><Input value={cur.name} onChange={(e) => setCur({ ...cur, name: e.target.value })} /></Field>
                <Field label="Se envía a"><Select value={cur.recipient} onChange={(e) => setCur({ ...cur, recipient: e.target.value })} options={[['bureau', 'Bureaus (una por bureau)'], ['acreedor', 'Acreedor / cobrador']]} /></Field>
                <Field label="Ronda"><Input type="number" min="1" value={cur.round} onChange={(e) => setCur({ ...cur, round: e.target.value })} /></Field>
                <Field label="Para disputar"><Select value={cur.applies_to} onChange={(e) => setCur({ ...cur, applies_to: e.target.value })} options={[['cuenta', 'Cuentas'], ['inquiry', 'Inquiries'], ['personal', 'Info personal'], ['todos', 'Todo']]} /></Field>
                <Field label="Razón por defecto" className="sm:col-span-2"><Input value={cur.default_reason || ''} onChange={(e) => setCur({ ...cur, default_reason: e.target.value })} /></Field>
                <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={cur.active !== false} onChange={(e) => setCur({ ...cur, active: e.target.checked })} /> Activa</label>
              </div>
              {preview ? (
                <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-inner">
                  <div className="letter-body" dangerouslySetInnerHTML={{ __html: renderLetter({ template: cur, client: SAMPLE_CLIENT, recipientName: r.name, recipientAddress: r.address, bureau: 'EQ', items: SAMPLE_ITEMS, defaultReason: cur.default_reason, settings }) }} />
                </div>
              ) : (
                <>
                  <div>
                    <span className="label">Campos (clic para insertar)</span>
                    <div className="flex flex-wrap gap-1.5">
                      {PLACEHOLDERS.map(([ph, desc]) => (
                        <button key={ph} title={desc} onClick={() => insert(ph)} className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700 hover:bg-brand-100">{ph}</button>
                      ))}
                    </div>
                  </div>
                  <Textarea ref={ta} rows={22} className="font-mono text-[13px] leading-relaxed" value={cur.body} onChange={(e) => setCur({ ...cur, body: e.target.value })} />
                </>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
