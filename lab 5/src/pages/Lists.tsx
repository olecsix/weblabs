import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button, Card, ErrorMessage, Input, Skeleton } from '@/components/ui';
import { Pagination, RecordList, RecordTable } from '@/components/Records';
import { StatusBadge } from '@/components/Status';
import { useDebounce } from '@/hooks/useDebounce';
import { list } from '@/services/data';
import { useAuth } from '@/stores/auth';
import type { Project, Task } from '@/types/api';
import { formatDate, priorityText, statusText } from '@/utils/format';

const limit = 10;
function useFilters() {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const search = useDebounce(q.trim());
  return {
    q,
    sort,
    page,
    search,
    setPage,
    setSort(value: string) {
      setSort(value);
      setPage(1);
    },
    setQ(value: string) {
      setQ(value);
      setPage(1);
    },
  };
}

function Filters({ state }: { state: ReturnType<typeof useFilters> }) {
  return (
    <>
      <label className="field">
        Пошук
        <Input
          type="search"
          value={state.q}
          maxLength={100}
          onChange={(event) => state.setQ(event.target.value)}
          placeholder="Назва або опис"
        />
      </label>
      <label className="field">
        Сортування
        <select
          className="input"
          value={state.sort}
          onChange={(event) => state.setSort(event.target.value)}
        >
          <option value="newest">Спочатку нові</option>
          <option value="oldest">Спочатку старі</option>
          <option value="name">За назвою</option>
        </select>
      </label>
    </>
  );
}

export function ProjectList() {
  const filters = useFilters();
  const [grid, setGrid] = useState(true);
  const params = { q: filters.search, sort: filters.sort, page: filters.page, limit };
  const result = useQuery({
    queryKey: ['projects', params],
    queryFn: ({ signal }) => list<Project>('/projects', params, signal),
    placeholderData: keepPreviousData,
  });
  return (
    <div className="page">
      <div className="row spread">
        <h1>Проєкти</h1>
        <Link className="button" to="/projects/new">
          ＋ Новий проєкт
        </Link>
      </div>
      <Card>
        <div className="filters">
          <Filters state={filters} />
          <Button className="button-quiet" onClick={() => setGrid(!grid)}>
            {grid ? 'Список' : 'Сітка'}
          </Button>
        </div>
      </Card>
      {result.isPending ? (
        <Skeleton />
      ) : result.error ? (
        <ErrorMessage>{result.error.message}</ErrorMessage>
      ) : (
        <>
          {!result.data.data.length && <Card>Проєктів не знайдено.</Card>}
          <RecordList
            grid={grid}
            rows={result.data.data}
            render={(project) => (
              <Card className="stack">
                <h2>
                  <Link className="text-link" to={`/projects/${project.id}`}>
                    {project.name}
                  </Link>
                </h2>
                <p className="muted small">{project.description || 'Без опису'}</p>
                <p className="muted small">Створено {formatDate(project.createdAt)}</p>
              </Card>
            )}
          />
          <Pagination
            page={filters.page}
            pages={result.data.meta.totalPages}
            setPage={filters.setPage}
          />
        </>
      )}
    </div>
  );
}

export function TaskList({ extra }: { extra?: React.ReactNode }) {
  const filters = useFilters();
  const [url, setUrl] = useSearchParams();
  const [status, setStatus] = useState('');
  const projectId = url.get('projectId') ?? '';
  const projects = useQuery({
    queryKey: ['projects', 'options'],
    queryFn: ({ signal }) => list<Project>('/projects', { limit: 100, sort: 'name' }, signal),
  });
  const params = {
    q: filters.search,
    sort: filters.sort,
    page: filters.page,
    limit,
    projectId: projectId || undefined,
    status: status || undefined,
  };
  const result = useQuery({
    queryKey: ['tasks', params],
    queryFn: ({ signal }) => list<Task>('/tasks', params, signal),
    placeholderData: keepPreviousData,
  });
  return (
    <div className="page">
      <div className="row spread">
        <h1>Завдання</h1>
        <Link
          className="button"
          to={projectId ? `/tasks/new?projectId=${projectId}` : '/tasks/new'}
        >
          ＋ Нове завдання
        </Link>
      </div>
      {extra}
      <Card>
        <div className="filters">
          <Filters state={filters} />
          <label className="field">
            Проєкт
            <select
              className="input"
              value={projectId}
              onChange={(event) => {
                setUrl(event.target.value ? { projectId: event.target.value } : {});
                filters.setPage(1);
              }}
            >
              <option value="">Усі проєкти</option>
              {projects.data?.data.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Статус
            <select
              className="input"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                filters.setPage(1);
              }}
            >
              <option value="">Усі статуси</option>
              {Object.entries(statusText).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Card>
      {result.isPending ? (
        <Skeleton />
      ) : result.error ? (
        <ErrorMessage>{result.error.message}</ErrorMessage>
      ) : (
        <>
          {result.data.data.length === 0 ? (
            <Card>Завдань не знайдено.</Card>
          ) : (
            <RecordTable
              rows={result.data.data}
              columns={[
                {
                  label: 'Завдання',
                  render: (task) => (
                    <Link className="text-link" to={`/tasks/${task.id}`}>
                      {task.title}
                    </Link>
                  ),
                },
                { label: 'Статус', render: (task) => <StatusBadge status={task.status} /> },
                { label: 'Пріоритет', render: (task) => priorityText[task.priority] },
                { label: 'Термін', render: (task) => formatDate(task.dueDate) },
              ]}
            />
          )}
          <Pagination
            page={filters.page}
            pages={result.data.meta.totalPages}
            setPage={filters.setPage}
          />
        </>
      )}
    </div>
  );
}

export function Dashboard() {
  const user = useAuth((state) => state.user);
  const counts = useQuery({
    queryKey: ['summary'],
    queryFn: async ({ signal }) => {
      const [projects, tasks, done] = await Promise.all([
        list<Project>('/projects', { limit: 1 }, signal),
        list<Task>('/tasks', { limit: 1 }, signal),
        list<Task>('/tasks', { status: 'DONE', limit: 1 }, signal),
      ]);
      return [projects.meta.total, tasks.meta.total, done.meta.total];
    },
  });
  return (
    <div className="page">
      <p className="eyebrow">Стан роботи</p>
      <h1>Огляд команди</h1>
      {counts.isPending ? (
        <Skeleton />
      ) : counts.error ? (
        <ErrorMessage>{counts.error.message}</ErrorMessage>
      ) : (
        <div className="record-grid">
          {['Проєкти', 'Завдання', 'Виконано'].map((label, index) => (
            <Card key={label}>
              <p className="muted small">{label}</p>
              <strong className="stat-number">{counts.data[index]}</strong>
            </Card>
          ))}
        </div>
      )}
      <div className="row">
        <Link className="button" to="/projects">
          Переглянути проєкти
        </Link>
        <Link className="button button-quiet" to="/tasks">
          Усі завдання
        </Link>
      </div>
      {user && (
        <Card className="stack">
          <h2>Мій профіль</h2>
          <p>
            {user.name} · {user.email}
          </p>
          <FormFieldId id={user.id} />
        </Card>
      )}
    </div>
  );
}

function FormFieldId({ id }: { id: string }) {
  return (
    <label className="field">
      Мій ідентифікатор для запрошення
      <Input readOnly value={id} onFocus={(event) => event.target.select()} />
    </label>
  );
}
