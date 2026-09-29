import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { usernameToEmail } from '../lib/constants';
import { Button, Field, Input } from '../components/ui';
import AuthShell from './AuthShell';

export default function Login({ noAccess }) {
  const auth = useAuth();
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (!noAccess && auth.session && auth.role && auth.role !== 'none') return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    const email = user.includes('@') ? user.trim() : usernameToEmail(user);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    setBusy(false);
    if (error) setErr('Usuario o contraseña incorrectos.');
  };

  return (
    <AuthShell title="Iniciar sesión" subtitle="Clientes: usa el usuario y contraseña que te dimos. Administradores: usa tu email.">
      {noAccess && (
        <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Esta cuenta no tiene acceso. <button className="font-semibold underline" onClick={auth.signOut}>Cerrar sesión</button>
        </div>
      )}
      <form onSubmit={submit} className="space-y-4">
        <Field label="Usuario o email"><Input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" autoCapitalize="none" required /></Field>
        <Field label="Contraseña"><Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" required /></Field>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <Button type="submit" className="w-full" size="lg" loading={busy} icon={LogIn}>Entrar</Button>
      </form>
      {auth.settings?.allow_public_signup !== false && (
        <p className="mt-6 text-center text-sm text-slate-500">
          ¿Eres cliente nuevo? <Link to="/registro" className="font-semibold text-brand-700 hover:underline">Crea tu cuenta aquí</Link>
        </p>
      )}
    </AuthShell>
  );
}
