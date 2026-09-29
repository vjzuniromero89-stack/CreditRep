import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ACCOUNT_CATEGORIES, BUREAUS, BUREAU_NAME, ITEM_STATUS, PERSONAL_CATEGORIES } from '../lib/constants';
import { matchKey } from '../lib/parser/parse';
import { feeFor } from '../lib/reportDiff';
import { itemLabel } from '../lib/importReport';
import { today } from '../lib/format';
import { useAuth } from '../lib/auth';
import { Button, Field, Input, Modal, Select, Textarea, useToast, cx } from './ui';

const NUM = ['balance', 'past_due', 'high_credit', 'credit_limit', 'monthly_payment', 'fee'];
const INT = ['late_30', 'late_60', 'late_90', 'dispute_round'];

export default function ItemForm({ open, onClose, item, kind: kind0 = 'cuenta', clientId, onSaved }) {
  const { settings } = useAuth();
  const toast = useToast();
  const isNew = !item?.id;
  const [f, setF] = useState({});
  const [bureaus, setBureaus] = useState(['TU', 'EX', 'EQ']);
  const [makeCharge, setMakeCharge] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setF(item ? { ...item } : { kind: kind0, category: kind0 === 'cuenta' ? 'coleccion' : kind0 === 'personal' ? 'direccion' : 'inquiry', status: 'activa', dispute_round: 0 });
    setBureaus(item?.bureau ? [item.bureau] : ['TU', 'EX', 'EQ']);
    setMakeCharge(true);
  }, [open, item, kind0]);

  const kind = f.kind || kind0;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const v = (k) => f[k] ?? '';

  const save = async () => {
    if (!f.name?.trim()) { toast('Escribe el nombre / valor', 'error'); return; }
    if (isNew && !bureaus.length) { toast('Escoge al menos un bureau', 'error'); return; }
    setBusy(true);
    try {
      const row = { ...f };
      NUM.forEach((k) => { row[k] = row[k] === '' || row[k] == null ? null : Number(row[k]); });
      INT.forEach((k) => { row[k] = row[k] === '' || row[k] == null ? 0 : parseInt(row[k], 10); });
      if (kind === 'cuenta') row.is_negative = row.category !== 'positiva';
      else row.is_negative = kind === 'inquiry';
      if (kind === 'inquiry') row.category = 'inquiry';
      if (item && item.category !== row.category) row.extra = { ...(row.extra || {}), manual_category: true };
      ['id', 'created_at', 'updated_at', 'client_no'].forEach((k) => delete row[k]);
      const becameRemoved = row.status === 'eliminada' && item?.status !== 'eliminada';
      if (becameRemoved && !row.removed_at) row.removed_at = today();
      if (row.status !== 'eliminada') { row.removed_at = null; }

      if (isNew) {
        const rows = bureaus.map((b) => {
          const r = { ...row, kind, bureau: b, client_id: clientId };
          r.match_key = matchKey(kind, r);
          return r;
        });
        const { data, error } = await supabase.from('cr_items').insert(rows).select();
        if (error) throw error;
        if (becameRemoved && makeCharge) await createCharges(data);
        toast(rows.length > 1 ? `Se crearon ${rows.length} items (uno por bureau)` : 'Guardado');
      } else {
        row.match_key = matchKey(kind, row);
        const { error } = await supabase.from('cr_items').update(row).eq('id', item.id);
        if (error) throw error;
        if (becameRemoved) {
          await supabase.from('cr_activity').insert({ client_id: clientId, message: `✅ Marcado como eliminado: ${itemLabel({ ...row, kind })}` });
          if (makeCharge) await createCharges([{ ...row, id: item.id, kind }]);
        }
        toast('Cambios guardados');
      }
      onSaved?.();
      onClose();
    } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };

  const createCharges = async (items) => {
    const rows = items.map((it) => ({ client_id: clientId, item_id: it.id, description: `Eliminación — ${itemLabel(it)}`, amount: feeFor(it, settings), status: 'pendiente' }));
    await supabase.from('cr_charges').insert(rows);
  };

  const title = `${isNew ? 'Agregar' : 'Editar'} ${kind === 'cuenta' ? 'cuenta' : kind === 'inquiry' ? 'inquiry' : 'información personal'}`;
  return (
    <Modal open={open} onClose={onClose} title={title} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={save} loading={busy}>Guardar</Button></>}>
      <div className="space-y-4">
        {isNew ? (
          <div>
            <span className="label">Bureaus (se crea uno por cada bureau)</span>
            <div className="flex gap-2">
              {BUREAUS.map((b) => (
                <button key={b} type="button" onClick={() => setBureaus(bureaus.includes(b) ? bureaus.filter((x) => x !== b) : [...bureaus, b])}
                  className={cx('rounded-lg border px-3 py-1.5 text-sm font-medium', bureaus.includes(b) ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-300 text-slate-500')}>
                  {BUREAU_NAME[b]}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Bureau: <b>{BUREAU_NAME[f.bureau]}</b></p>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          {kind === 'personal' && (
            <Field label="Tipo"><Select value={v('category')} onChange={set('category')} options={Object.entries(PERSONAL_CATEGORIES)} /></Field>
          )}
          {kind === 'cuenta' && (
            <Field label="Categoría"><Select value={v('category')} onChange={set('category')} options={Object.entries(ACCOUNT_CATEGORIES).map(([k, x]) => [k, x.label])} /></Field>
          )}
          <Field label={kind === 'personal' ? 'Valor' : 'Acreedor / Compañía'} className={kind === 'inquiry' ? 'sm:col-span-2' : 'sm:col-span-2'}>
            <Input value={v('name')} onChange={set('name')} />
          </Field>
          {kind === 'inquiry' && <Field label="Fecha del inquiry"><Input value={v('item_date')} onChange={set('item_date')} placeholder="MM/DD/YYYY" /></Field>}
        </div>

        {kind === 'cuenta' && (
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Número de cuenta"><Input value={v('account_number')} onChange={set('account_number')} /></Field>
            <Field label="Acreedor original"><Input value={v('original_creditor')} onChange={set('original_creditor')} /></Field>
            <Field label="Tipo de cuenta" className="sm:col-span-2"><Input value={v('account_type')} onChange={set('account_type')} /></Field>
            <Field label="Balance"><Input type="number" step="0.01" value={v('balance')} onChange={set('balance')} /></Field>
            <Field label="Pasado de pago"><Input type="number" step="0.01" value={v('past_due')} onChange={set('past_due')} /></Field>
            <Field label="Límite"><Input type="number" step="0.01" value={v('credit_limit')} onChange={set('credit_limit')} /></Field>
            <Field label="Crédito alto"><Input type="number" step="0.01" value={v('high_credit')} onChange={set('high_credit')} /></Field>
            <Field label="Fecha abierta"><Input value={v('date_opened')} onChange={set('date_opened')} /></Field>
            <Field label="Último reporte"><Input value={v('last_reported')} onChange={set('last_reported')} /></Field>
            <Field label="Estado de cuenta"><Input value={v('account_status')} onChange={set('account_status')} /></Field>
            <Field label="Estado de pago"><Input value={v('payment_status')} onChange={set('payment_status')} /></Field>
            <Field label="Tarde 30 días"><Input type="number" min="0" value={v('late_30')} onChange={set('late_30')} /></Field>
            <Field label="Tarde 60 días"><Input type="number" min="0" value={v('late_60')} onChange={set('late_60')} /></Field>
            <Field label="Tarde 90+ días"><Input type="number" min="0" value={v('late_90')} onChange={set('late_90')} /></Field>
            <Field label="Comentarios del bureau"><Input value={v('comments')} onChange={set('comments')} /></Field>
          </div>
        )}

        <div className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-4">
          <Field label="Estado"><Select value={v('status')} onChange={set('status')} options={Object.entries(ITEM_STATUS).map(([k, x]) => [k, x.label])} /></Field>
          <Field label="Ronda de disputa"><Input type="number" min="0" value={v('dispute_round')} onChange={set('dispute_round')} /></Field>
          <Field label="Cobro por eliminar ($)" hint={`Vacío = usa el precio de Configuración (${feeFor({ ...f, kind, fee: null }, settings)})`}><Input type="number" step="0.01" value={v('fee')} onChange={set('fee')} /></Field>
          {f.status === 'eliminada' && <Field label="Fecha eliminada"><Input type="date" value={v('removed_at')} onChange={set('removed_at')} /></Field>}
        </div>
        {f.status === 'eliminada' && item?.status !== 'eliminada' && (
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={makeCharge} onChange={(e) => setMakeCharge(e.target.checked)} /> Crear cobro al cliente por esta eliminación</label>
        )}
        <Field label="Notas internas"><Textarea rows={2} value={v('notes')} onChange={set('notes')} /></Field>
      </div>
    </Modal>
  );
}
