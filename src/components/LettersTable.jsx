import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Printer, Send, Trash2, Package } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { BUREAU_COLOR, BUREAU_NAME, LETTER_STATUS } from '../lib/constants';
import { fmtDate, today } from '../lib/format';
import { Badge, Button, Empty, Field, Input, Modal, Select, Textarea, useConfirm, useToast } from './ui';

export default function LettersTable({ letters, clients = {}, showClient, onReload }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [sel, setSel] = useState(new Set());
  const [edit, setEdit] = useState(null);

  const print = (ids) => window.open(`/admin/imprimir?ids=${ids.join(',')}`, '_blank');
  const del = async (ids) => {
    if (!(await confirm({ title: 'Borrar cartas', message: `¿Borrar ${ids.length} carta(s)?`, ok: 'Borrar' }))) return;
    const { error } = await supabase.from('cr_letters').delete().in('id', ids);
    if (error) toast(error.message, 'error'); else { toast('Cartas borradas'); setSel(new Set()); onReload(); }
  };
  const save = async () => {
    const { error } = await supabase.from('cr_letters').update({ status: edit.status, sent_at: edit.sent_at || null, tracking_number: edit.tracking_number || null, response_notes: edit.response_notes || null }).eq('id', edit.id);
    if (error) toast(error.message, 'error'); else { toast('Guardado'); setEdit(null); onReload(); }
  };
  const toggle = (id) => { const s = new Set(sel); s.has(id) ? s.delete(id) : s.add(id); setSel(s); };

  if (!letters.length) return <Empty title="No hay cartas todavía">Genera cartas desde la ficha del cliente (pestaña Cuentas → seleccionar → Generar cartas).</Empty>;
  return (
    <div className="space-y-3">
      {sel.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm">
          <b>{sel.size} seleccionadas</b>
          <Button size="sm" icon={Printer} onClick={() => print([...sel])}>Imprimir</Button>
          <Button size="sm" variant="secondary" icon={Send} onClick={async () => { await supabase.from('cr_letters').update({ status: 'enviada', sent_at: today() }).in('id', [...sel]); toast('Marcadas como enviadas'); setSel(new Set()); onReload(); }}>Marcar enviadas</Button>
          <Button size="sm" variant="dangerGhost" icon={Trash2} onClick={() => del([...sel])}>Borrar</Button>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[720px]">
          <thead className="bg-slate-50"><tr>
            <th className="th w-8" /><th className="th">Fecha</th>{showClient && <th className="th">Cliente</th>}<th className="th">Plantilla</th><th className="th">Para</th><th className="th">Items</th><th className="th">Estado</th><th className="th w-28" />
          </tr></thead>
          <tbody>
            {letters.map((l) => (
              <tr key={l.id} className="border-t border-slate-100">
                <td className="td"><input type="checkbox" checked={sel.has(l.id)} onChange={() => toggle(l.id)} /></td>
                <td className="td whitespace-nowrap">{fmtDate(l.created_at)}</td>
                {showClient && <td className="td"><Link className="font-medium text-brand-700 hover:underline" to={`/admin/clientes/${l.client_id}`}>{clients[l.client_id] || '—'}</Link></td>}
                <td className="td">{l.template_name}{l.round ? <span className="ml-1 text-xs text-slate-500">R{l.round}</span> : null}{l.package_id && <div className="text-[11px] text-violet-600">Paquete · #{l.packet_order}</div>}</td>
                <td className="td">{l.bureau ? <Badge className={BUREAU_COLOR[l.bureau]}>{BUREAU_NAME[l.bureau]}</Badge> : <span className="text-sm">{l.recipient_name}</span>}</td>
                <td className="td">{l.item_ids?.length || 0}</td>
                <td className="td">
                  <button onClick={() => setEdit({ ...l })}><Badge className={LETTER_STATUS[l.status]?.color}>{LETTER_STATUS[l.status]?.label}</Badge></button>
                  {l.sent_at && <div className="text-[11px] text-slate-500">Enviada {fmtDate(l.sent_at)}{l.tracking_number ? ` · #${l.tracking_number}` : ''}</div>}
                </td>
                <td className="td">
                  <div className="flex justify-end gap-0.5">
                    {l.package_id && <button title="Imprimir paquete completo" className="rounded p-1 text-violet-500 hover:bg-violet-50" onClick={() => window.open(`/admin/imprimir?package=${l.package_id}`, '_blank')}><Package className="h-4 w-4" /></button>}
                    <button title="Imprimir" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => print([l.id])}><Printer className="h-4 w-4" /></button>
                    <button title="Envío" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => setEdit({ ...l, status: l.status === 'generada' ? 'enviada' : l.status, sent_at: l.sent_at || today() })}><Send className="h-4 w-4" /></button>
                    <button title="Borrar" className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => del([l.id])}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title="Seguimiento de la carta" size="sm"
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancelar</Button><Button onClick={save}>Guardar</Button></>}>
        {edit && (
          <div className="space-y-3">
            <Field label="Estado"><Select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })} options={Object.entries(LETTER_STATUS).map(([k, x]) => [k, x.label])} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fecha de envío"><Input type="date" value={edit.sent_at || ''} onChange={(e) => setEdit({ ...edit, sent_at: e.target.value })} /></Field>
              <Field label="# Tracking (certified mail)"><Input value={edit.tracking_number || ''} onChange={(e) => setEdit({ ...edit, tracking_number: e.target.value })} /></Field>
            </div>
            <Field label="Notas / respuesta del bureau"><Textarea rows={3} value={edit.response_notes || ''} onChange={(e) => setEdit({ ...edit, response_notes: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
