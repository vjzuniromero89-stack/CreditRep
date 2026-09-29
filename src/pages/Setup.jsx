import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { callApi } from '../lib/api';
import { supabase } from '../lib/supabase';
import { Button, Field, Input, Spinner } from '../components/ui';
import AuthShell from './AuthShell';

export default function Setup() {
  const nav = useNavigate();
  const [needs, setNeeds] = useState(null);
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { callApi('setup', {}, 'GET').then((r) => setNeeds(r.needsSetup)).catch((e) => { setErr(e.message); setNeeds(false); }); }, []);

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      await callApi('setup', f);
      await supabase.auth.signInWithPassword({ email: f.email, password: f.password });
      nav('/admin');
    } catch (e2) { setErr(e2.message); }
    setBusy(false);
  };

  if (needs === null) return <Spinner />;
  return (
    <AuthShell title="Configuración inicial" subtitle="Crea tu cuenta de administrador. Esto solo se hace una vez.">
      {!needs ? (
        <div className="space-y-3 text-sm text-slate-600">
          <p>{err || 'La cuenta de administrador ya fue creada.'}</p>
          <Link to="/login" className="font-semibold text-brand-700">Ir a iniciar sesión →</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Tu nombre"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
          <Field label="Email"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
          <Field label="Contraseña" hint="Mínimo 8 caracteres"><Input type="password" minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></Field>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <Button type="submit" className="w-full" size="lg" loading={busy}>Crear administrador</Button>
        </form>
      )}
    </AuthShell>
  );
}
