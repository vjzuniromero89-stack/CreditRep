import { admin, handle } from './_lib.js';

// GET: ¿falta crear el primer administrador?  POST: crea el primer administrador
export default handle(async (req, body) => {
  const sb = admin();
  const { count, error } = await sb.from('cr_admins').select('user_id', { count: 'exact', head: true });
  if (error) throw new Error('La base de datos no está lista. ¿Corriste el archivo schema.sql en Supabase? (' + error.message + ')');
  if (req.method === 'GET') return { needsSetup: (count || 0) === 0 };
  if (count > 0) throw Object.assign(new Error('Ya existe un administrador'), { status: 403 });
  const { email, password, name } = body;
  if (!email || !password || password.length < 8) throw new Error('Email y contraseña (mínimo 8) son obligatorios');
  const { data, error: e2 } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name, role: 'admin' } });
  if (e2) throw e2;
  const { error: e3 } = await sb.from('cr_admins').insert({ user_id: data.user.id, name, email });
  if (e3) throw e3;
  return { ok: true };
});
