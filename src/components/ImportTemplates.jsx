import { useEffect, useRef, useState } from 'react';
import { FileUp, Wand2, CheckCircle2, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { readTemplateFile, autoPlaceholders, guessMeta } from '../lib/templateImport';
import { TEMPLATE_PURPOSES } from '../lib/constants';
import { Button, Field, Input, Modal, Select, Textarea, useToast, cx } from './ui';

export default function ImportTemplates({ open, onClose, onDone }) {
  const toast = useToast();
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(0);
  const input = useRef(null);
  const drop = useRef(null);

  useEffect(() => { if (open) { setList([]); setSel(0); } }, [open]);

  const readFiles = async (files) => {
    setBusy(true);
    const out = [...list];
    for (const f of [...files]) {
      try {
        const ts = await readTemplateFile(f);
        ts.forEach((t) => {
          const auto = autoPlaceholders(t.body);
          out.push({ ...t, ...guessMeta(t), original: t.body, body: auto.text, changes: auto.changes, useAuto: true, include: true, file: f.name, default_reason: '' });
        });
        if (!ts.length) toast(`${f.name}: no tiene texto`, 'error');
      } catch (e) { toast(`${f.name}: ${e.message}`, 'error'); }
    }
    setList(out); setBusy(false);
  };

  const upd = (i, patch) => setList(list.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const toggleAuto = (i) => {
    const t = list[i];
    if (t.useAuto) upd(i, { useAuto: false, body: t.original, changes: [] });
    else { const a = autoPlaceholders(t.original); upd(i, { useAuto: true, body: a.text, changes: a.changes }); }
  };

  const save = async () => {
    const rows = list.filter((t) => t.include).map((t) => ({
      name: t.name, body: t.body, recipient: t.recipient, applies_to: t.applies_to, purpose: t.purpose, round: Number(t.round) || 1,
      default_reason: t.default_reason || null, attach_id: !!t.attach_id, attach_bill: !!t.attach_bill, attach_ssn: !!t.attach_ssn, active: true,
    }));
    if (!rows.length) { toast('Selecciona al menos una plantilla', 'error'); return; }
    setBusy(true);
    const { data, error } = await supabase.from('cr_templates').insert(rows).select('id');
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast(`${rows.length} plantilla(s) importadas`);
    onDone?.(data?.[0]?.id);
    onClose();
  };

  const t = list[sel];
  return (
    <Modal open={open} onClose={onClose} size="xl" title="Importar plantillas de cartas"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button icon={CheckCircle2} loading={busy} disabled={!list.some((x) => x.include)} onClick={save}>Importar {list.filter((x) => x.include).length || ''} plantilla(s)</Button>
      </>}>
      <div className="space-y-4">
        <label ref={drop}
          onDragOver={(e) => { e.preventDefault(); drop.current.classList.add('border-brand-500'); }}
          onDragLeave={() => drop.current.classList.remove('border-brand-500')}
          onDrop={(e) => { e.preventDefault(); drop.current.classList.remove('border-brand-500'); readFiles(e.dataTransfer.files); }}
          className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center hover:border-brand-400">
          <FileUp className="h-8 w-8 text-brand-500" />
          <p className="font-medium">{busy ? 'Leyendo…' : 'Arrastra aquí tus cartas o haz clic para escogerlas'}</p>
          <p className="text-xs text-slate-500">Word (.docx), Excel (.xlsx, .xls, .csv), PDF o .txt · puedes escoger varios archivos a la vez.<br />En Excel: una columna <b>Nombre</b> y otra <b>Carta</b> importa una plantilla por fila.</p>
          <input ref={input} type="file" multiple className="hidden" accept=".docx,.xlsx,.xls,.xlsm,.csv,.ods,.pdf,.txt,.md,.doc" onChange={(e) => { readFiles(e.target.files); e.target.value = ''; }} />
        </label>

        {list.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
            <div className="max-h-[60vh] space-y-1 overflow-auto">
              {list.map((x, i) => (
                <div key={i} className={cx('flex items-start gap-2 rounded-lg border px-2 py-2', sel === i ? 'border-brand-400 bg-brand-50' : 'border-slate-200')}>
                  <input type="checkbox" className="mt-1" checked={x.include} onChange={(e) => upd(i, { include: e.target.checked })} />
                  <button className="min-w-0 flex-1 text-left" onClick={() => setSel(i)}>
                    <div className="truncate text-sm font-semibold">{x.name}</div>
                    <div className="flex items-center gap-1 truncate text-xs text-slate-500"><FileText className="h-3 w-3" />{x.file}</div>
                  </button>
                </div>
              ))}
            </div>
            {t && (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-4">
                  <Field label="Nombre" className="sm:col-span-2"><Input value={t.name} onChange={(e) => upd(sel, { name: e.target.value })} /></Field>
                  <Field label="Tipo de carta" className="sm:col-span-2">
                    <Select value={t.purpose} onChange={(e) => { const p = e.target.value; upd(sel, { purpose: p, applies_to: p === 'inquiries' ? 'inquiry' : p === 'personal' ? 'personal' : 'cuenta', recipient: ['validacion', 'goodwill'].includes(p) ? 'acreedor' : p === 'otro' ? t.recipient : 'bureau' }); }} options={Object.entries(TEMPLATE_PURPOSES)} />
                  </Field>
                  <Field label="Se envía a"><Select value={t.recipient} onChange={(e) => upd(sel, { recipient: e.target.value })} options={[['bureau', 'Bureaus'], ['acreedor', 'Acreedor']]} /></Field>
                  <Field label="Ronda"><Input type="number" min="1" value={t.round} onChange={(e) => upd(sel, { round: e.target.value })} /></Field>
                  <Field label="Razón por defecto" className="sm:col-span-2"><Input value={t.default_reason} onChange={(e) => upd(sel, { default_reason: e.target.value })} placeholder="Opcional" /></Field>
                </div>
                <div className="flex flex-wrap items-center gap-4 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span className="font-semibold text-slate-600">Adjuntar:</span>
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={t.attach_id} onChange={(e) => upd(sel, { attach_id: e.target.checked })} /> ID / licencia</label>
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={t.attach_bill} onChange={(e) => upd(sel, { attach_bill: e.target.checked })} /> Bill</label>
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={t.attach_ssn} onChange={(e) => upd(sel, { attach_ssn: e.target.checked })} /> Seguro Social</label>
                </div>
                <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm">
                  <label className="flex items-center gap-2 font-semibold text-violet-900"><input type="checkbox" checked={t.useAuto} onChange={() => toggleAuto(sel)} /><Wand2 className="h-4 w-4" /> Convertir automáticamente [Name], [Address], [Date], cuentas… a campos de la app</label>
                  {t.useAuto && t.changes.length > 0 && <ul className="ml-6 mt-1 list-disc text-xs text-violet-800">{t.changes.map((c) => <li key={c}>{c}</li>)}</ul>}
                </div>
                <Textarea rows={16} className="font-mono text-[13px]" value={t.body} onChange={(e) => upd(sel, { body: e.target.value })} />
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
