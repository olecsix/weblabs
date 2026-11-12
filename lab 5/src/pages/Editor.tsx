import { useQuery } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { Breadcrumb } from '@/components/Workspace';
import { Button, Card, ErrorMessage, FormField, Input, Skeleton } from '@/components/ui';
import { apiError } from '@/services/api';
import { item, list, refreshData, save } from '@/services/data';
import type { Member, Project, Task } from '@/types/api';
import { priorityText, statusText } from '@/utils/format';

const projectSchema = z.object({
  name: z.string().trim().min(1, 'Введіть назву').max(150),
  description: z.string().trim().max(2000),
});
const taskSchema = z.object({
  title: z.string().trim().min(1, 'Введіть назву').max(200),
  description: z.string().trim().max(5000),
  projectId: z.uuid('Оберіть проєкт'),
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  assigneeId: z.union([z.literal(''), z.uuid()]),
  dueDate: z.union([z.literal(''), z.iso.date()]),
});

export function ProjectEditor() {
  const { id } = useParams();
  const query = useQuery({
    queryKey: ['projects', id],
    queryFn: ({ signal }) => item<Project>(`/projects/${id}`, signal),
    enabled: !!id,
  });
  const heading = id ? 'Редагувати проєкт' : 'Новий проєкт';
  return (
    <div className="page narrow">
      <Breadcrumb links={[{ to: '/projects', text: 'Проєкти' }]} current={heading} />
      <h1>{heading}</h1>
      {id && query.isPending ? (
        <Skeleton />
      ) : query.error ? (
        <ErrorMessage>{query.error.message}</ErrorMessage>
      ) : (
        <ProjectForm key={id ?? 'new'} project={query.data} />
      )}
    </div>
  );
}

function ProjectForm({ project }: { project?: Project }) {
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof projectSchema>>({
    resolver: zodResolver(projectSchema),
    defaultValues: { name: project?.name ?? '', description: project?.description ?? '' },
  });
  async function submit(values: z.infer<typeof projectSchema>) {
    try {
      const result = await save<Project>(
        project ? `/projects/${project.id}` : '/projects',
        { ...values, description: values.description || null },
        !!project,
      );
      await refreshData('projects', 'summary');
      toast.success(project ? 'Проєкт оновлено' : 'Проєкт створено');
      void navigate(`/projects/${result.id}`);
    } catch (error) {
      setError('root', { message: apiError(error).message });
    }
  }
  return (
    <Card>
      <form className="stack" noValidate onSubmit={handleSubmit(submit)}>
        <FormField label="Назва проєкту" error={errors.name?.message}>
          <Input {...register('name')} />
        </FormField>
        <FormField label="Опис" error={errors.description?.message}>
          <textarea className="input" {...register('description')} />
        </FormField>
        {errors.root?.message && <ErrorMessage>{errors.root.message}</ErrorMessage>}
        <div className="row">
          <Button type="submit" disabled={isSubmitting}>
            Зберегти
          </Button>
          <Link
            className="button button-quiet"
            to={project ? `/projects/${project.id}` : '/projects'}
          >
            Скасувати
          </Link>
        </div>
      </form>
    </Card>
  );
}

export function TaskEditor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const query = useQuery({
    queryKey: ['tasks', id],
    queryFn: ({ signal }) => item<Task>(`/tasks/${id}`, signal),
    enabled: !!id,
  });
  const heading = id ? 'Редагувати завдання' : 'Нове завдання';
  return (
    <div className="page narrow">
      <Breadcrumb links={[{ to: '/tasks', text: 'Завдання' }]} current={heading} />
      <h1>{heading}</h1>
      {id && query.isPending ? (
        <Skeleton />
      ) : query.error ? (
        <ErrorMessage>{query.error.message}</ErrorMessage>
      ) : (
        <TaskForm
          key={id ?? 'new'}
          task={query.data}
          initialProject={params.get('projectId') ?? ''}
        />
      )}
    </div>
  );
}

