import { admin, handle, requireAdmin, usernameToEmail, genPassword, slug, uniqueUsername } from './_lib.js';

const CLIENT_FIELDS = ['first_name', 'middle_name', 'last_name', 'suffix', 'dob', 'ssn', 'email', 'phone', 'phone2', 'address', 'address2', 'city', 'state', 'zip', 'prev_address', 'employer', 'status', 'monthly_fee', 'notes', 'start_date'];

async function createLogin(sb, client, username, password) {
  const base = username ? slug(username).slice(0, 30) : `${slug(client.first_name)}.${slug(client.last_name)}`.replace(/^\.|\.$/g, '').slice(0, 28);
  const uname = username ? base : await uniqueUsername(sb, base);
  if (username) {
    const { data: ex } = await sb.from('cr_clients').select('id').eq('username', uname).maybeSingle();
    if (ex && ex.id !== client.id) throw new Error('Ese usuario ya existe');
  }
  const pass = password || genPassword();
  if (pass.length < 6) throw new Error('La contraseña debe tener mínimo 6 caracteres');
  const { data: u, error } = await sb.auth.admin.createUser({ email: usernameToEmail(uname), password: pass, email_confirm: true, user_metadata: { role: 'client', username: uname } });
  if (error) throw new Error(error.message.includes('already') ? 'Ese usuario ya existe' : error.message);
  const { error: e2 } = await sb.from('cr_clients').update({ user_id: u.user.id, username: uname }).eq('id', client.id);
  if (e2) { await sb.auth.admin.deleteUser(u.user.id); throw e2; }
  return { username: uname, password: pass };
}

export default handle(async (req, body) => {
  if (req.method !== 'POST') throw Object.assign(new Error('Método no permitido'), { status: 405 });
  const sb = admin();
  await requireAdmin(req, sb);
  const { action } = body;

  if (action === 'create_client') {
    const row = {};
    CLIENT_FIELDS.forEach((k) => { if (body.client?.[k] !== undefined && body.client[k] !== '') row[k] = body.client[k]; });
    if (!row.first_name || !row.last_name) throw new Error('Nombre y apellido son obligatorios');
    row.source = 'admin'; row.reviewed = true;
    const { data: client, error } = await sb.from('cr_clients').insert(row).select('*').single();
    if (error) throw error;
    await sb.from('cr_activity').insert({ client_id: client.id, message: '🆕 Cliente creado por el administrador' });
    if (!body.with_login) return { client };
    try {
      const creds = await createLogin(sb, client, body.username, body.password);
      return { client, ...creds };
    } catch (e) {
      return { client, loginError: e.message };
    }
  }

  const { data: client } = await sb.from('cr_clients').select('*').eq('id', body.client_id || '').maybeSingle();

  if (action === 'create_login') {
    if (!client) throw new Error('Cliente no encontrado');
    if (client.user_id) throw new Error('Este cliente ya tiene acceso');
    return createLogin(sb, client, body.username, body.password);
  }

  if (action === 'reset_password') {
    if (!client?.user_id) throw new Error('Este cliente no tiene acceso todavía');
    const pass = body.password || genPassword();
    const { error } = await sb.auth.admin.updateUserById(client.user_id, { password: pass });
    if (error) throw error;
    return { username: client.username, password: pass };
  }

  if (action === 'delete_client') {
    if (!client) throw new Error('Cliente no encontrado');
    // borrar archivos
    for (const folder of ['docs', 'reports']) {
      const { data: files } = await sb.storage.from('cr-files').list(`${client.id}/${folder}`, { limit: 1000 });
      if (files?.length) await sb.storage.from('cr-files').remove(files.map((f) => `${client.id}/${folder}/${f.name}`));
    }
    const { error } = await sb.from('cr_clients').delete().eq('id', client.id);
    if (error) throw error;
    if (client.user_id) await sb.auth.admin.deleteUser(client.user_id);
    return { ok: true };
  }

  if (action === 'add_admin') {
    const { email, password, name } = body;
    if (!email || !password || password.length < 8) throw new Error('Email y contraseña (mínimo 8) son obligatorios');
    let userId;
    const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name, role: 'admin' } });
    if (error) throw error;
    userId = data.user.id;
    const { error: e2 } = await sb.from('cr_admins').insert({ user_id: userId, name, email });
    if (e2) throw e2;
    return { ok: true };
  }

  throw new Error('Acción desconocida');
});
