import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Printer, Send, X, Mail } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { BUREAU_NAME, CLIENT_COLS, DOC_TYPES } from '../../lib/constants';
import { fullName } from '../../lib/format';
import { groupEnvelopes } from '../../lib/packageBuilder';
import { clientsBlocked, markLettersSent } from '../../lib/letterSend';
import { Button, Spinner, useToast } from '../../components/ui';

// Cartas viejas (generadas con {{cliente_ssn}}) pueden tener el SSN completo guardado: se imprime tapado.
const maskFullSSN = (html) => (html || '').replace(/\b\d{3}-\d{2}-(\d{4})\b/g, 'XXX-XX-$1');

// La tarjeta del Seguro Social nunca va en un sobre (aunque una carta vieja tenga attach_ssn = true).
const ATTACH_ORDER = [['id', ['licencia_frente', 'licencia_atras'], 'Copia de identificación'], ['bill', ['bill'], 'Comprobante de dirección']];
const flagsOf = (l) => ({ id: !!(l.attach_id || (l.attach_docs && !l.attach_bill && !l.attach_id)), bill: !!(l.attach_bill || (l.attach_docs && !l.attach_bill && !l.attach_id)) });

async function pdfFirstPage(url) {
  try {
    const pdfjs = await import('pdfjs-dist');
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const pdf = await pdfjs.getDocument(url).promise;
    const page = await pdf.getPage(1);
    const vp = page.getViewport({ scale: 1.6 });
    const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    return c.toDataURL('image/jpeg', 0.85);
  } catch { return null; }
}

