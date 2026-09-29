import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Printer, AlertTriangle, IdCard, Receipt, ShieldCheck, Mail, Building2, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { BUREAU_NAME, BUREAU_COLOR, ACCOUNT_CATEGORIES, PERSONAL_CATEGORIES } from '../lib/constants';
import { buildPackage, PACKET_ORDER, creditorNorm, envelopeKey } from '../lib/packageBuilder';
import { bureauRecipient, renderLetter } from '../lib/letters';
import { money, today, fullName } from '../lib/format';
import { Badge, Button, Input, Modal, Select, Spinner, Textarea, useToast, cx } from './ui';

const OPTS0 = { perAccount: false, creditorLetters: true, goodwill: true, cleanPersonal: true, inquiries: true, includeRecent: false, attachMode: 'sobre', cover: true, markDispute: true };

export default function PackageBuilder({ open, onClose, client, items, onDone }) {
  const { settings } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [opt, setOpt] = useState(OPTS0);
  const [ov, setOv] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOv({}); setData(null);
    Promise.all([
      supabase.from('cr_templates').select('*').eq('active', true).order('round'),
      supabase.from('cr_documents').select('doc_type').eq('client_id', client.id),
      supabase.from('cr_creditors').select('*'),
    ]).then(([t, d, c]) => setData({ templates: t.data || [], docs: d.data || [], creditors: c.data || [] }));
  }, [open, client.id]);

  const pkg = useMemo(() => (data ? buildPackage({ client, items, templates: data.templates, docs: data.docs, creditors: data.creditors, options: opt }) : null), [data, client, items, opt]);
  useEffect(() => setOv({}), [opt]);

  const L = (l) => ({ ...l, ...(ov[l.key] || {}), attach: { ...l.attach, ...(ov[l.key]?.attach || {}) }, template: ov[l.key]?.templateId ? data.templates.find((t) => t.id === ov[l.key].templateId) : l.template });
  const set = (key, patch) => setOv({ ...ov, [key]: { ...(ov[key] || {}), ...patch } });
  const letters = pkg ? pkg.letters.map(L) : [];
  const enabled = letters.filter((l) => l.enabled);
  const envelopes = new Set(enabled.map((l) => envelopeKey({ recipient: l.recipient, bureau: l.bureau, recipientName: l.recipientName }))).size;

  const generate = async () => {
    if (!enabled.length) { toast('No hay cartas seleccionadas', 'error'); return; }
    setBusy(true);
    try {
      const { data: p, error: e1 } = await supabase.from('cr_packages').insert({
        client_id: client.id, options: { attachMode: opt.attachMode, cover: opt.cover },
        summary: { cartas: enabled.length, sobres: envelopes, por_grupo: Object.fromEntries([...PACKET_ORDER, 'ACREEDOR'].map((g) => [g, enabled.filter((l) => l.group === g).length])) },
      }).select().single();
      if (e1) throw e1;
      const rows = enabled.map((l, idx) => {
        const r = l.recipient === 'bureau' ? bureauRecipient(l.bureau, settings) : { name: l.recipientName, address: l.recipientAddress };
        return {
          client_id: client.id, package_id: p.id, packet_order: idx + 1,
          template_id: l.template.id, template_name: l.template.name, recipient_type: l.recipient, bureau: l.bureau,
          recipient_name: r.name, recipient_address: r.address, round: l.round || l.template.round || 1,
          item_ids: (l.allItems || l.items).map((i) => i.id),
          attach_id: !!l.attach.id, attach_bill: !!l.attach.bill, attach_ssn: !!l.attach.ssn, attach_docs: !!(l.attach.id || l.attach.bill),
          body_html: renderLetter({ template: l.template, client, recipientName: r.name, recipientAddress: r.address, bureau: l.bureau, items: l.items, defaultReason: l.template.default_reason, settings }),
        };
      });
      const { error: e2 } = await supabase.from('cr_letters').insert(rows);
      if (e2) throw e2;
      if (opt.markDispute) {
        const upd = new Map();
        enabled.filter((l) => l.recipient === 'bureau').forEach((l) => l.items.forEach((i) => upd.set(i.id, Math.max(upd.get(i.id) || 0, l.round || 1, (i.dispute_round || 0) + 1))));
        await Promise.all([...upd].map(([id, round]) => supabase.from('cr_items').update({ status: 'en_disputa', dispute_round: round, last_dispute_at: today() }).eq('id', id)));
      }
      const cred = enabled.filter((l) => l.recipient === 'acreedor' && l.recipientAddress && ov[l.key]?.recipientAddress);
      if (cred.length) await supabase.from('cr_creditors').upsert(cred.map((l) => ({ name: l.recipientName, norm: l.creditorNorm || creditorNorm(l.recipientName), address: l.recipientAddress })), { onConflict: 'norm' });
      await supabase.from('cr_activity').insert({ client_id: client.id, message: `✨ Paquete de cartas: ${enabled.length} cartas en ${envelopes} sobres (${PACKET_ORDER.map((b) => `${b} ${enabled.filter((l) => l.group === b).length}`).join(', ')}, acreedores ${enabled.filter((l) => l.group === 'ACREEDOR').length})` });
      window.open(`/admin/imprimir?package=${p.id}`, '_blank');
      toast('Paquete creado');
      onDone?.(); onClose();
    } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };

  const Toggle = ({ k, children }) => (
    <label className="flex items-center gap-1.5 whitespace-nowrap"><input type="checkbox" checked={!!opt[k]} onChange={(e) => setOpt({ ...opt, [k]: e.target.checked })} />{children}</label>
  );

  return (
    <Modal open={open} onClose={onClose} size="xl" title={<span className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-violet-600" /> Asistente de paquete de cartas — {fullName(client)}</span>}
      footer={<>
        <span className="mr-auto self-center text-sm text-slate-600"><b>{enabled.length}</b> cartas en <b>{envelopes}</b> sobres · orden de impresión: TransUnion → Experian → Equifax → Acreedores</span>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button icon={Printer} loading={busy} disabled={!enabled.length} onClick={generate}>Generar paquete e imprimir</Button>
      </>}>
      {!pkg ? <Spinner label="Analizando el reporte del cliente…" /> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <Toggle k="cleanPersonal">Limpiar info personal</Toggle>
            <Toggle k="inquiries">Inquiries</Toggle>
            <Toggle k="creditorLetters">Cartas a acreedores</Toggle>
            {opt.creditorLetters && <Toggle k="goodwill">Buena voluntad (pagos tarde)</Toggle>}
            <Toggle k="perAccount">Una carta por cada cuenta</Toggle>
            <Toggle k="includeRecent">Incluir lo disputado hace &lt; 30 días</Toggle>
            <Toggle k="cover">Hoja de resumen por sobre</Toggle>
            <Toggle k="markDispute">Marcar como "En disputa"</Toggle>
            <label className="flex items-center gap-1.5">Adjuntos:
              <select className="rounded border border-slate-300 px-1 py-0.5" value={opt.attachMode} onChange={(e) => setOpt({ ...opt, attachMode: e.target.value })}>
                <option value="sobre">una vez por sobre</option><option value="carta">después de cada carta</option>
              </select>
            </label>
          </div>

          {pkg.warnings.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <div className="mb-1 flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Revisa antes de imprimir</div>
              <ul className="ml-6 list-disc space-y-0.5">{pkg.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </div>
          )}
          {pkg.skippedRecent.length > 0 && !opt.includeRecent && (
            <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600"><Clock className="h-4 w-4" /> {pkg.skippedRecent.length} item(s) se disputaron hace menos de 30 días y no se incluyen (el bureau tiene 30 días para responder).</div>
          )}
          {!letters.length && <div className="rounded-xl border border-dashed p-8 text-center text-slate-500">No hay nada que disputar ahora. Sube un reporte o agrega items.</div>}

          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
            {[...PACKET_ORDER, 'ACREEDOR'].map((g, gi) => {
              const ls = letters.filter((l) => l.group === g);
              const on = ls.filter((l) => l.enabled);
              return (
                <div key={g} className="flex flex-col rounded-xl border border-slate-200 bg-white">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
                    <div className="flex items-center gap-2 font-semibold">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs text-white">{gi + 1}</span>
                      {g === 'ACREEDOR' ? <><Building2 className="h-4 w-4 text-slate-500" />Acreedores</> : <Badge className={BUREAU_COLOR[g]}>{BUREAU_NAME[g]}</Badge>}
                    </div>
                    <span className="text-xs text-slate-500">{on.length} carta(s)</span>
                  </div>
                  <div className="flex-1 space-y-2 p-2">
                    {!ls.length && <p className="px-2 py-4 text-center text-xs text-slate-400">Nada para este {g === 'ACREEDOR' ? 'grupo' : 'bureau'}</p>}
                    {ls.map((l) => (
                      <div key={l.key} className={cx('rounded-lg border p-2.5 text-sm', l.enabled ? 'border-brand-200 bg-brand-50/40' : 'border-slate-200 opacity-50')}>
                        <label className="flex items-start gap-2">
                          <input type="checkbox" className="mt-0.5" checked={l.enabled} onChange={(e) => set(l.key, { enabled: e.target.checked })} />
                          <span className="font-semibold leading-tight">{l.purposeLabel}</span>
                        </label>
                        <select className="mt-1.5 w-full rounded border border-slate-200 bg-white px-1 py-1 text-xs" value={l.template.id} onChange={(e) => set(l.key, { templateId: e.target.value })}>
                          {data.templates.filter((t) => t.recipient === l.recipient).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                        {l.recipient === 'acreedor' && (
                          <div className="mt-1.5 space-y-1">
                            <Input className="px-2 py-1 text-xs" value={l.recipientName} onChange={(e) => set(l.key, { recipientName: e.target.value })} />
                            <Textarea rows={2} className={cx('px-2 py-1 text-xs', !l.recipientAddress && 'border-amber-400')} placeholder="Dirección del acreedor (se guarda para la próxima vez)" value={l.recipientAddress} onChange={(e) => set(l.key, { recipientAddress: e.target.value })} />
                          </div>
                        )}
                        <ul className="mt-1.5 space-y-0.5 text-xs text-slate-600">
                          {l.items.slice(0, 6).map((i) => (
                            <li key={i.id} className="truncate">• {i.name}
                              {i.kind === 'cuenta' && <span className="text-slate-400"> · {ACCOUNT_CATEGORIES[i.category]?.label}{i.balance != null ? ` · ${money(i.balance)}` : ''}</span>}
                              {i.kind === 'personal' && <span className="text-slate-400"> · {PERSONAL_CATEGORIES[i.category]} — {l.reasons?.[i.id]}</span>}
                              {i.kind === 'inquiry' && <span className="text-slate-400"> · {i.item_date}</span>}
                            </li>
                          ))}
                          {l.items.length > 6 && <li className="text-slate-400">+ {l.items.length - 6} más</li>}
                        </ul>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {[['id', 'ID', IdCard], ['bill', 'Bill', Receipt], ['ssn', 'SSN', ShieldCheck]].map(([k, lab, Icon]) => (
                            <button key={k} onClick={() => set(l.key, { attach: { ...(ov[l.key]?.attach || {}), [k]: !l.attach[k] } })}
                              className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1', l.attach[k] ? 'bg-emerald-100 text-emerald-800 ring-emerald-200' : 'bg-white text-slate-400 ring-slate-200 line-through')}>
                              <Icon className="h-3 w-3" />{lab}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="flex items-center gap-1.5 text-xs text-slate-500"><Mail className="h-3.5 w-3.5" /> Cada bureau va en su propio sobre con su hoja de resumen, cartas y copias de ID/bill. Cada acreedor también va en su propio sobre.</p>
        </div>
      )}
    </Modal>
  );
}
