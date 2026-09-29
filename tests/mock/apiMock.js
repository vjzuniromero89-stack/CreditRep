import { load, save, insert } from './db.js';
import { supabase } from './supabaseMock.js';

const DOMAIN = 'clientes.creditopro.app';
const gen = () => Math.random().toString(36).slice(2, 12);
const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

export async function callApi(path, body = {}, method = 'POST') {
  await new Promise((r) => setTimeout(r, 150));
  const d = load();
  const s = supabase._session();
  const isAdmin = s && d.cr_admins.some((a) => a.user_id === s.user.id);
  const login = (client, username, password) => {
    const u = username || `${slug(client.first_name)}.${slug(client.last_name)}`;
    if (d.cr_clients.some((c) => c.username === u && c.id !== client.id)) throw new Error('Ese usuario ya existe');
    const p = password || gen();
    const id = crypto.randomUUID();
    d.users.push({ id, email: `${u}@${DOMAIN}`, password: p });
    client.user_id = id; client.username = u;
    return { username: u, password: p };
  };
  let out;
  if (path === 'setup') {
    if (method === 'GET') return { needsSetup: d.cr_admins.length === 0 };
    throw new Error('Ya existe un administrador');
  }
  if (path === 'register') {
    const u = body.username.toLowerCase();
    if (d.cr_clients.some((c) => c.username === u)) throw new Error('Ese usuario ya existe, escoge otro');
    const id = crypto.randomUUID();
    d.users.push({ id, email: `${u}@${DOMAIN}`, password: body.password });
    const c = insert(d, 'cr_clients', { user_id: id, username: u, first_name: body.first_name, last_name: body.last_name, phone: body.phone, email: body.email, source: 'portal', status: 'nuevo', reviewed: false });
    insert(d, 'cr_activity', { client_id: c.id, message: '🆕 Cliente se registró desde el portal' });
    save(d); return { ok: true };
  }
  if (!isAdmin) throw new Error('Solo administradores');
  if (body.action === 'create_client') {
    const c = insert(d, 'cr_clients', { ...body.client, source: 'admin', reviewed: true });
    out = { client: c };
    if (body.with_login) Object.assign(out, login(c, body.username, body.password));
  } else {
    const c = d.cr_clients.find((x) => x.id === body.client_id);
    if (body.action === 'create_login') out = login(c, body.username, body.password);
    if (body.action === 'reset_password') { const p = gen(); d.users.find((u) => u.id === c.user_id).password = p; out = { username: c.username, password: p }; }
    if (body.action === 'delete_client') {
      d.cr_clients = d.cr_clients.filter((x) => x.id !== c.id);
      ['cr_items', 'cr_reports', 'cr_letters', 'cr_charges', 'cr_documents', 'cr_activity'].forEach((t) => { d[t] = d[t].filter((x) => x.client_id !== c.id); });
      out = { ok: true };
    }
    if (body.action === 'add_admin') { const id = crypto.randomUUID(); d.users.push({ id, email: body.email, password: body.password }); d.cr_admins.push({ user_id: id, name: body.name, email: body.email, created_at: new Date().toISOString() }); out = { ok: true }; }
  }
  save(d);
  return out;
}
