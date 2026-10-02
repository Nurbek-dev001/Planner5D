import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router';
import { useAuth } from './store/auth';
import Landing from './pages/Landing';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';

const EditorPage = lazy(() => import('./pages/EditorPage'));
const DemoPage = lazy(() => import('./pages/DemoPage'));

function Protected({ children }: { children: ReactNode }) {
  const user = useAuth((s) => s.user);
  return user ? children : <Navigate to="/login" replace />;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const user = useAuth((s) => s.user);
  return user ? <Navigate to="/dashboard" replace /> : children;
}

const Loading = () => <div className="flex h-full items-center justify-center text-gray-400">Загрузка…</div>;

/** Static build without a backend (VITE_STATIC_DEMO=1): only the guest demo editor */
const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === '1';

export default function App() {
  if (STATIC_DEMO)
    return (
      <MemoryRouter initialEntries={['/demo']}>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="*" element={<DemoPage />} />
          </Routes>
        </Suspense>
      </MemoryRouter>
    );
  return <FullApp />;
}

function FullApp() {
  const { loading, init } = useAuth();
  useEffect(() => {
    init();
  }, [init]);
  if (loading) return <Loading />;

  return (
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<GuestOnly><Landing /></GuestOnly>} />
          <Route path="/login" element={<GuestOnly><AuthPage mode="login" /></GuestOnly>} />
          <Route path="/register" element={<GuestOnly><AuthPage mode="register" /></GuestOnly>} />
          <Route path="/demo" element={<DemoPage />} />
          <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
          <Route path="/project/:id" element={<Protected><EditorPage /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
