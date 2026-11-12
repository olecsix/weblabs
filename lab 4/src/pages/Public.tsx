import { Link } from 'react-router';
import { useEffect, useState } from 'react';
import { Badge, Card, Loading } from '@/components/ui';
import { api } from '@/services/api';
import { formatDate } from '@/utils/format';

const sample = [
  { title: 'Спланувати структуру API', stage: 'Готово', variant: 'green' as const },
  { title: 'Побудувати клієнтський інтерфейс', stage: 'У роботі', variant: 'blue' as const },
  { title: 'Перевірити спільну роботу', stage: 'До роботи', variant: 'neutral' as const },
];

export function Home({ ready = false }: { ready?: boolean }) {
  return (
    <div className="home">
      <section className="hero grid lg:grid-cols-[1fr_1fr] gap-10 items-center">
        <div className="hero-copy">
          <p className="eyebrow">Командний робочий простір</p>
          <h1>
            Від плану
            <br />
            до готового.
          </h1>
          <p className="lead">
            Організовуйте проєкти, призначайте завдання та стежте за ходом роботи команди.
          </p>
          <div className="row">
            {ready ? (
              <Link className="button" to="/dashboard">
                До робочого простору →
              </Link>
            ) : (
              <Link className="button" to="/about">
                Про застосунок →
              </Link>
            )}
          </div>
        </div>
        <Card className="preview-card">
          <div className="row spread">
            <div>
              <p className="eyebrow">Приклад дошки</p>
              <h2>Розробка вебзастосунку</h2>
            </div>
            <span className="preview-count">03</span>
          </div>
          <div className="progress-track" aria-label="Одне з трьох завдань готове">
            <span />
          </div>
          <ul className="sample-list">
            {sample.map((task) => (
              <li key={task.title}>
                <span className="sample-dot" />
                <span>{task.title}</span>
                <Badge variant={task.variant}>{task.stage}</Badge>
              </li>
            ))}
          </ul>
          <p className="muted small">Приклад терміну · {formatDate('2026-12-01T00:00:00Z')}</p>
        </Card>
      </section>
      <section className="feature-grid grid sm:grid-cols-3 gap-4" aria-label="Можливості">
        <Card>
          <h2>Проєкти</h2>
          <p className="muted">Зберігайте план і завдання в одному місці.</p>
        </Card>
        <Card>
          <h2>Команда</h2>
          <p className="muted">Розподіляйте відповідальність і обговорюйте роботу.</p>
        </Card>
        <Card>
          <h2>Прогрес</h2>
          <p className="muted">Відстежуйте статуси, пріоритети й терміни.</p>
        </Card>
      </section>
    </div>
  );
}

export function About() {
  const [health, setHealth] = useState<'loading' | 'online' | 'offline'>('loading');
  useEffect(() => {
    const controller = new AbortController();
    void api
      .get('/health', {
        baseURL: api.defaults.baseURL?.replace(/\/api\/?$/, ''),
        signal: controller.signal,
      })
      .then(() => setHealth('online'))
      .catch(() => {
        if (!controller.signal.aborted) setHealth('offline');
      });
    return () => controller.abort();
  }, []);
  return (
    <div className="page narrow">
      <p className="eyebrow">Про проєкт</p>
      <h1>Task Manager</h1>
      <Card className="stack">
        <h2>Один простір для спільної роботи</h2>
        <p>
          Task Manager об’єднує проєкти, завдання, коментарі та вкладення. Власник керує учасниками,
          а команда бачить свої завдання і їхній стан.
        </p>
        <p className="muted">
          React, TypeScript і Tailwind CSS на клієнті. Express, Prisma та PostgreSQL на сервері.
        </p>
        <div>
          {health === 'loading' ? (
            <Loading label="Перевірка API…" />
          ) : (
            <Badge variant={health === 'online' ? 'green' : 'neutral'}>
              {health === 'online' ? 'API доступне' : 'API недоступне'}
            </Badge>
          )}
        </div>
      </Card>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="page narrow">
      <p className="eyebrow">404</p>
      <h1>Сторінку не знайдено</h1>
      <Link className="button" to="/">
        На головну
      </Link>
    </div>
  );
}
