import { useMutation, useQuery } from '@tanstack/react-query';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Button, Card, ErrorMessage, Skeleton } from './ui';
import { Tabs } from './Interactive';
import { ProjectPresence } from './Live';
import { StatusBadge } from './Status';
import { api } from '@/services/api';
import { item, list, queryClient, refreshData } from '@/services/data';
import type { Page, Project, Status, Task } from '@/types/api';
import { statusText } from '@/utils/format';

const statuses = ['TODO', 'IN_PROGRESS', 'DONE'] as const;

export function ProjectTools({ project, canManage }: { project: Project; canManage: boolean }) {
  return (
    <Card className="stack">
      <div className="row spread">
        <h2>Стан проєкту</h2>
        <ProjectPresence projectId={project.id} />
      </div>
      <Tabs
        label="Вигляд проєкту"
        options={[
          { id: 'stats', label: 'Статистика', content: <Chart id={project.id} /> },
          {
            id: 'board',
            label: 'Порядок завдань',
            content: <Board id={project.id} canManage={canManage} />,
          },
        ]}
      />
    </Card>
  );
}

function Chart({ id }: { id: string }) {
  const data = useQuery({
    queryKey: ['stats', id],
    queryFn: ({ signal }) => item<Record<Status, number>>(`/projects/${id}/stats`, signal),
  });
  if (data.isPending) return <Skeleton />;
  if (data.error) return <ErrorMessage>{data.error.message}</ErrorMessage>;
  const maximum = Math.max(1, ...Object.values(data.data));
  return (
    <figure className="chart" aria-label="Кількість завдань за статусами">
      {statuses.map((status) => (
        <div className="chart-line" key={status}>
          <span>{statusText[status]}</span>
          <div className="chart-track" aria-hidden>
            <span
              className={`bar-${status}`}
              style={{ width: `${(data.data[status] / maximum) * 100}%` }}
            />
          </div>
          <strong>{data.data[status]}</strong>
        </div>
      ))}
      <figcaption className="muted small">Кількість завдань за статусами</figcaption>
    </figure>
  );
}

function SortableTask({ task, disabled }: { task: Task; disabled: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled });
  return (
    <li
      className={`sortable-task ${isDragging ? 'dragging' : ''}`}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {!disabled && (
        <Button
          className="button-quiet drag-handle"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Перемістити ${task.title}`}
        >
          ⋮⋮
        </Button>
      )}
      <Link className="text-link" to={`/tasks/${task.id}`}>
        {task.title}
      </Link>
      <StatusBadge status={task.status} />
    </li>
  );
}

function Board({ id, canManage }: { id: string; canManage: boolean }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const key = ['tasks', 'order', id];
  const data = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      list<Task>('/tasks', { projectId: id, sort: 'position', limit: 100 }, signal),
  });
  const mutation = useMutation({
    mutationFn: (ids: string[]) => api.patch(`/projects/${id}/task-order`, { ids }),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Page<Task>>(key);
      if (previous) {
        const byId = new Map(previous.data.map((task) => [task.id, task]));
        queryClient.setQueryData(key, {
          ...previous,
          data: ids.map((taskId) => byId.get(taskId)).filter((task): task is Task => !!task),
        });
      }
      return previous;
    },
    onError: (error, _ids, previous) => {
      if (previous) queryClient.setQueryData(key, previous);
      toast.error(error.message);
    },
    onSettled: () => refreshData('tasks'),
  });
  if (data.isPending) return <Skeleton />;
  if (data.error) return <ErrorMessage>{data.error.message}</ErrorMessage>;
  const rows = data.data.data;
  if (!rows.length) return <p className="muted">У цьому проєкті ще немає завдань.</p>;
  const tooMany = data.data.meta.total > rows.length;
  const canSort = canManage && !tooMany;
  function finish({ active, over }: DragEndEvent) {
    if (!canSort || !over || active.id === over.id || mutation.isPending) return;
    const first = rows.findIndex((row) => row.id === active.id);
    const second = rows.findIndex((row) => row.id === over.id);
    if (first >= 0 && second >= 0)
      mutation.mutate(arrayMove(rows, first, second).map((row) => row.id));
  }
  return (
    <div className="stack">
      {tooMany && (
        <p className="muted small">Сортування доступне для проєктів із максимум 100 завданнями.</p>
      )}
      {canSort && (
        <p className="muted small">
          Перетягніть завдання або натисніть пробіл на ручці та скористайтеся стрілками.
        </p>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={finish}>
        <SortableContext items={rows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
          <ul className="record-list">
            {rows.map((task) => (
              <SortableTask key={task.id} task={task} disabled={!canSort || mutation.isPending} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}
