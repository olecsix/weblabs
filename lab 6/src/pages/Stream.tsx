import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Button, Card, ErrorMessage, Input, Skeleton } from '@/components/ui';
import { SearchMenu } from '@/components/Interactive';
import { StatusBadge } from '@/components/Status';
import { useDebounce } from '@/hooks/useDebounce';
import { list } from '@/services/data';
import type { Project, Task } from '@/types/api';
import { formatDate } from '@/utils/format';

export default function Stream() {
  const [project, setProject] = useState('');
  const [q, setQ] = useState('');
  const search = useDebounce(q.trim());
  const sentinel = useRef<HTMLDivElement>(null);
  const projects = useQuery({
    queryKey: ['projects', 'options'],
    queryFn: ({ signal }) => list<Project>('/projects', { limit: 100, sort: 'name' }, signal),
  });
  const {
    data,
    error,
    isPending,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useInfiniteQuery({
    queryKey: ['tasks', 'stream', project, search],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      list<Task>(
        '/tasks',
        { page: pageParam, limit: 12, q: search, projectId: project || undefined },
        signal,
      ),
    getNextPageParam: ({ meta }) => (meta.page < meta.totalPages ? meta.page + 1 : undefined),
  });
  useEffect(() => {
    if (!sentinel.current || !hasNextPage || isFetchingNextPage || isFetchNextPageError) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void fetchNextPage();
      },
      { rootMargin: '120px' },
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError]);
  const tasks = [
    ...new Map(data?.pages.flatMap((page) => page.data).map((task) => [task.id, task])).values(),
  ];
  return (
    <div className="page">
      <div className="row spread">
        <h1>Потік завдань</h1>
        <Link className="button button-quiet" to="/tasks">
          Таблиця
        </Link>
      </div>
      <Card>
        <div className="filters">
          <label className="field">
            Пошук
            <Input type="search" value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} />
          </label>
          <SearchMenu
            label="Проєкт"
            value={project}
            onChange={setProject}
            options={[
              { value: '', label: 'Усі проєкти' },
              ...(projects.data?.data ?? []).map((row) => ({ value: row.id, label: row.name })),
            ]}
          />
        </div>
      </Card>
      {isPending ? (
        <Skeleton />
      ) : (
        <>
          <ul className="record-grid">
            {tasks.map((task) => (
              <li key={task.id}>
                <Card className="stack">
                  <h2>
                    <Link className="text-link" to={`/tasks/${task.id}`}>
                      {task.title}
                    </Link>
                  </h2>
                  <div className="row">
                    <StatusBadge status={task.status} />
                    <span className="muted small">{formatDate(task.dueDate)}</span>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
          {tasks.length === 0 && !error && <Card>Завдань не знайдено.</Card>}
        </>
      )}
      {error && <ErrorMessage>{error.message}</ErrorMessage>}
      {hasNextPage && (
        <div ref={sentinel}>
          <Button
            className="button-quiet"
            disabled={isFetchingNextPage}
            onClick={() => {
              void fetchNextPage();
            }}
          >
            {isFetchingNextPage ? 'Завантаження…' : 'Показати ще'}
          </Button>
        </div>
      )}
    </div>
  );
}
