import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, session: null, role: null, client: null });
  const [settings, setSettings] = useState(null);

  const resolve = useCallback(async (session) => {
    if (!session) { setState({ loading: false, session: null, role: null, client: null }); return; }
    const { data: isAdmin } = await supabase.rpc('cr_is_admin');
    if (isAdmin) { setState({ loading: false, session, role: 'admin', client: null }); return; }
    const { data: client } = await supabase.from('cr_clients').select('*').eq('user_id', session.user.id).maybeSingle();
    setState({ loading: false, session, role: client ? 'client' : 'none', client });
  }, []);

  const loadSettings = useCallback(async () => {
    const { data } = await supabase.from('cr_settings').select('*').eq('id', 1).maybeSingle();
    setSettings(data || {});
  }, []);

  useEffect(() => {
    loadSettings();
    supabase.auth.getSession().then(({ data }) => resolve(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        setState((s) => ({ ...s, loading: true }));
        setTimeout(() => resolve(session), 0);
      }
    });
    return () => sub?.subscription?.unsubscribe();
  }, [resolve, loadSettings]);

  const refreshClient = useCallback(async () => {
    if (!state.session) return;
    const { data: client } = await supabase.from('cr_clients').select('*').eq('user_id', state.session.user.id).maybeSingle();
    setState((s) => ({ ...s, client }));
  }, [state.session]);

  const signOut = async () => { await supabase.auth.signOut(); };

  return <AuthCtx.Provider value={{ ...state, settings, loadSettings, refreshClient, signOut }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
