import { useEffect, useRef, useState } from 'react';
import { Camera, FileText, Trash2, Upload, ExternalLink, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { DOC_TYPES } from '../lib/constants';
import { fmtDate } from '../lib/format';
import { Button, Badge, useConfirm, useToast, cx } from './ui';

// Reduce el tamaño de las fotos del celular antes de subirlas
export async function compressImage(file, max = 1800, quality = 0.85) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
    if (!blob || blob.size > file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch { return file; }
}

export default function DocManager({ clientId, uploadedBy = 'admin', types = Object.keys(DOC_TYPES), onChange, highlight = [] }) {
  const [docs, setDocs] = useState([]);
  const [urls, setUrls] = useState({});
  const [busy, setBusy] = useState(null);
  const confirm = useConfirm();
  const toast = useToast();
  const inputs = useRef({});

  const load = async () => {
    const { data } = await supabase.from('cr_documents').select('*').eq('client_id', clientId).order('created_at', { ascending: false });
    setDocs(data || []);
    if (data?.length) {
      const { data: signed } = await supabase.storage.from('cr-files').createSignedUrls(data.map((d) => d.file_path), 3600);
      const m = {};
      (signed || []).forEach((s, i) => { if (s?.signedUrl) m[data[i].id] = s.signedUrl; });
      setUrls(m);
    }
    onChange?.(data || []);
  };
  useEffect(() => { if (clientId) load(); /* eslint-disable-next-line */ }, [clientId]);

  const upload = async (type, fileList) => {
    const files = [...(fileList || [])];
    if (!files.length) return;
    setBusy(type);
    try {
      for (const f0 of files) {
        const f = await compressImage(f0);
        const path = `${clientId}/docs/${type}_${Date.now()}_${f.name.replace(/[^a-z0-9._-]/gi, '_')}`;
        const up = await supabase.storage.from('cr-files').upload(path, f, { contentType: f.type });
        if (up.error) throw up.error;
        const ins = await supabase.from('cr_documents').insert({ client_id: clientId, doc_type: type, file_path: path, file_name: f0.name, mime: f.type, uploaded_by: uploadedBy });
        if (ins.error) throw ins.error;
      }
      toast('Documento guardado');
      await load();
    } catch (e) { toast('No se pudo subir: ' + e.message, 'error'); }
    setBusy(null);
  };

  const remove = async (d) => {
    if (!(await confirm({ title: 'Borrar documento', message: `¿Borrar "${DOC_TYPES[d.doc_type] || d.doc_type}"? No se puede deshacer.`, ok: 'Borrar' }))) return;
    await supabase.storage.from('cr-files').remove([d.file_path]);
    const { error } = await supabase.from('cr_documents').delete().eq('id', d.id);
    if (error) toast(error.message, 'error'); else { toast('Documento borrado'); load(); }
  };

  const isImg = (d) => (d.mime || '').startsWith('image/');
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {types.map((t) => {
          const has = docs.some((d) => d.doc_type === t);
          return (
            <div key={t} className={cx('rounded-xl border-2 border-dashed p-3', has ? 'border-emerald-200 bg-emerald-50/40' : highlight.includes(t) ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200')}>
              <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                {has && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}{DOC_TYPES[t]}
              </div>
              <div className="flex flex-wrap gap-2">
                <input ref={(el) => (inputs.current[t + 'cam'] = el)} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { upload(t, e.target.files); e.target.value = ''; }} />
                <input ref={(el) => (inputs.current[t]= el)} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => { upload(t, e.target.files); e.target.value = ''; }} />
                <Button size="sm" icon={Camera} loading={busy === t} onClick={() => inputs.current[t + 'cam']?.click()}>Tomar foto</Button>
                <Button size="sm" variant="secondary" icon={Upload} disabled={busy === t} onClick={() => inputs.current[t]?.click()}>Subir archivo</Button>
              </div>
            </div>
          );
        })}
      </div>
      {docs.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {docs.map((d) => (
            <div key={d.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <a href={urls[d.id]} target="_blank" rel="noreferrer" className="block aspect-[4/3] bg-slate-100">
                {isImg(d) && urls[d.id] ? <img src={urls[d.id]} alt={d.doc_type} className="h-full w-full object-cover" /> :
                  <div className="flex h-full items-center justify-center text-slate-400"><FileText className="h-10 w-10" /></div>}
              </a>
              <div className="flex items-start justify-between gap-1 p-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold">{DOC_TYPES[d.doc_type] || d.doc_type}</div>
                  <div className="text-[11px] text-slate-500">{fmtDate(d.created_at)} · <Badge className="px-1.5 py-0 text-[10px] bg-slate-100 text-slate-600 ring-slate-200">{d.uploaded_by}</Badge></div>
                </div>
                <div className="flex">
                  {urls[d.id] && <a href={urls[d.id]} target="_blank" rel="noreferrer" className="rounded p-1 text-slate-400 hover:bg-slate-100"><ExternalLink className="h-4 w-4" /></a>}
                  {(uploadedBy === 'admin' || d.uploaded_by === 'cliente') && <button onClick={() => remove(d)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Borrar"><Trash2 className="h-4 w-4" /></button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
