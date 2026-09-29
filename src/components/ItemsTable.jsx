import { useMemo, useState } from 'react';
import { Pencil, Trash2, Mail, Plus, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ACCOUNT_CATEGORIES, BUREAUS, BUREAU_NAME, BUREAU_COLOR, ITEM_STATUS, PERSONAL_CATEGORIES } from '../lib/constants';
import { fmtDate, money } from '../lib/format';
import { feeFor, isBillable } from '../lib/reportDiff';
import { itemLabel } from '../lib/importReport';
import { useAuth } from '../lib/auth';
import { Badge, Button, Empty, Input, Select, useConfirm, useToast, cx } from './ui';

export default function ItemsTable({ items, kind, onEdit, onAdd, onReload, onLetters }) {
  const confirm = useConfirm();
  const toast = useToast();
  const { settings } = useAuth();
  const [q, setQ] = useState('');
  const [bureau, setBureau] = useState('');
  const [cat, setCat] = useState('');
  const [status, setStatus] = useState('');
  const [onlyNeg, setOnlyNeg] = useState(kind === 'cuenta');
  const [sel, setSel] = useState(new Set());

  const rows = useMemo(() => {
    const list = items.filter((i) => i.kind === kind
      && (!bureau || i.bureau === bureau)
      && (!cat || i.category === cat)
      && (!status || i.status === status)
      && (!onlyNeg || kind !== 'cuenta' || i.is_negative)
      && (!q || `${i.name} ${i.account_number || ''} ${i.original_creditor || ''}`.toLowerCase().includes(q.toLowerCase())));
    list.sort((a, b) => (a.name || '').localeCompare(b.name || '') || (a.account_number || '').localeCompare(b.account_number || '') || BUREAUS.indexOf(a.bureau) - BUREAUS.indexOf(b.bureau));
    // grupos (la misma cuenta en varios bureaus)
    let g = 0; let prev = null;
    list.forEach((i) => { const k = `${i.name}|${(i.account_number || '').replace(/\D/g, '').slice(0, 4)}`; if (k !== prev) g++; prev = k; i._g = g; });
    return list;
  }, [items, kind, bureau, cat, status, onlyNeg, q]);

  const toggle = (id) => { const s = new Set(sel); s.has(id) ? s.delete(id) : s.add(id); setSel(s); };
  const allOn = rows.length > 0 && rows.every((r) => sel.has(r.id));

  const bulkStatus = async (st) => {
    if (!st) return;
    const ids = [...sel];
    if (st === 'eliminada') {
      const newly = items.filter((i) => sel.has(i.id) && i.status !== 'eliminada');
      const bill = newly.filter((i) => isBillable(i, settings));
      if (bill.length && (await confirm({ title: 'Crear cobros', danger: false, ok: 'Sí, crear cobros', message: `¿Crear ${bill.length} cobro(s) al cliente por estas eliminaciones?` }))) {
        await supabase.from('cr_charges').insert(bill.map((i) => ({ client_id: i.client_id, item_id: i.id, description: `Eliminación — ${itemLabel(i)}`, amount: feeFor(i, settings), status: 'pendiente' })));
      }
      if (newly.length) await supabase.from('cr_activity').insert(newly.map((i) => ({ client_id: i.client_id, message: `✅ Marcado como eliminado: ${itemLabel(i)}` })));
    }
    const { error } = await supabase.from('cr_items').update({ status: st, removed_at: st === 'eliminada' ? new Date().toISOString().slice(0, 10) : null }).in('id', ids);
    if (error) toast(error.message, 'error'); else { toast(`${ids.length} actualizados`); setSel(new Set()); onReload(); }
  };
  const bulkDelete = async () => {
    const ids = [...sel];
    if (!(await confirm({ title: 'Borrar items', message: `¿Borrar ${ids.length} item(s)? Esto los quita del historial del cliente (no es lo mismo que "Eliminada").`, ok: 'Borrar' }))) return;
    const { error } = await supabase.from('cr_items').delete().in('id', ids);
    if (error) toast(error.message, 'error'); else { toast('Borrados'); setSel(new Set()); onReload(); }
  };
  const delOne = async (i) => {
    if (!(await confirm({ title: 'Borrar item', message: `¿Borrar "${i.name}" (${BUREAU_NAME[i.bureau]})?`, ok: 'Borrar' }))) return;
    const { error } = await supabase.from('cr_items').delete().eq('id', i.id);
    if (error) toast(error.message, 'error'); else { toast('Borrado'); onReload(); }
  };

  const cats = kind === 'cuenta' ? Object.entries(ACCOUNT_CATEGORIES).map(([k, x]) => [k, x.label]) : kind === 'personal' ? Object.entries(PERSONAL_CATEGORIES) : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input className="pl-8" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="w-auto" value={bureau} onChange={(e) => setBureau(e.target.value)} options={BUREAUS.map((b) => [b, BUREAU_NAME[b]])} placeholder="Todos los bureaus" />
        {cats.length > 0 && <Select className="w-auto" value={cat} onChange={(e) => setCat(e.target.value)} options={cats} placeholder="Todas las categorías" />}
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)} options={Object.entries(ITEM_STATUS).map(([k, x]) => [k, x.label])} placeholder="Todos los estados" />
        {kind === 'cuenta' && <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" checked={onlyNeg} onChange={(e) => setOnlyNeg(e.target.checked)} /> Solo negativas</label>}
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="secondary" icon={Plus} onClick={onAdd}>Agregar</Button>
        </div>
      </div>

      {sel.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm">
          <b>{sel.size} seleccionados</b>
          <Button size="sm" icon={Mail} onClick={() => onLetters([...sel])}>Generar cartas</Button>
          <select className="rounded-lg border border-slate-300 px-2 py-1 text-xs" value="" onChange={(e) => bulkStatus(e.target.value)}>
            <option value="">Cambiar estado a…</option>
            {Object.entries(ITEM_STATUS).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}
          </select>
          <Button size="sm" variant="dangerGhost" icon={Trash2} onClick={bulkDelete}>Borrar</Button>
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>Cancelar</Button>
        </div>
      )}

      {!rows.length ? <Empty title="No hay items">Sube un reporte de crédito o agrégalos manualmente.</Empty> : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[720px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="th w-8"><input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(rows.map((r) => r.id)))} /></th>
                <th className="th">Bureau</th>
                <th className="th">{kind === 'personal' ? 'Valor' : kind === 'inquiry' ? 'Compañía' : 'Acreedor'}</th>
                {kind === 'cuenta' && <><th className="th"># Cuenta</th><th className="th">Balance</th><th className="th">Categoría</th><th className="th">Tarde</th></>}
                {kind === 'inquiry' && <th className="th">Fecha</th>}
                {kind === 'personal' && <th className="th">Tipo</th>}
                <th className="th">Estado</th>
                <th className="th w-20" />
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} className={cx('border-t border-slate-100 hover:bg-slate-50', i._g % 2 === 0 && 'bg-slate-50/60', i.status === 'eliminada' && 'text-slate-400')}>
                  <td className="td"><input type="checkbox" checked={sel.has(i.id)} onChange={() => toggle(i.id)} /></td>
                  <td className="td"><Badge className={BUREAU_COLOR[i.bureau]}>{BUREAU_NAME[i.bureau]}</Badge></td>
                  <td className="td">
                    <button className={cx('text-left font-medium hover:underline', i.status === 'eliminada' ? 'line-through' : 'text-slate-900')} onClick={() => onEdit(i)}>{i.name}</button>
                    {i.kind === 'cuenta' && (i.original_creditor || i.payment_status) && <div className="text-xs text-slate-500">{i.original_creditor ? `Orig: ${i.original_creditor}` : i.payment_status}</div>}
                    {i.reappeared && <Badge className="mt-1 bg-red-100 text-red-700 ring-red-200">Reinsertada</Badge>}
                  </td>
                  {kind === 'cuenta' && <>
                    <td className="td font-mono text-xs">{i.account_number || '—'}</td>
                    <td className="td">{money(i.balance)}</td>
                    <td className="td"><Badge className={ACCOUNT_CATEGORIES[i.category]?.color}>{ACCOUNT_CATEGORIES[i.category]?.label || i.category}</Badge></td>
                    <td className="td text-xs">{i.late_30 || i.late_60 || i.late_90 ? `${i.late_30}·${i.late_60}·${i.late_90}` : '—'}</td>
                  </>}
                  {kind === 'inquiry' && <td className="td">{i.item_date || '—'}</td>}
                  {kind === 'personal' && <td className="td text-sm">{PERSONAL_CATEGORIES[i.category]}{i.extra?.tipo === 'anterior' ? ' (anterior)' : ''}</td>}
                  <td className="td">
                    <Badge className={ITEM_STATUS[i.status]?.color}>{ITEM_STATUS[i.status]?.label}</Badge>
                    {i.dispute_round > 0 && <span className="ml-1 text-xs text-slate-500">R{i.dispute_round}</span>}
                    {i.status === 'eliminada' && i.removed_at && <div className="text-[11px] text-emerald-700">{fmtDate(i.removed_at)}</div>}
                  </td>
                  <td className="td">
                    <div className="flex justify-end gap-0.5">
                      <button className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => onEdit(i)} aria-label="Editar"><Pencil className="h-4 w-4" /></button>
                      <button className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => delOne(i)} aria-label="Borrar"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500">{rows.length} registros · Cada cuenta aparece una vez por bureau (TransUnion, Experian, Equifax) porque se disputa por separado en cada uno.</p>
    </div>
  );
}
