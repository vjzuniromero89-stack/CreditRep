import { Copy, Printer, KeyRound } from 'lucide-react';
import { Button, Modal, useToast } from './ui';
import { useAuth } from '../lib/auth';

export default function CredentialsModal({ open, onClose, creds, clientName }) {
  const toast = useToast();
  const { settings } = useAuth();
  if (!creds) return null;
  const url = `${window.location.origin}/login`;
  const text = `Hola ${clientName || ''}, este es tu acceso al portal de ${settings?.company_name || 'clientes'}:\n\nPágina: ${url}\nUsuario: ${creds.username}\nContraseña: ${creds.password}\n\nEntra y completa tu información personal y sube foto de tu licencia y un bill.`;
  const copy = async () => { await navigator.clipboard.writeText(text); toast('Copiado — pégalo en WhatsApp o texto'); };
  const print = () => {
    const w = window.open('', '_blank');
    w.document.write(`<pre style="font:16px/1.6 Arial;padding:40px;white-space:pre-wrap">${text.replace(/</g, '&lt;')}</pre>`);
    w.document.close(); w.print();
  };
  return (
    <Modal open={open} onClose={onClose} title="Acceso al portal del cliente" size="sm"
      footer={<><Button variant="secondary" icon={Printer} onClick={print}>Imprimir</Button><Button icon={Copy} onClick={copy}>Copiar mensaje</Button></>}>
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-slate-600"><KeyRound className="h-4 w-4 text-brand-600" /> Guarda o envía estos datos ahora. Por seguridad la contraseña no se vuelve a mostrar (puedes crear una nueva cuando quieras).</div>
        <div className="rounded-xl bg-slate-900 p-4 font-mono text-sm text-emerald-300">
          <div><span className="text-slate-400">Página:</span> {url}</div>
          <div><span className="text-slate-400">Usuario:</span> {creds.username}</div>
          <div><span className="text-slate-400">Contraseña:</span> {creds.password}</div>
        </div>
      </div>
    </Modal>
  );
}
