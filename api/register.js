import { admin, handle, usernameToEmail } from './_lib.js';

// Registro público de clientes nuevos desde /registro
export default handle(async (req, body) => {
  if (req.method !== 'POST') throw Object.assign(new Error('Método no permitido'), { status: 405 });
  const sb = admin();
  const { data: settings } = await sb.from('cr_settings').select('allow_public_signup').eq('id', 1).maybeSingle();
  if (settings && settings.allow_public_signup === false) throw new Error('El registro está cerrado');

  const username = String(body.username || '').trim().toLowerCase();
  const { password, first_name, last_name, phone, email } = body;
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new Error('Usuario inválido (3–30 letras o números, sin espacios)');
  if (!password || password.length < 8) throw new Error('La contraseña debe tener mínimo 8 caracteres');
  if (!first_name || !last_name || !phone) throw new Error('Nombre, apellido y teléfono son obligatorios');

  const { data: exists } = await sb.from('cr_clients').select('id').eq('username', username).maybeSingle();
  if (exists) throw new Error('Ese usuario ya existe, escoge otro');

  const { data: u, error } = await sb.auth.admin.createUser({ email: usernameToEmail(username), password, email_confirm: true, user_metadata: { role: 'client', username } });
  if (error) throw new Error(error.message.includes('already') ? 'Ese usuario ya existe, escoge otro' : error.message);

  const { data: client, error: e2 } = await sb.from('cr_clients').insert({
    user_id: u.user.id, username, first_name, last_name, phone, email: email || null,
    source: 'portal', status: 'nuevo', reviewed: false,
  }).select('id').single();
  if (e2) { await sb.auth.admin.deleteUser(u.user.id); throw e2; }
  await sb.from('cr_activity').insert({ client_id: client.id, message: '🆕 Cliente se registró desde el portal' });
  return { ok: true };
});
