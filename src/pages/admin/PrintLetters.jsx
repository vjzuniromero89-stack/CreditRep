import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Printer, Send, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { DOC_TYPES } from '../../lib/constants';
import { fullName, today } from '../../lib/format';
import { Button, Spinner, useToast } from '../../components/ui';

export default function PrintLetters() {
  const [params] = useSearchParams();
  const ids = (params.get('ids') || '').split(',').filter(Boolean);
  const toast = useToast();
  const [letters, setLetters] = useState(null);
  const [clients, setClients] = useState({});
  const [docs, setDocs] = useState({});

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('cr_letters').select('*').in('id', ids).order('created_at');
      const ls = (data || []).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
      setLetters(ls);
      const cids = [...new Set(ls.map((l) => l.client_id))];
      if (!cids.length) return;
      const { data: cl } = await supabase.from('cr_clients').select('*').in('id', cids);
      setClients(Object.fromEntries((cl || []).map((c) => [c.id, c])));
      if (ls.some((l) => l.attach_docs)) {
        const { data: ds } = await supabase.from('cr_documents').select('*').in('client_id', cids).in('doc_type', ['licencia_frente', 'licencia_atras', 'bill', 'ssn']).order('created_at', { ascending: false });
        const imgs = (ds || []).filter((d) => (d.mime || '').startsWith('image/'));
        // el más reciente de cada tipo
        const pick = {};
        imgs.forEach((d) => { const k = d.client_id + d.doc_type; if (!pick[k]) pick[k] = d; });
        const list = Object.values(pick);
        if (list.length) {
          const { data: signed } = await supabase.storage.from('cr-files').createSignedUrls(list.map((d) => d.file_path), 3600);
          const by = {};
          list.forEach((d, i) => { if (signed?.[i]?.signedUrl) (by[d.client_id] = by[d.client_id] || []).push({ ...d, url: signed[i].signedUrl }); });
          const order = ['licencia_frente', 'licencia_atras', 'bill', 'ssn'];
          Object.values(by).forEach((arr) => arr.sort((a, b) => order.indexOf(a.doc_type) - order.indexOf(b.doc_type)));
          setDocs(by);
        }
      }
    })();
  }, [params]); // eslint-disable-line

  const markSent = async () => {
    const { error } = await supabase.from('cr_letters').update({ status: 'enviada', sent_at: today() }).in('id', ids);
    if (error) toast(error.message, 'error'); else toast('Cartas marcadas como enviadas');
  };

  if (!letters) return <Spinner />;
  return (
    <div className="min-h-screen bg-slate-200 pb-10 print:bg-white">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-slate-300 bg-white px-4 py-3 shadow-sm">
        <b className="mr-auto">{letters.length} carta(s) listas para imprimir</b>
        <Button icon={Printer} onClick={() => window.print()}>Imprimir</Button>
        <Button variant="secondary" icon={Send} onClick={markSent}>Marcar como enviadas</Button>
        <Button variant="ghost" icon={X} onClick={() => window.close()}>Cerrar</Button>
      </div>
      {letters.map((l) => {
        const c = clients[l.client_id];
        const att = l.attach_docs ? docs[l.client_id] || [] : [];
        return (
          <div key={l.id}>
            <div className="print-page mx-auto my-6 min-h-[11in] w-[8.5in] max-w-full bg-white p-[0.9in] shadow-lg print:my-0 print:p-[0.75in]">
              <div className="letter-body" dangerouslySetInnerHTML={{ __html: l.body_html }} />
            </div>
            {att.length > 0 && (
              <div className="print-page mx-auto my-6 min-h-[11in] w-[8.5in] max-w-full bg-white p-[0.75in] shadow-lg print:my-0">
                <div className="mb-4 text-sm font-semibold">Enclosures — {c ? fullName(c) : ''}</div>
                <div className="grid grid-cols-1 gap-6">
                  {att.map((d) => (
                    <div key={d.id} className="text-center">
                      <img src={d.url} alt={d.doc_type} className="mx-auto max-h-[4.2in] max-w-full object-contain" />
                      <div className="mt-1 text-xs text-slate-500">{DOC_TYPES[d.doc_type]}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
      {!letters.length && <p className="p-10 text-center">No se encontraron las cartas.</p>}
    </div>
  );
}
