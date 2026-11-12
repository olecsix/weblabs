import { useState, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router';
import { toast } from 'sonner';
import { Button } from './ui';
import { useAuth } from '@/stores/auth';
import { api, apiError } from '@/services/api';

export function SessionActions({ extra }: { extra?: ReactNode }) {
  const user = useAuth((state) => state.user);
  const [pending, setPending] = useState(false);
  async function logout() {
    setPending(true);
    try {
      await api.post('/auth/logout');
    } catch (error) {
      toast.error(apiError(error).message);
    } finally {
      useAuth.getState().clear();
      setPending(false);
    }
  }
  return user ? (
    <>
      {extra}
      <Link className="button button-quiet" to="/dashboard">
        Робочий простір
      </Link>
      <Button className="button-quiet" disabled={pending} onClick={logout}>
        Вийти
      </Button>
    </>
  ) : (
    <>
      <Link className="button button-quiet" to="/login">
        Увійти
      </Link>
      <Link className="button" to="/register">
        Реєстрація
      </Link>
    </>
  );
}

export function ProtectedRoute() {
  const user = useAuth((state) => state.user);
  const location = useLocation();
  return user ? (
    <Outlet />
  ) : (
    <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />
  );
}

export function Workspace({ children }: { children?: ReactNode }) {
  const user = useAuth((state) => state.user);
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="workspace">
      <aside className="sidebar card">
        <div className="row spread">
          <div>
            <p className="eyebrow">Робочий простір</p>
            <strong>{user?.name}</strong>
          </div>
          <Button
            className="button-quiet mobile-menu"
            aria-expanded={expanded}
            aria-controls="side-links"
            onClick={() => setExpanded(!expanded)}
          >
            Меню
          </Button>
        </div>
        <nav
          aria-label="Робочий простір"
          id="side-links"
          className={expanded ? 'side-links expanded' : 'side-links'}
        >
          <NavLink to="/dashboard" onClick={() => setExpanded(false)}>
            Огляд
          </NavLink>
          <NavLink to="/projects" onClick={() => setExpanded(false)}>
            Проєкти
          </NavLink>
          <NavLink to="/tasks" onClick={() => setExpanded(false)}>
            Завдання
          </NavLink>
        </nav>
        {children}
      </aside>
      <section className="workspace-content">
        <Outlet />
      </section>
    </div>
  );
}

export function Breadcrumb({
  links,
  current,
}: {
  links: { to: string; text: string }[];
  current: string;
}) {
  return (
    <nav className="breadcrumbs" aria-label="Поточний шлях">
      {links.map(({ to, text }) => (
        <span key={to}>
          <Link to={to}>{text}</Link> <span aria-hidden>›</span>{' '}
        </span>
      ))}
      <span aria-current="page">{current}</span>
    </nav>
  );
}
