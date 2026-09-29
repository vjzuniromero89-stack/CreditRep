import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Acepta los nombres de variables de Vercel/Supabase (SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
// o los de Vite (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY). La clave secreta NUNCA se manda al navegador.
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY
    || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return {
    plugins: [react()],
    define: {
      __SUPABASE_URL__: JSON.stringify(url),
      __SUPABASE_KEY__: JSON.stringify(key),
    },
    build: { chunkSizeWarningLimit: 1500 },
  };
});
