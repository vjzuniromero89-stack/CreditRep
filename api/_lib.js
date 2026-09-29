import { createClient } from '@supabase/supabase-js';

export const CLIENT_EMAIL_DOMAIN = 'clientes.creditopro.app';
export const usernameToEmail = (u) => `${String(u || '').trim().toLowerCase()}@${CLIENT_EMAIL_DOMAIN}`;

export function admin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Falta configurar SUPABASE_SERVICE_ROLE_KEY en Vercel');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function requireAdmin(req, sb) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw Object.assign(new Error('No autorizado'), { status: 401 });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) throw Object.assign(new Error('Sesión inválida'), { status: 401 });
  const { data: row } = await sb.from('cr_admins').select('user_id').eq('user_id', data.user.id).maybeSingle();
  if (!row) throw Object.assign(new Error('Solo administradores'), { status: 403 });
  return data.user;
}

export function genPassword(len = 10) {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(len);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export function slug(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export async function uniqueUsername(sb, base) {
  let u = base || 'cliente';
  for (let i = 0; i < 50; i++) {
    const cand = i === 0 ? u : `${u}${Math.floor(10 + Math.random() * 90)}`;
    const { data } = await sb.from('cr_clients').select('id').eq('username', cand).maybeSingle();
    if (!data) return cand;
  }
  return `${u}${Date.now() % 100000}`;
}

export function send(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export function handle(fn) {
  return async (req, res) => {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const out = await fn(req, body);
      send(res, 200, out);
    } catch (e) {
      send(res, e.status || 400, { error: e.message || 'Error' });
    }
  };
}