function TaskForm({ task, initialProject }: { task?: Task; initialProject: string }) {
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    setValue,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof taskSchema>>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: task?.title ?? '',
      description: task?.description ?? '',
      projectId: task?.projectId ?? initialProject,
      status: task?.status ?? 'TODO',
      priority: task?.priority ?? 'MEDIUM',
      dueDate: task?.dueDate?.slice(0, 10) ?? '',
      assigneeId: task?.assigneeId ?? '',
    },
  });
  const projectId = useWatch({ control, name: 'projectId' });
  const assigneeId = useWatch({ control, name: 'assigneeId' });
  const projects = useQuery({
    queryKey: ['projects', 'options'],
    queryFn: ({ signal }) => list<Project>('/projects', { limit: 100, sort: 'name' }, signal),
  });
  const project = useQuery({
    queryKey: ['projects', projectId],
    queryFn: ({ signal }) => item<Project>(`/projects/${projectId}`, signal),
    enabled: !!projectId,
  });
  const members = useQuery({
    queryKey: ['members', projectId],
    queryFn: ({ signal }) => list<Member>(`/projects/${projectId}/members`, { limit: 100 }, signal),
    enabled: !!projectId,
  });
  const choices = new Map<string, string>();
  if (project.data) choices.set(project.data.ownerId, 'Власник проєкту');
  for (const member of members.data?.data ?? []) choices.set(member.userId, member.user.name);
  const projectField = register('projectId');
  async function submit({
    projectId,
    dueDate,
    description,
    assigneeId,
    ...values
  }: z.infer<typeof taskSchema>) {
    try {
      const result = await save<Task>(
        task ? `/tasks/${task.id}` : '/tasks',
        {
          ...values,
          ...(!task ? { projectId } : {}),
          description: description || null,
          dueDate: dueDate ? `${dueDate}T00:00:00.000Z` : null,
          assigneeId: assigneeId || null,
        },
        !!task,
      );
      await refreshData('tasks', 'summary', 'stats');
      toast.success(task ? 'Завдання оновлено' : 'Завдання створено');
      void navigate(`/tasks/${result.id}`);
    } catch (error) {
      setError('root', { message: apiError(error).message });
    }
  }
  return (
    <Card>
      <form className="stack" noValidate onSubmit={handleSubmit(submit)}>
        <FormField label="Назва завдання" error={errors.title?.message}>
          <Input {...register('title')} />
        </FormField>
        <FormField label="Опис" error={errors.description?.message}>
          <textarea className="input" {...register('description')} />
        </FormField>
        {task ? (
          <p className="muted small">Проєкт · {project.data?.name ?? task.projectId}</p>
        ) : (
          <FormField label="Проєкт" error={errors.projectId?.message}>
            <select
              className="input"
              {...projectField}
              value={projectId}
              onChange={(event) => {
                void projectField.onChange(event);
                setValue('assigneeId', '');
              }}
            >
              <option value="">Оберіть проєкт</option>
              {projects.data?.data.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </FormField>
        )}
        {!task && projects.data?.data.length === 0 && (
          <p>
            Спочатку{' '}
            <Link className="text-link" to="/projects/new">
              створіть проєкт
            </Link>
            .
          </p>
        )}
        {projects.error && <ErrorMessage>{projects.error.message}</ErrorMessage>}
        <div className="filters">
          <FormField label="Статус">
            <select className="input" {...register('status')}>
              {Object.entries(statusText).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Пріоритет">
            <select className="input" {...register('priority')}>
              {Object.entries(priorityText).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Термін" error={errors.dueDate?.message}>
            <Input type="date" {...register('dueDate')} />
          </FormField>
        </div>
        <FormField label="Виконавець" error={errors.assigneeId?.message}>
          <select className="input" {...register('assigneeId')} value={assigneeId}>
            <option value="">Без виконавця</option>
            {[...choices].map(([id, label]) => (
              <option value={id} key={id}>
                {label}
              </option>
            ))}
          </select>
        </FormField>
        {errors.root?.message && <ErrorMessage>{errors.root.message}</ErrorMessage>}
        <div className="row">
          <Button type="submit" disabled={isSubmitting}>
            Зберегти
          </Button>
          <Link className="button button-quiet" to={task ? `/tasks/${task.id}` : '/tasks'}>
            Скасувати
          </Link>
        </div>
      </form>
    </Card>
  );
}
