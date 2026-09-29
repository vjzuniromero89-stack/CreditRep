import { createClient } from '@supabase/supabase-js';

/* global __SUPABASE_URL__, __SUPABASE_KEY__ */
const url = typeof __SUPABASE_URL__ !== 'undefined' ? __SUPABASE_URL__ : '';
const key = typeof __SUPABASE_KEY__ !== 'undefined' ? __SUPABASE_KEY__ : '';

export const configured = !!(url && key);
export const supabase = createClient(url || 'http://localhost', key || 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true },
});
