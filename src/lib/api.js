import { supabase } from './supabase';

// Llama a las funciones del servidor (carpeta /api en Vercel)
export async function callApi(path, body = {}, method = 'POST') {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  const res = await fetch(`/api/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  });
  let json = {};
  try { json = await res.json(); } catch { /* vacío */ }
  if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
  return json;
}
