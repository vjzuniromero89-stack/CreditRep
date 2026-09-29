import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { callApi } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { usernameToEmail } from '../lib/constants';
import { Button, Field, Input } from '../components/ui';
import AuthShell from './AuthShell';

export default function Register() {
  const nav = useNavigate();
  const { settings } = useAuth();
  const [f, setF] = useState({ first_name: '', last_name: '', phone: '', email: '', username: '', password: '', password2: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  if (settings && settings.allow_public_signup === false) {
    return <AuthShell title="Registro cerrado" subtitle="Comunícate con nosotros para crear tu cuenta."><Link to="/login" className="text-brand-700">← Volver</Link></AuthShell>;
  }

  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (f.password !== f.password2) { setErr('Las contraseñas no coinciden.'); return; }
    if (!/^[a-z0-9._-]{3,30}$/i.test(f.username)) { setErr('El usuario debe tener 3–30 letras o números (sin espacios).'); return; }
    setBusy(true);
    try {
      const { password2, ...body } = f;
      await callApi('register', body);
      const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(f.username), password: f.password });
      if (error) throw error;
      nav('/portal');
    } catch (e2) { setErr(e2.message); }
    setBusy(false);
  };

  return (
    <AuthShell wide title="Crea tu cuenta" subtitle="Después podrás completar tu información y subir tu licencia y un bill.">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre"><Input value={f.first_name} onChange={set('first_name')} required /></Field>
        <Field label="Apellido"><Input value={f.last_name} onChange={set('last_name')} required /></Field>
        <Field label="Teléfono"><Input type="tel" value={f.phone} onChange={set('phone')} required /></Field>
        <Field label="Email (opcional)"><Input type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Usuario" hint="Con este usuario entrarás al portal"><Input value={f.username} onChange={set('username')} autoCapitalize="none" required /></Field>
        <div />
        <Field label="Contraseña" hint="Mínimo 8 caracteres"><Input type="password" minLength={8} value={f.password} onChange={set('password')} required /></Field>
        <Field label="Repite la contraseña"><Input type="password" minLength={8} value={f.password2} onChange={set('password2')} required /></Field>
        {err && <p className="text-sm text-red-600 sm:col-span-2">{err}</p>}
        <Button type="submit" className="sm:col-span-2" size="lg" loading={busy}>Crear cuenta y continuar</Button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-500">¿Ya tienes cuenta? <Link to="/login" className="font-semibold text-brand-700">Inicia sesión</Link></p>
    </AuthShell>
  );
}
