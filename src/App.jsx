import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { configured } from './lib/supabase';
import { UIProvider, Spinner } from './components/ui';
import AdminLayout from './components/AdminLayout';
import Login from './pages/Login';
import Setup from './pages/Setup';
import Register from './pages/Register';
import Dashboard from './pages/admin/Dashboard';
import Clients from './pages/admin/Clients';
import ClientDetail from './pages/admin/ClientDetail';
import Charges from './pages/admin/Charges';
import Letters from './pages/admin/Letters';
import Templates from './pages/admin/Templates';
import Settings from './pages/admin/Settings';
import PrintLetters from './pages/admin/PrintLetters';
import Portal from './pages/portal/Portal';

function Guard({ role, children }) {
  const auth = useAuth();
  if (auth.loading) return <Spinner />;
  if (!auth.session) return <Navigate to="/login" replace />;
  if (auth.role !== role) return <Navigate to="/" replace />;
  return children;
}

function Home() {
  const auth = useAuth();
  if (auth.loading) return <Spinner />;
  if (!auth.session) return <Navigate to="/login" replace />;
  if (auth.role === 'admin') return <Navigate to="/admin" replace />;
  if (auth.role === 'client') return <Navigate to="/portal" replace />;
  return <Login noAccess />;
}

function NotConfigured() {
  return (
    <div className="mx-auto mt-20 max-w-lg card p-6">
      <h1 className="text-xl font-bold">Falta configurar Supabase</h1>
      <p className="mt-2 text-sm text-slate-600">Agrega las variables <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> en Vercel (Settings → Environment Variables) y vuelve a publicar.</p>
    </div>
  );
}

export default function App() {
  if (!configured) return <NotConfigured />;
  return (
    <UIProvider>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/registro" element={<Register />} />
          <Route path="/portal" element={<Guard role="client"><Portal /></Guard>} />
          <Route path="/admin/imprimir" element={<Guard role="admin"><PrintLetters /></Guard>} />
          <Route path="/admin" element={<Guard role="admin"><AdminLayout /></Guard>}>
            <Route index element={<Dashboard />} />
            <Route path="clientes" element={<Clients />} />
            <Route path="clientes/:id" element={<ClientDetail />} />
            <Route path="cobros" element={<Charges />} />
            <Route path="cartas" element={<Letters />} />
            <Route path="plantillas" element={<Templates />} />
            <Route path="configuracion" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </UIProvider>
  );
}
