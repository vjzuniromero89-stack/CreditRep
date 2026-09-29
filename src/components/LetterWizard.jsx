import { useEffect, useMemo, useState } from 'react';
import { Mail, Printer, CheckSquare } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { ACCOUNT_CATEGORIES, BUREAUS, BUREAU_NAME, BUREAU_COLOR, DISPUTE_REASONS, ITEM_STATUS, PERSONAL_CATEGORIES } from '../lib/constants';
import { bureauRecipient, renderLetter } from '../lib/letters';
import { money, today } from '../lib/format';
import { Badge, Button, Field, Input, Modal, Select, Textarea, useToast, cx } from './ui';

export default function LetterWizard({ open, onClose, client, items, preselect = [], onDone }) {
  const { settings } = useAuth();
  const toast = useToast();
  const [templates, setTemplates] = useState([]);
  const [tplId, setTplId] = useState('');
  const [sel, setSel] = useState(new Set());
  const [reasons, setReasons] = useState({});
  const [defaultReason, setDefaultReason] = useState('');
  const [attach, setAttach] = useState(true);
  const [markDispute, setMarkDispute] = useState(true);
  const [showRemoved, setShowRemoved] = useState(false);
  const [creditorAddr, setCreditorAddr] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase.from('cr_templates').select('*').eq('active', true).order('round').order('name').then(({ data }) => {
      setTemplates(data || []);
      const guess = preselect.length ? data?.find((t) => t.applies_to === items.find((i) => i.id === preselect[0])?.kind) : null;
      setTplId((guess || data?.[0])?.id || '');
    });
    setSel(new Set(preselect)); setReasons({}); setCreditorAddr({});
    // eslint-disable-next-line
  }, [open]);

  const tpl = templates.find((t) => t.id === tplId);
  useEffect(() => { if (tpl) setDefaultReason(tpl.default_reason || ''); }, [tplId]); // eslint-disable-line

  const list = useMemo(() => items.filter((i) => (!tpl || tpl.applies_to === 'todos' || tpl.applies_to === i.kind) && (showRemoved || i.status !== 'eliminada') && (i.kind !== 'cuenta' || i.is_negative || sel.has(i.id))), [items, tpl, showRemoved, sel]);
  const chosen = items.filter((i) => sel.has(i.id));
  const creditors = [...new Set(chosen.map((i) => i.name))];

  const toggle = (id) => { const s = new Set(sel); s.has(id) ? s.delete(id) : s.add(id); setSel(s); };
  const selectAll = () => setSel(new Set(list.filter((i) => i.status !== 'eliminada').map((i) => i.id)));

  const generate = async () => {
    if (!tpl) { toast('Escoge una plantilla', 'error'); return; }
    if (!chosen.length) { toast('Selecciona al menos un item', 'error'); return; }
    if (!client.address) { toast('El cliente no tiene dirección. Complétala en "Información personal".', 'error'); }
    setBusy(true);
    try {
      const letters = [];
      if (tpl.recipient === 'bureau') {
        for (const b of BUREAUS) {
          const its = chosen.filter((i) => i.bureau === b);
          if (!its.length) continue;
          const r = bureauRecipient(b, settings);
          letters.push({ bureau: b, recipient_name: r.name, recipient_address: r.address, its });
        }
      } else {
        for (const name of creditors) {
          // una carta por acreedor (sin repetir la misma cuenta de 3 bureaus)
          const its = []; const seen = new Set();
          chosen.filter((i) => i.name === name).forEach((i) => { const k = i.account_number || i.id; if (!seen.has(k)) { seen.add(k); its.push(i); } });
          const a = creditorAddr[name] || {};
          letters.push({ bureau: null, recipient_name: a.name || name, recipient_address: a.address || '', its });
        }
      }
      const rows = letters.map((l) => ({
        client_id: client.id,
        template_id: tpl.id,
        template_name: tpl.name,
        recipient_type: tpl.recipient,
        bureau: l.bureau,
        recipient_name: l.recipient_name,
        recipient_address: l.recipient_address,
        round: tpl.round,
        item_ids: l.its.map((i) => i.id),
        attach_docs: attach,
        body_html: renderLetter({ template: tpl, client, recipientName: l.recipient_name, recipientAddress: l.recipient_address, bureau: l.bureau, items: l.its, reasons, defaultReason, settings }),
      }));
      const { data, error } = await supabase.from('cr_letters').insert(rows).select('id');
      if (error) throw error;
      if (markDispute) {
        await Promise.all(chosen.filter((i) => i.status !== 'eliminada').map((i) => supabase.from('cr_items').update({ status: 'en_disputa', dispute_round: Math.max(i.dispute_round || 0, tpl.round || 1), last_dispute_at: today() }).eq('id', i.id)));
      }
      await supabase.from('cr_activity').insert({ client_id: client.id, message: `✉️ ${rows.length} carta(s) generadas: ${tpl.name} (${chosen.length} items)` });
      toast(`${rows.length} carta(s) creadas`);
      window.open(`/admin/imprimir?ids=${data.map((d) => d.id).join(',')}`, '_blank');
      onDone?.();
      onClose();
    } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };

  const perBureau = BUREAUS.map((b) => [b, chosen.filter((i) => i.bureau === b).length]).filter(([, n]) => n);

  return (
    <Modal open={open} onClose={onClose} size="xl" title="Generar cartas de disputa"
      footer={<>
        <span className="mr-auto self-center text-sm text-slate-500">
          {tpl?.recipient === 'bureau' ? `Se crearán ${perBureau.length} carta(s): ${perBureau.map(([b, n]) => `${BUREAU_NAME[b]} (${n})`).join(', ') || '—'}` : `Se crearán ${creditors.length} carta(s), una por acreedor`}
        </span>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={generate} loading={busy} icon={Printer}>Generar e imprimir</Button>
      </>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Plantilla" className="sm:col-span-2">
            <Select value={tplId} onChange={(e) => setTplId(e.target.value)} options={templates.map((t) => [t.id, `${t.name}  ·  ${t.recipient === 'bureau' ? 'a los bureaus' : 'al acreedor'}`])} />
          </Field>
          <Field label="Razón general (se usa si el item no tiene una propia)">
            <Input list="reasons" value={defaultReason} onChange={(e) => setDefaultReason(e.target.value)} />
            <datalist id="reasons">{DISPUTE_REASONS.map((r) => <option key={r} value={r} />)}</datalist>
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} /> Adjuntar copia de licencia y bill al imprimir</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={markDispute} onChange={(e) => setMarkDispute(e.target.checked)} /> Marcar items como "En disputa"</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} /> Mostrar eliminados</label>
          <Button size="sm" variant="secondary" icon={CheckSquare} onClick={selectAll}>Seleccionar todo</Button>
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>Quitar selección</Button>
        </div>

        <div className="max-h-[45vh] overflow-auto rounded-lg border border-slate-200">
          <table className="w-full">
            <thead className="sticky top-0 bg-slate-50"><tr><th className="th w-8" /><th className="th">Bureau</th><th className="th">Item</th><th className="th">Tipo</th><th className="th">Estado</th><th className="th w-72">Razón (opcional)</th></tr></thead>
            <tbody>
              {list.map((i) => (
                <tr key={i.id} className={cx('border-t border-slate-100', sel.has(i.id) && 'bg-brand-50/50')}>
                  <td className="td"><input type="checkbox" checked={sel.has(i.id)} onChange={() => toggle(i.id)} /></td>
                  <td className="td"><Badge className={BUREAU_COLOR[i.bureau]}>{i.bureau}</Badge></td>
                  <td className="td"><div className="font-medium">{i.name}</div><div className="text-xs text-slate-500">{i.account_number || i.item_date || ''} {i.balance != null ? '· ' + money(i.balance) : ''}</div></td>
                  <td className="td text-xs">{i.kind === 'cuenta' ? ACCOUNT_CATEGORIES[i.category]?.label : i.kind === 'inquiry' ? 'Inquiry' : PERSONAL_CATEGORIES[i.category]}</td>
                  <td className="td"><Badge className={ITEM_STATUS[i.status]?.color}>{ITEM_STATUS[i.status]?.label}</Badge>{i.dispute_round > 0 && <span className="ml-1 text-xs text-slate-500">R{i.dispute_round}</span>}</td>
                  <td className="td">{sel.has(i.id) && (
                    <select className="w-full rounded border border-slate-200 px-1 py-1 text-xs" value={reasons[i.id] || ''} onChange={(e) => setReasons({ ...reasons, [i.id]: e.target.value })}>
                      <option value="">(razón general)</option>
                      {DISPUTE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>)}
                  </td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan={6} className="td py-8 text-center text-slate-500">No hay items para esta plantilla. Sube un reporte o agrega items.</td></tr>}
            </tbody>
          </table>
        </div>

        {tpl?.recipient === 'acreedor' && creditors.length > 0 && (
          <div className="space-y-2 rounded-lg border border-slate-200 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold"><Mail className="h-4 w-4" /> Dirección de cada acreedor / agencia de cobro</div>
            {creditors.map((n) => (
              <div key={n} className="grid gap-2 sm:grid-cols-3">
                <Input value={creditorAddr[n]?.name ?? n} onChange={(e) => setCreditorAddr({ ...creditorAddr, [n]: { ...creditorAddr[n], name: e.target.value } })} />
                <Textarea rows={2} className="sm:col-span-2" placeholder="Dirección (calle, ciudad, estado, zip)" value={creditorAddr[n]?.address || ''} onChange={(e) => setCreditorAddr({ ...creditorAddr, [n]: { ...creditorAddr[n], address: e.target.value } })} />
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
