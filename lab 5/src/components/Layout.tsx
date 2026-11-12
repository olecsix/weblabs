import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { Button } from './ui';

function ThemeButton() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  function toggle() {
    document.documentElement.classList.toggle('dark', !dark);
    localStorage.setItem('task-theme', dark ? 'light' : 'dark');
    setDark(!dark);
  }
  return (
    <Button
      className="button-quiet theme-button"
      aria-pressed={dark}
      onClick={toggle}
      aria-label="Темна тема"
    >
      {dark ? '☀' : '◐'}
    </Button>
  );
}

export function Layout({ actions }: { actions?: ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="topbar">
        <div className="shell topbar-inner">
          <Link to="/" className="brand">
            <span className="brand-mark" aria-hidden>
              ✓
            </span>
            Task Manager
          </Link>
          <nav aria-label="Головна навігація" className="topnav">
            <NavLink to="/" end>
              Головна
            </NavLink>
            <NavLink to="/about">Про проєкт</NavLink>
          </nav>
          <div className="top-actions">
            <ThemeButton />
            {actions}
          </div>
        </div>
      </header>
      <main id="main-content" className="shell grow">
        <Outlet />
      </main>
      <footer className="footer">
        <div className="shell footer-inner">
          <strong>Task Manager</strong>
          <span>Навчальний проєкт з веброзробки</span>
          <a href="https://github.com/olecsix/weblabs">GitHub ↗</a>
        </div>
      </footer>
    </div>
  );
}