export default function PrintLetters() {
  const [params] = useSearchParams();
  const toast = useToast();
  const [state, setState] = useState(null);

  useEffect(() => {
    (async () => {
      const pkgId = params.get('package');
      const ids = (params.get('ids') || '').split(',').filter(Boolean);
      let letters = []; let options = { attachMode: 'carta', cover: false };
      if (pkgId) {
        const [{ data: p }, { data: ls }] = await Promise.all([
          supabase.from('cr_packages').select('*').eq('id', pkgId).maybeSingle(),
          supabase.from('cr_letters').select('*').eq('package_id', pkgId).order('packet_order'),
        ]);
        letters = ls || []; options = { ...options, ...(p?.options || {}) };
      } else {
        const { data } = await supabase.from('cr_letters').select('*').in('id', ids);
        letters = (data || []).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
      }
      const cids = [...new Set(letters.map((l) => l.client_id))];
      const clients = {}; const docs = {};
      if (cids.length) {
        const { data: cl } = await supabase.from('cr_clients').select(CLIENT_COLS).in('id', cids);
        (cl || []).forEach((c) => { clients[c.id] = c; });
        const { data: ds } = await supabase.from('cr_documents').select('*').in('client_id', cids).order('created_at', { ascending: false });
        const pick = {};
        (ds || []).forEach((d) => { const k = d.client_id + d.doc_type; if (!pick[k]) pick[k] = d; });
        const list = Object.values(pick).filter((d) => d.doc_type !== 'otro');
        if (list.length) {
          const { data: signed } = await supabase.storage.from('cr-files').createSignedUrls(list.map((d) => d.file_path), 3600);
          for (let i = 0; i < list.length; i++) {
            const d = list[i]; let url = signed?.[i]?.signedUrl;
            if (!url) continue;
            if ((d.mime || '').includes('pdf')) url = await pdfFirstPage(url);
            if (url) (docs[d.client_id] = docs[d.client_id] || {})[d.doc_type] = url;
          }
        }
      }
      const envs = groupEnvelopes(letters);
      let blocked;
      try { blocked = await clientsBlocked(cids); } catch { blocked = cids; }   // si no se puede revisar, no se imprime
      setState({ letters, options, clients, docs, envs, pkgId, blocked });
    })();
  }, [params]);

  const markSent = async () => {
    try { await markLettersSent(state.letters); toast('Cartas marcadas como enviadas. La ronda de cada cuenta subió.'); } catch (e) { toast(e.message, 'error'); }
  };

  if (!state) return <Spinner label="Preparando el paquete…" />;
  const { letters, options, clients, docs, envs, blocked } = state;
  const stop = blocked.length > 0;   // CROA: nada sale sin contrato vigente y sin pasar los 3 días hábiles

  const attachments = (clientId, flags, keyp) => {
    const d = docs[clientId] || {};
    return ATTACH_ORDER.filter(([f]) => flags[f]).map(([f, types, title]) => {
      const imgs = types.filter((t) => d[t]);
      if (!imgs.length) return <div key={keyp + f} className="no-print mx-auto my-3 w-[8.5in] max-w-full rounded-lg bg-red-100 px-4 py-2 text-center text-sm text-red-700">⚠ Falta subir: {title} de {fullName(clients[clientId])} (súbelo en Documentos y vuelve a abrir esta página)</div>;
      return (
        <Page key={keyp + f}>
          <div className="mb-3 text-xs text-slate-500">{title} — {fullName(clients[clientId])}</div>
          <div className="flex flex-col items-center gap-6">
            {imgs.map((t) => <img key={t} src={d[t]} alt={DOC_TYPES[t]} className={f === 'id' ? 'max-h-[4.3in] max-w-full object-contain' : 'max-h-[9in] max-w-full object-contain'} />)}
          </div>
        </Page>
      );
    });
  };

  return (
    <div className="min-h-screen bg-slate-200 pb-10 print:bg-white print:pb-0">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-slate-300 bg-white px-4 py-3 shadow-sm">
        <b className="mr-auto">{letters.length} carta(s) · {envs.length} sobre(s){state.pkgId ? ' · paquete completo' : ''}</b>
        <Button icon={Printer} disabled={stop} onClick={async () => {
          // se revisa otra vez: el cliente pudo cancelar desde que se abrió esta página
          try {
            const now = await clientsBlocked(letters.map((l) => l.client_id));
            if (now.length) { setState((s) => ({ ...s, blocked: now })); return; }
            window.print();
          } catch (e) { toast(e.message, 'error'); }
        }}>Imprimir todo</Button>
        <Button variant="secondary" icon={Send} disabled={stop} onClick={markSent}>Marcar como enviadas</Button>
        <Button variant="ghost" icon={X} onClick={() => window.close()}>Cerrar</Button>
      </div>
      {stop && (
        <div className="mx-auto my-4 w-[8.5in] max-w-full rounded-lg bg-red-100 px-4 py-3 text-sm text-red-800">
          No se puede imprimir ni enviar: {blocked.map((id) => fullName(clients[id])).join(', ')} no tiene el contrato firmado y vigente, o todavía está en los 3 días hábiles para cancelar. Lo puedes revisar en su ficha → Datos del cliente.
        </div>
      )}
      <div className={stop ? 'print:hidden' : ''}>
      {envs.flatMap((env, ei) => {
        const c = clients[env.client] || {};
        const first = env.letters[0];
        const union = env.letters.reduce((a, l) => { const f = flagsOf(l); return { id: a.id || f.id, bill: a.bill || f.bill }; }, {});
        const toName = first.bureau ? BUREAU_NAME[first.bureau] : first.recipient_name;
        const pages = [];
        if (options.cover) pages.push(
          <Page key={`cov${ei}`}>
            <div className="border-4 border-slate-900 p-8">
              <div className="text-sm font-semibold uppercase tracking-widest text-slate-500">Sobre {ei + 1} de {envs.length} · Hoja de control (no se envía)</div>
              <div className="mt-2 flex items-center gap-3 text-4xl font-extrabold"><Mail className="h-9 w-9" />{toName}</div>
              <div className="mt-6 grid grid-cols-2 gap-6 text-sm">
                <div><div className="font-semibold uppercase text-slate-500">Enviar a</div><div className="mt-1 whitespace-pre-line text-base">{first.recipient_name}{'\n'}{first.recipient_address || '⚠ FALTA DIRECCIÓN'}</div></div>
                <div><div className="font-semibold uppercase text-slate-500">Cliente</div><div className="mt-1 text-base">{fullName(c)}</div><div className="text-slate-600">{c.address} {c.address2}<br />{c.city}, {c.state} {c.zip}</div></div>
              </div>
              <div className="mt-6 text-sm font-semibold uppercase text-slate-500">Contenido del sobre</div>
              <ol className="mt-2 space-y-1.5 text-base">
                {env.letters.map((l) => <li key={l.id}>☐ {l.template_name} — {l.item_ids?.length || 0} item(s){options.attachMode === 'carta' && (flagsOf(l).id || flagsOf(l).bill) ? ' + copias' : ''}</li>)}
                {options.attachMode !== 'carta' && ATTACH_ORDER.filter(([f]) => union[f]).map(([f, , title]) => <li key={f}>☐ {title}</li>)}
              </ol>
              <div className="mt-8 grid grid-cols-2 gap-6 text-sm">
                <div>Certified Mail #: ____________________________</div>
                <div>Fecha de envío: ____________________</div>
              </div>
            </div>
          </Page>,
        );
        env.letters.forEach((l) => {
          pages.push(<Page key={l.id} letter><div className="letter-body" dangerouslySetInnerHTML={{ __html: maskFullSSN(l.body_html) }} /></Page>);
          if (options.attachMode === 'carta') pages.push(...attachments(l.client_id, flagsOf(l), l.id));
        });
        if (options.attachMode !== 'carta') pages.push(...attachments(env.client, union, `env${ei}`));
        return pages;
      })}
      </div>
      {!letters.length && <p className="p-10 text-center">No se encontraron las cartas.</p>}
    </div>
  );
}

function Page({ children, letter }) {
  return <div className={`print-page mx-auto my-6 min-h-[11in] w-[8.5in] max-w-full bg-white shadow-lg print:my-0 print:min-h-0 ${letter ? 'p-[0.9in] print:p-[0.75in]' : 'p-[0.75in]'}`}>{children}</div>;
}
