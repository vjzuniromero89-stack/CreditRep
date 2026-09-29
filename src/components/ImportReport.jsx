import { useEffect, useMemo, useRef, useState } from 'react';
import { FileUp, ClipboardPaste, AlertTriangle, CheckCircle2, Trash2, Sparkles, RotateCcw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { fileToRows, textToRows } from '../lib/parser/extract';
import { parseReport } from '../lib/parser/parse';
import { parsedToItems, computeDiff, feeFor, isBillable } from '../lib/reportDiff';
import { saveImport } from '../lib/importReport';
import { ACCOUNT_CATEGORIES, BUREAUS, BUREAU_NAME, BUREAU_COLOR, PERSONAL_CATEGORIES } from '../lib/constants';
import { money } from '../lib/format';
import { Badge, Button, Field, Input, Modal, Select, Tabs, Textarea, useToast, cx } from './ui';

const PROVIDERS = ['IdentityIQ', 'SmartCredit', 'MyScoreIQ', 'MyFreeScoreNow', 'Otro'];

export default function ImportReport({ open, onClose, client, onDone }) {
  const { settings } = useAuth();
  const toast = useToast();
  const [step, setStep] = useState('pick');
  const [mode, setMode] = useState('file');
  const [file, setFile] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [items, setItems] = useState([]);
  const [excluded, setExcluded] = useState(new Set());
  const [existing, setExisting] = useState([]);
  const [provider, setProvider] = useState('');
  const [reportDate, setReportDate] = useState('');
  const [onlyNeg, setOnlyNeg] = useState(false);
  const [tab, setTab] = useState('cuentas');
  const [result, setResult] = useState(null);
  const drop = useRef(null);

  useEffect(() => {
    if (!open) return;
    setStep('pick'); setFile(null); setText(''); setParsed(null); setItems([]); setExcluded(new Set()); setResult(null); setTab('cuentas');
    supabase.from('cr_items').select('*').eq('client_id', client.id).then(({ data }) => setExisting(data || []));
  }, [open, client.id]);

  const read = async () => {
    setBusy(true);
    try {
      let rows; let raw = '';
      if (mode === 'file') {
        if (!file) throw new Error('Escoge un archivo');
        const r = await fileToRows(file);
        rows = r.rows; raw = r.text;
      } else {
        if (!text.trim()) throw new Error('Pega el texto del reporte');
        rows = textToRows(text); raw = text;
      }
      const p = parseReport(rows, raw);
      const its = parsedToItems(p).map((it, i) => ({ ...it, _k: i }));
      setParsed(p); setItems(its);
      setProvider(p.provider); setReportDate(p.reportDate || '');
      setStep('review');
    } catch (e) { toast('No se pudo leer el reporte: ' + e.message, 'error'); }
    setBusy(false);
  };

  const plan = useMemo(() => {
    if (!parsed) return null;
    const base = computeDiff(existing, items, parsed.bureaus.length ? parsed.bureaus : BUREAUS);
    const skip = (it) => excluded.has(it._k) || (onlyNeg && it.kind === 'cuenta' && !it.is_negative);
    return {
      ...base,
      allInserts: base.inserts,
      inserts: base.inserts.filter((it) => !skip(it)),
    };
  }, [parsed, items, existing, excluded, onlyNeg]);

  const statusOf = (it) => {
    if (!plan) return null;
    if (plan.allInserts.includes(it)) return 'nuevo';
    return 'sigue';
  };

  const toggle = (k) => { const s = new Set(excluded); s.has(k) ? s.delete(k) : s.add(k); setExcluded(s); };
  const setCat = (k, category) => setItems(items.map((it) => (it._k === k ? { ...it, category, is_negative: category !== 'positiva' } : it)));

  const save = async () => {
    setBusy(true);
    try {
      const { allInserts, ...rest } = plan;
      const cleanPlan = { ...rest, inserts: plan.inserts.map(({ _k, ...r }) => r) };
      const { summary } = await saveImport({ client, parsed, plan: cleanPlan, file: mode === 'file' ? file : null, settings, provider, reportDate });
      setResult(summary); setStep('done');
      onDone?.();
    } catch (e) { toast('Error al guardar: ' + e.message, 'error'); }
    setBusy(false);
  };

  const accounts = items.filter((i) => i.kind === 'cuenta');
  const inquiries = items.filter((i) => i.kind === 'inquiry');
  const personal = items.filter((i) => i.kind === 'personal');
  const removedBillable = plan ? plan.removed.filter((e) => isBillable(e, settings)) : [];
  const removedTotal = removedBillable.reduce((s, e) => s + feeFor(e, settings), 0);

  const Row = ({ it, children }) => {
    const st = statusOf(it);
    const off = excluded.has(it._k) || (onlyNeg && it.kind === 'cuenta' && !it.is_negative);
    return (
      <tr className={cx('border-t border-slate-100', off && 'opacity-40')}>
        <td className="td w-8"><input type="checkbox" checked={!excluded.has(it._k)} onChange={() => toggle(it._k)} /></td>
        <td className="td"><Badge className={BUREAU_COLOR[it.bureau]}>{it.bureau}</Badge></td>
        {children}
        <td className="td">{st === 'nuevo' ? <Badge className="bg-sky-100 text-sky-800 ring-sky-200">Nuevo</Badge> : <Badge>Ya estaba</Badge>}</td>
      </tr>
    );
  };

  return (
    <Modal open={open} onClose={onClose} size="xl" title={`Subir reporte de crédito — ${client.first_name || ''} ${client.last_name || ''}`}
      footer={
        step === 'pick' ? <><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={read} loading={busy} icon={Sparkles}>Leer reporte automáticamente</Button></> :
        step === 'review' ? <><Button variant="secondary" icon={RotateCcw} onClick={() => setStep('pick')}>Otro archivo</Button><Button variant="success" onClick={save} loading={busy} icon={CheckCircle2}>Guardar en el cliente</Button></> :
        <Button onClick={onClose}>Listo</Button>
      }>
      {step === 'pick' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button variant={mode === 'file' ? 'primary' : 'secondary'} icon={FileUp} onClick={() => setMode('file')}>Archivo (PDF / HTML)</Button>
            <Button variant={mode === 'text' ? 'primary' : 'secondary'} icon={ClipboardPaste} onClick={() => setMode('text')}>Pegar texto</Button>
          </div>
          {mode === 'file' ? (
            <label ref={drop}
              onDragOver={(e) => { e.preventDefault(); drop.current.classList.add('border-brand-500'); }}
              onDragLeave={() => drop.current.classList.remove('border-brand-500')}
              onDrop={(e) => { e.preventDefault(); drop.current.classList.remove('border-brand-500'); setFile(e.dataTransfer.files[0]); }}
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center transition hover:border-brand-400">
              <FileUp className="h-10 w-10 text-brand-500" />
              {file ? <p className="font-semibold text-slate-800">{file.name} <span className="font-normal text-slate-500">({Math.round(file.size / 1024)} KB)</span></p> :
                <p className="font-medium text-slate-700">Arrastra aquí el reporte o haz clic para escogerlo</p>}
              <p className="text-xs text-slate-500">IdentityIQ, SmartCredit, MyScoreIQ, MyFreeScoreNow · PDF, página guardada (.html / .mhtml) o .txt</p>
              <input type="file" className="hidden" accept=".pdf,.html,.htm,.mhtml,.txt" onChange={(e) => setFile(e.target.files[0])} />
            </label>
          ) : (
            <Field label="Abre el reporte en el navegador, selecciona todo (Ctrl+A), copia (Ctrl+C) y pégalo aquí">
              <Textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder="Pega aquí el reporte completo…" />
            </Field>
          )}
          <div className="rounded-lg bg-brand-50 p-3 text-sm text-brand-900">
            <b>Consejo:</b> la mejor lectura se logra con la página del reporte guardada (en el navegador: <i>Ctrl+S → Página web completa</i>) o con el PDF descargado del monitoreo. Siempre podrás revisar y corregir antes de guardar.
          </div>
        </div>
      )}

      {step === 'review' && parsed && plan && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Proveedor"><Select value={provider} onChange={(e) => setProvider(e.target.value)} options={PROVIDERS} /></Field>
            <Field label="Fecha del reporte"><Input value={reportDate} onChange={(e) => setReportDate(e.target.value)} placeholder="MM/DD/YYYY" /></Field>
            <div className="sm:col-span-2">
              <span className="label">Scores detectados</span>
              <div className="flex gap-2">
                {BUREAUS.map((b) => (
                  <div key={b} className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-center">
                    <div className="text-[11px] text-slate-500">{BUREAU_NAME[b]}</div>
                    <div className="text-lg font-bold">{parsed.scores[b] ?? '—'}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {parsed.warnings.map((w) => (
            <div key={w} className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800"><AlertTriangle className="h-4 w-4" />{w}</div>
          ))}

          <div className="grid gap-3 sm:grid-cols-4">
            <SummaryBox tone="sky" label="Nuevos" value={plan.inserts.length} />
            <SummaryBox tone="slate" label="Siguen en el reporte" value={plan.updates.length} />
            <SummaryBox tone="green" label="ELIMINADOS" value={plan.removed.length} sub={removedBillable.length ? `${removedBillable.length} cobros · ${money(removedTotal)}` : null} />
            <SummaryBox tone="red" label="Reinsertados" value={plan.reappeared.length} />
          </div>

          {plan.removed.length > 0 && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <div className="mb-2 flex items-center gap-2 font-semibold text-emerald-800"><Trash2 className="h-4 w-4" /> Ya no aparecen en este reporte — se marcarán como ELIMINADOS</div>
              <ul className="space-y-1 text-sm">
                {plan.removed.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-2">
                    <Badge className={BUREAU_COLOR[e.bureau]}>{e.bureau}</Badge>
                    <span className="font-medium">{e.name}</span>
                    <span className="text-slate-500">{e.kind === 'cuenta' ? (ACCOUNT_CATEGORIES[e.category]?.label || '') : e.kind === 'inquiry' ? 'Inquiry' : PERSONAL_CATEGORIES[e.category]}</span>
                    {isBillable(e, settings) && <Badge className="bg-emerald-600 text-white ring-emerald-600">Cobrar {money(feeFor(e, settings))}</Badge>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {plan.reappeared.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <b>¡Atención! Volvieron a aparecer:</b> {plan.reappeared.map((e) => `${e.name} (${e.bureau})`).join(', ')}
            </div>
          )}

          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyNeg} onChange={(e) => setOnlyNeg(e.target.checked)} /> Guardar solo cuentas negativas (no guardar cuentas positivas)</label>

          <Tabs value={tab} onChange={setTab} tabs={[
            { id: 'cuentas', label: 'Cuentas', count: accounts.length },
            { id: 'inquiries', label: 'Inquiries', count: inquiries.length },
            { id: 'personal', label: 'Info personal', count: personal.length },
          ]} />
          <div className="max-h-[50vh] overflow-auto rounded-lg border border-slate-200">
            <table className="w-full">
              {tab === 'cuentas' && (<>
                <thead className="sticky top-0 bg-slate-50"><tr><th className="th" /><th className="th">Bureau</th><th className="th">Acreedor</th><th className="th"># Cuenta</th><th className="th">Balance</th><th className="th">Categoría</th><th className="th">Tarde 30/60/90</th><th className="th">Estado</th></tr></thead>
                <tbody>
                  {accounts.map((it) => (
                    <Row key={it._k} it={it}>
                      <td className="td font-medium">{it.name}<div className="text-xs font-normal text-slate-500">{it.payment_status || it.account_status}</div></td>
                      <td className="td font-mono text-xs">{it.account_number || '—'}</td>
                      <td className="td">{money(it.balance)}</td>
                      <td className="td"><select className="rounded border border-slate-200 px-1 py-0.5 text-xs" value={it.category} onChange={(e) => setCat(it._k, e.target.value)}>{Object.entries(ACCOUNT_CATEGORIES).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}</select></td>
                      <td className="td text-xs">{it.late_30}/{it.late_60}/{it.late_90}</td>
                    </Row>
                  ))}
                </tbody>
              </>)}
              {tab === 'inquiries' && (<>
                <thead className="sticky top-0 bg-slate-50"><tr><th className="th" /><th className="th">Bureau</th><th className="th">Compañía</th><th className="th">Fecha</th><th className="th">Tipo</th><th className="th">Estado</th></tr></thead>
                <tbody>{inquiries.map((it) => <Row key={it._k} it={it}><td className="td font-medium">{it.name}</td><td className="td">{it.item_date}</td><td className="td text-xs">{it.account_type}</td></Row>)}</tbody>
              </>)}
              {tab === 'personal' && (<>
                <thead className="sticky top-0 bg-slate-50"><tr><th className="th" /><th className="th">Bureau</th><th className="th">Tipo</th><th className="th">Valor</th><th className="th">Estado</th></tr></thead>
                <tbody>{personal.map((it) => <Row key={it._k} it={it}><td className="td">{PERSONAL_CATEGORIES[it.category]}{it.extra?.tipo === 'anterior' ? ' (anterior)' : ''}</td><td className="td font-medium">{it.name}</td></Row>)}</tbody>
              </>)}
            </table>
          </div>
        </div>
      )}

      {step === 'done' && result && (
        <div className="py-6 text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
          <h3 className="mt-3 text-xl font-bold">Reporte guardado</h3>
          <p className="mt-2 text-slate-600">{result.inserted} nuevos · {result.updated} actualizados · <b className="text-emerald-700">{result.removed} eliminados</b> · {result.reappeared} reinsertados</p>
          {result.charges > 0 && <p className="mt-2 font-semibold text-emerald-700">Se crearon {result.charges} cobros por {money(result.chargeTotal)}</p>}
        </div>
      )}
    </Modal>
  );
}

function SummaryBox({ label, value, sub, tone }) {
  const t = { sky: 'border-sky-200 bg-sky-50 text-sky-900', slate: 'border-slate-200 bg-slate-50 text-slate-800', green: 'border-emerald-200 bg-emerald-50 text-emerald-900', red: 'border-red-200 bg-red-50 text-red-900' }[tone];
  return (
    <div className={cx('rounded-xl border p-3', t)}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs font-medium">{sub}</div>}
    </div>
  );
}
