import { useEffect, useState } from 'react';
import { FileSignature, Download, Ban, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { CONSENT_LABEL, CONSENT_VERSION, addSignature, companyReady, consentState, contractHtml, disclosureHtml, mdy, signatureBlock, todayNewYork } from '../lib/consent';
import { fmtDate } from '../lib/format';
import { Badge, Button, Card, Field, Input, Modal, Textarea, useConfirm, useToast } from './ui';

const DOC_CSS = 'body{font-family:Georgia,serif;font-size:15px;line-height:1.5;color:#1e293b;max-width:780px;margin:16px auto;padding:0 16px}h2{font-size:20px}h3{font-size:16px;margin-top:18px}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #cbd5e1;padding:4px 6px;text-align:left}.croa{border:2px solid #0f172a;padding:8px}.firma{border-top:1px solid #94a3b8;padding-top:8px;margin-top:16px}';
// La CSP impide que corra cualquier script, también en la copia descargada que se abre fuera de la app.
const page = (body) => `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Contrato</title><style>${DOC_CSS}</style></head><body>${body}</body></html>`;

// El HTML guardado lo mandó el navegador del cliente: se muestra en un iframe sin scripts ni acceso a la app.
export function DocFrame({ html, className = 'h-80' }) {
  return <iframe title="Documento" sandbox="" srcDoc={page(html)} className={`w-full rounded-lg border border-slate-200 bg-white ${className}`} />;
}
function download(row) {
  const blob = new Blob([page(`${row.disclosure_html}<hr style="margin:32px 0">${row.contract_html}`)], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `contrato-${row.signed_at.slice(0, 10)}.html`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function useConsent(clientId) {
  const [row, setRow] = useState(undefined);
  const load = async () => {
    const { data } = await supabase.from('cr_consents').select('*').eq('client_id', clientId).order('signed_at', { ascending: false }).limit(1);
    setRow(data?.[0] || null);
  };
  useEffect(() => { if (clientId) load(); }, [clientId]); // eslint-disable-line
  return [row, load];
}

// ------------------------------------------------------------------ portal del cliente
export function ConsentStep({ client, items, row, reload }) {
  const { settings } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [deadline, setDeadline] = useState(null);
  const [ack, setAck] = useState(false);
  const [esign, setEsign] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const state = consentState(row);
  const needsSign = state === 'sin_firmar' || state === 'cancelado';

  useEffect(() => {
    if (!needsSign) return;
    supabase.rpc('cr_business_days_after', { d: todayNewYork(), n: 3 }).then(({ data }) => setDeadline(data || null));
  }, [needsSign]);

  if (row === undefined) return <Loader2 className="h-5 w-5 animate-spin text-slate-400" />;

  if (!needsSign) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2"><Badge className={CONSENT_LABEL[state][1]}>{CONSENT_LABEL[state][0]}</Badge><span className="text-sm text-slate-500">Firmado el {fmtDate(row.signed_at)}</span></div>
        {state === 'espera' && <p className="text-sm text-slate-600">Puedes cancelar sin costo hasta la medianoche del <b>{mdy(row.cancel_deadline)}</b>. Empezamos a trabajar después de esa fecha.</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={Download} onClick={() => download(row)}>Guardar mi copia</Button>
          <Button variant="dangerGhost" icon={Ban} onClick={async () => {
            const ok = await confirm({ title: 'Cancelar mi contrato', message: state === 'espera' ? 'Cancelas sin costo ni obligación. No mandaremos ninguna carta.' : 'Terminas el servicio. Solo pagarías lo que ya se eliminó por cartas enviadas antes de hoy.', ok: 'Sí, cancelar' });
            if (!ok) return;
            const { error } = await supabase.rpc('cr_cancel_consent', { p_reason: 'Cancelado por el cliente en el portal' });
            if (error) toast(error.message, 'error'); else { toast('Contrato cancelado'); reload(); }
          }}>Cancelar mi contrato</Button>
        </div>
      </div>
    );
  }

  if (items === null) return <Loader2 className="h-5 w-5 animate-spin text-slate-400" />;
  // la ley pide el total de los pagos: sin reporte no hay partidas que contar
  if (!items.length) {
    return <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Tu contrato estará listo cuando revisemos tu reporte de crédito. Ahí verás cuánto costaría como máximo antes de firmar.</p>;
  }
  if (!companyReady(settings)) {
    return <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Todavía no puedes firmar: tu asesor debe completar el nombre y la dirección de la empresa. Te avisaremos.</p>;
  }
  if (!deadline) return <Loader2 className="h-5 w-5 animate-spin text-slate-400" />;

  const disclosure = disclosureHtml();
  const contract = contractHtml({ settings, client, items, deadlineISO: deadline });
  const sign = async () => {
    setBusy(true);
    const when = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' (hora del Este)';
    const { error } = await supabase.rpc('cr_sign_consent', {
      p_name: name, p_version: CONSENT_VERSION, p_user_agent: navigator.userAgent,
      p_disclosure: disclosure + signatureBlock(name, `Recibido antes de firmar el contrato · ${when}`),
      p_contract: addSignature(contract, signatureBlock(name, when)),
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Contrato firmado. Guarda tu copia.');
    reload();
  };

  return (
    <div className="space-y-4">
      {state === 'cancelado' && <p className="text-sm text-slate-500">Cancelaste tu contrato anterior el {fmtDate(row.cancelled_at)}. Si quieres volver, firma otra vez.</p>}
      <div>
        <div className="mb-1 text-sm font-semibold">1. Tus derechos (documento aparte, lo exige la ley)</div>
        <DocFrame html={disclosure} />
        <label className="mt-2 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} /> Recibí y leí «Consumer Credit File Rights Under State and Federal Law» antes de firmar el contrato.</label>
      </div>
      <div>
        <div className="mb-1 text-sm font-semibold">2. Contrato, autorización y aviso de cancelación</div>
        <DocFrame html={contract} className="h-96" />
        <label className="mt-2 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={esign} onChange={(e) => setEsign(e.target.checked)} /> Acepto firmar de forma electrónica y recibir estos documentos en mi portal.</label>
      </div>
      <div className="rounded-xl border-2 border-slate-900 p-3 text-sm font-bold">
        You may cancel this contract without penalty or obligation at any time before midnight of the 3rd business day after the date on which you signed the contract. See the attached notice of cancellation form for an explanation of this right.
        <div className="mt-1 font-semibold">Puedes cancelar sin costo hasta la medianoche del {mdy(deadline)}.</div>
      </div>
      <Field label="Escribe tu nombre completo para firmar"><Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
      <Button variant="success" icon={FileSignature} loading={busy} disabled={!ack || !esign || name.trim().length < 5} onClick={sign}>Firmar contrato</Button>
    </div>
  );
}

// ------------------------------------------------------------------ ficha del cliente (admin)
export function ConsentAdmin({ clientId, onChange }) {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [view, setView] = useState(null);
  const [cancel, setCancel] = useState(null);
  const load = async () => {
    const { data } = await supabase.from('cr_consents').select('*').eq('client_id', clientId).order('signed_at', { ascending: false });
    setRows(data || []); onChange?.(data?.[0] || null);
  };
  useEffect(() => { load(); }, [clientId]); // eslint-disable-line
  if (!rows) return null;
  const last = rows[0]; const state = consentState(last);
  return (
    <Card title="Contrato y autorización" actions={<Badge className={CONSENT_LABEL[state][1]}>{CONSENT_LABEL[state][0]}</Badge>}>
      {!last ? <p className="text-sm text-slate-500">El cliente todavía no firma. Lo firma en su portal. Sin contrato vigente no se puede enviar ninguna carta.</p> : (
        <div className="space-y-2 text-sm">
          <div>Firmó <b>{last.signed_name}</b> el {fmtDate(last.signed_at)} · versión {last.version}</div>
          <div>Puede cancelar hasta la medianoche del <b>{mdy(last.cancel_deadline)}</b>{state === 'espera' && ' · todavía no se puede enviar nada'}</div>
          {last.cancelled_at && <div className="text-red-700">Cancelado el {fmtDate(last.cancelled_at)} por {last.cancelled_by}{last.cancel_reason ? `: ${last.cancel_reason}` : ''}</div>}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="secondary" onClick={() => setView(last)}>Ver lo que firmó</Button>
            <Button size="sm" variant="secondary" icon={Download} onClick={() => download(last)}>Descargar</Button>
            {!last.cancelled_at && <Button size="sm" variant="dangerGhost" icon={Ban} onClick={() => setCancel('')}>Registrar cancelación</Button>}
          </div>
          {rows.length > 1 && <div className="text-xs text-slate-400">{rows.length - 1} contrato(s) anterior(es) guardado(s).</div>}
        </div>
      )}
      <Modal open={!!view} onClose={() => setView(null)} title="Lo que firmó el cliente" size="lg" footer={<Button variant="secondary" onClick={() => setView(null)}>Cerrar</Button>}>
        {view && <DocFrame html={`${view.disclosure_html}<hr>${view.contract_html}`} className="h-[65vh]" />}
      </Modal>
      <Modal open={cancel !== null} onClose={() => setCancel(null)} title="Registrar cancelación" size="sm"
        footer={<><Button variant="secondary" onClick={() => setCancel(null)}>Volver</Button><Button variant="danger" disabled={!cancel?.trim()} onClick={async () => {
          const { error } = await supabase.rpc('cr_cancel_consent', { p_reason: cancel, p_client: clientId });
          if (error) toast(error.message, 'error'); else { toast('Cancelación registrada'); setCancel(null); load(); }
        }}>Registrar</Button></>}>
        <Field label="¿Cómo llegó el aviso?"><Textarea rows={3} value={cancel || ''} onChange={(e) => setCancel(e.target.value)} placeholder="Ej.: carta recibida por correo el 11/18/2026" /></Field>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><CheckCircle2 className="h-3.5 w-3.5" /> Queda en el historial. Ninguna carta de este cliente se podrá enviar.</p>
      </Modal>
    </Card>
  );
}
