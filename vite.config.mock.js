// Solo para pruebas locales sin Supabase: npx vite --config vite.config.mock.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react(), {
    name: 'mock-alias',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (!importer || importer.includes('/tests/mock/')) return null;
      if (/\/lib\/supabase(\.js)?$/.test(source) || source === './supabase') return path.resolve('tests/mock/supabaseMock.js');
      if (/\/lib\/api(\.js)?$/.test(source) || (source === './api' && importer.includes('/src/lib/'))) return path.resolve('tests/mock/apiMock.js');
      return null;
    },
  }],
});
