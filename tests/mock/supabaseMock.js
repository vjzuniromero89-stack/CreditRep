import { load, save, insert } from './db.js';

let session = null;
try { session = JSON.parse(localStorage.getItem('crmocksession')); } catch { /* */ }
const listeners = new Set();
const setSession = (s, ev) => {
  session = s;
  if (s) localStorage.setItem('crmocksession', JSON.stringify(s)); else localStorage.removeItem('crmocksession');
  listeners.forEach((fn) => fn(ev, s));
};
const me = () => session?.user?.id;
const isAdmin = (d) => d.cr_admins.some((a) => a.user_id === me());
const myClientId = (d) => d.cr_clients.find((c) => c.user_id === me())?.id;

// Seguridad simulada (como el RLS de schema.sql)
function visible(d, table, rows) {
  if (isAdmin(d)) return rows;
  if (table === 'cr_settings') return rows;
  if (!me()) return [];
  const cid = myClientId(d);
  if (table === 'cr_clients') return rows.filter((r) => r.user_id === me());
  if (['cr_documents', 'cr_items', 'cr_letters'].includes(table)) return rows.filter((r) => r.client_id === cid);
  return [];
}

class Q {
  constructor(table) { this.table = table; this.filters = []; this.op = 'select'; this.ord = []; }
  select(cols, opts = {}) { if (this.op === 'select') { this.head = opts.head; this.count = opts.count; } this.returning = true; return this; }
  insert(rows) { this.op = 'insert'; this.payload = rows; return this; }
  upsert(rows) { this.op = 'upsert'; this.payload = rows; return this; }
  update(p) { this.op = 'update'; this.payload = p; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c, v) { this.filters.push((r) => r[c] === v); return this; }
  neq(c, v) { this.filters.push((r) => r[c] !== v); return this; }
  in(c, vs) { this.filters.push((r) => vs.includes(r[c])); return this; }
  is(c, v) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
  order(c, o = {}) { this.ord.push([c, o.ascending !== false]); return this; }
  limit(n) { this.lim = n; return this; }
  single() { this.one = 'single'; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }
  then(res, rej) { return Promise.resolve().then(() => this.run()).then(res, rej); }
  run() {
    const d = load();
    const all = d[this.table] || [];
    const match = (r) => this.filters.every((f) => f(r));
    let out;
    if (this.op === 'select') {
      out = visible(d, this.table, all).filter(match);
      for (const [c, asc] of [...this.ord].reverse()) out = [...out].sort((a, b) => ((a[c] ?? '') > (b[c] ?? '') ? 1 : (a[c] ?? '') < (b[c] ?? '') ? -1 : 0) * (asc ? 1 : -1));
      if (this.lim) out = out.slice(0, this.lim);
      if (this.head) return { data: null, count: out.length, error: null };
    } else if (this.op === 'insert' || this.op === 'upsert') {
      if (!isAdmin(d) && !['cr_documents'].includes(this.table)) return { data: null, error: { message: 'RLS: no permitido' } };
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
      out = rows.map((r) => {
        if (this.op === 'upsert') { const ex = all.find((x) => x.id === (r.id ?? 1)); if (ex) { Object.assign(ex, r); return ex; } }
        return insert(d, this.table, r);
      });
      save(d);
    } else if (this.op === 'update') {
      const rows = visible(d, this.table, all).filter(match);
      rows.forEach((r) => {
        const p = { ...this.payload };
        if (this.table === 'cr_clients' && !isAdmin(d)) { ['status', 'notes', 'reviewed', 'source', 'username', 'user_id', 'monthly_fee'].forEach((k) => delete p[k]); if (p.intake_completed && !r.intake_completed) d.cr_activity.push({ id: crypto.randomUUID(), client_id: r.id, message: 'El cliente completó su información en el portal', created_at: new Date().toISOString() }); }
        else if (!isAdmin(d)) return;
        Object.assign(r, p, { updated_at: new Date().toISOString() });
      });
      save(d); out = rows;
    } else if (this.op === 'delete') {
      const rows = visible(d, this.table, all).filter(match);
      d[this.table] = all.filter((r) => !rows.includes(r));
      if (this.table === 'cr_clients') ['cr_items', 'cr_reports', 'cr_letters', 'cr_charges', 'cr_documents', 'cr_activity'].forEach((t) => { d[t] = d[t].filter((x) => !rows.some((r) => r.id === x.client_id)); });
      save(d); out = rows;
    }
    out = JSON.parse(JSON.stringify(out || []));
    if (this.one) {
      if (this.one === 'single' && out.length !== 1) return { data: null, error: { message: 'no rows' } };
      return { data: out[0] ?? null, error: null };
    }
    return { data: out, error: null, count: out.length };
  }
}

const storageApi = (bucket) => ({
  async upload(path, file) {
    const d = load();
    const url = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); });
    d.files[path] = file.size < 1.5e6 ? url : 'data:text/plain,archivo-grande';
    save(d); return { data: { path }, error: null };
  },
  async createSignedUrl(path) { const d = load(); return { data: { signedUrl: d.files[path] || null }, error: null }; },
  async createSignedUrls(paths) { const d = load(); return { data: paths.map((p) => ({ path: p, signedUrl: d.files[p] || null })), error: null }; },
  async remove(paths) { const d = load(); paths.forEach((p) => delete d.files[p]); save(d); return { data: [], error: null }; },
  async list() { return { data: [], error: null }; },
});

export const configured = true;
export const supabase = {
  from: (t) => new Q(t),
  rpc: async (fn) => { const d = load(); if (fn === 'cr_is_admin') return { data: isAdmin(d), error: null }; return { data: null, error: null }; },
  storage: { from: storageApi },
  auth: {
    async getSession() { return { data: { session } }; },
    async signInWithPassword({ email, password }) {
      const d = load();
      const u = d.users.find((x) => x.email === email.toLowerCase() && x.password === password);
      if (!u) return { data: null, error: { message: 'Invalid login' } };
      const s = { access_token: 'tok-' + u.id, user: { id: u.id, email: u.email } };
      setSession(s, 'SIGNED_IN'); return { data: { session: s }, error: null };
    },
    async signOut() { setSession(null, 'SIGNED_OUT'); return { error: null }; },
    async updateUser({ password }) { const d = load(); const u = d.users.find((x) => x.id === me()); if (u) u.password = password; save(d); return { error: null }; },
    onAuthStateChange(fn) { listeners.add(fn); return { data: { subscription: { unsubscribe: () => listeners.delete(fn) } } }; },
  },
  _session: () => session,
};
