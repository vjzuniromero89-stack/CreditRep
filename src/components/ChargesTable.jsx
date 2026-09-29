import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Pencil, Trash2, Plus, Ban } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { CHARGE_STATUS } from '../lib/constants';
import { fmtDate, money, today } from '../lib/format';
import { Badge, Button, Empty, Field, Input, Modal, Select, Textarea, useConfirm, useToast } from './ui';

export default function ChargesTable({ charges, clients = {}, showClient, clientId, onReload }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);

  const pending = charges.filter((c) => c.status === 'pendiente').reduce((s, c) => s + Number(c.amount || 0), 0);
  const paid = charges.filter((c) => c.status === 'pagado').reduce((s, c) => s + Number(c.amount || 0), 0);

  const upd = async (c, patch, msg) => {
    const { error } = await supabase.from('cr_charges').update(patch).eq('id', c.id);
    if (error) toast(error.message, 'error'); else { toast(msg); onReload(); }
  };
  const del = async (c) => {
    if (!(await confirm({ title: 'Borrar cobro', message: `¿Borrar el cobro "${c.description}"?`, ok: 'Borrar' }))) return;
    const { error } = await supabase.from('cr_charges').delete().eq('id', c.id);
    if (error) toast(error.message, 'error'); else { toast('Cobro borrado'); onReload(); }
  };
  const save = async () => {
    setBusy(true);
    const row = { description: edit.description, amount: Number(edit.amount || 0), status: edit.status, paid_at: edit.status === 'pagado' ? (edit.paid_at || today()) : null, method: edit.method || null, notes: edit.notes || null };
    const q = edit.id ? supabase.from('cr_charges').update(row).eq('id', edit.id) : supabase.from('cr_charges').insert({ ...row, client_id: clientId });
    const { error } = await q;
    setBusy(false);
    if (error) toast(error.message, 'error'); else { toast('Guardado'); setEdit(null); onReload(); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Pendiente: <b>{money(pending)}</b></div>
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">Cobrado: <b>{money(paid)}</b></div>
        {clientId && <Button size="sm" variant="secondary" icon={Plus} className="ml-auto" onClick={() => setEdit({ description: '', amount: '', status: 'pendiente' })}>Agregar cobro</Button>}
      </div>
      {!charges.length ? <Empty title="No hay cobros">Los cobros se crean solos cuando un reporte nuevo muestra que una cuenta fue eliminada.</Empty> : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[640px]">
            <thead className="bg-slate-50"><tr>
              <th className="th">Fecha</th>{showClient && <th className="th">Cliente</th>}<th className="th">Descripción</th><th className="th text-right">Monto</th><th className="th">Estado</th><th className="th w-36" />
            </tr></thead>
            <tbody>
              {charges.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="td whitespace-nowrap">{fmtDate(c.created_at)}</td>
                  {showClient && <td className="td"><Link className="font-medium text-brand-700 hover:underline" to={`/admin/clientes/${c.client_id}`}>{clients[c.client_id] || '—'}</Link></td>}
                  <td className="td">{c.description}{c.notes && <div className="text-xs text-slate-500">{c.notes}</div>}</td>
                  <td className="td text-right font-semibold">{money(c.amount)}</td>
                  <td className="td"><Badge className={CHARGE_STATUS[c.status]?.color}>{CHARGE_STATUS[c.status]?.label}</Badge>{c.paid_at && <div className="text-[11px] text-slate-500">{fmtDate(c.paid_at)} {c.method || ''}</div>}</td>
                  <td className="td">
                    <div className="flex justify-end gap-0.5">
                      {c.status === 'pendiente' && <Button size="sm" variant="success" icon={CheckCircle2} onClick={() => upd(c, { status: 'pagado', paid_at: today() }, 'Marcado como pagado')}>Pagado</Button>}
                      {c.status === 'pendiente' && <button title="Anular" className="rounded p-1 text-slate-400 hover:bg-slate-100" onClick={() => upd(c, { status: 'anulado' }, 'Cobro anulado')}><Ban className="h-4 w-4" /></button>}
                      <button title="Editar" className="rounded p-1 text-slate-400 hover:bg-slate-100" onClick={() => setEdit({ ...c })}><Pencil className="h-4 w-4" /></button>
                      <button title="Borrar" className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => del(c)}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar cobro' : 'Nuevo cobro'} size="sm"
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancelar</Button><Button onClick={save} loading={busy}>Guardar</Button></>}>
        {edit && (
          <div className="space-y-3">
            <Field label="Descripción"><Input value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Monto ($)"><Input type="number" step="0.01" value={edit.amount} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} /></Field>
              <Field label="Estado"><Select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })} options={Object.entries(CHARGE_STATUS).map(([k, x]) => [k, x.label])} /></Field>
              {edit.status === 'pagado' && <Field label="Fecha de pago"><Input type="date" value={edit.paid_at || today()} onChange={(e) => setEdit({ ...edit, paid_at: e.target.value })} /></Field>}
              {edit.status === 'pagado' && <Field label="Método"><Input value={edit.method || ''} onChange={(e) => setEdit({ ...edit, method: e.target.value })} placeholder="Zelle, efectivo…" /></Field>}
            </div>
            <Field label="Notas"><Textarea rows={2} value={edit.notes || ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
