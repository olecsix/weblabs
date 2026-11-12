import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { Breadcrumb } from '@/components/Workspace';
import { Button, Card, ErrorMessage, FormField, Input, Skeleton } from '@/components/ui';
import { DeleteButton } from '@/components/DeleteButton';
import { StatusBadge } from '@/components/Status';
import { api, apiError } from '@/services/api';
import { item, list, refreshData, remove, save } from '@/services/data';
import { useAuth } from '@/stores/auth';
import type { Attachment, Comment, Member, Project, Task } from '@/types/api';
import { formatBytes, formatDate, priorityText, statusText } from '@/utils/format';

export function ProjectDetails({
  additional,
}: {
  additional?: (project: Project, canManage: boolean) => ReactNode;
}) {
  const { id } = useParams();
  const actor = useAuth((state) => state.user);
  const navigate = useNavigate();
  const project = useQuery({
    queryKey: ['projects', id],
    queryFn: ({ signal }) => item<Project>(`/projects/${id}`, signal),
  });
  const members = useQuery({
    queryKey: ['members', id],
    queryFn: ({ signal }) => list<Member>(`/projects/${id}/members`, { limit: 100 }, signal),
  });
  if (project.isPending) return <Skeleton />;
  if (project.error) return <ErrorMessage>{project.error.message}</ErrorMessage>;
  const record = project.data;
  const isOwner = actor?.id === record.ownerId || actor?.role === 'ADMIN';
  const manage =
    isOwner ||
    members.data?.data.some((m) => m.userId === actor?.id && m.role === 'MANAGER') === true;
  return (
    <div className="page">
      <Breadcrumb links={[{ to: '/projects', text: 'Проєкти' }]} current={record.name} />
      <div className="row spread">
        <h1>{record.name}</h1>
        <div className="row">
          {manage && (
            <Link className="button button-quiet" to={`/projects/${id}/edit`}>
              Редагувати
            </Link>
          )}
          {isOwner && (
            <DeleteButton
              label="проєкт та всі його завдання"
              action={() => remove(`/projects/${id}`)}
              onDone={() => {
                void refreshData('projects', 'tasks', 'summary');
                void navigate('/projects');
              }}
            />
          )}
        </div>
      </div>
      <Card className="stack">
        <p className="prewrap">{record.description || 'Без опису'}</p>
        <div className="row">
          <Link className="button" to={`/tasks?projectId=${id}`}>
            Завдання проєкту
          </Link>
          <Link className="button button-quiet" to={`/tasks/new?projectId=${id}`}>
            Додати завдання
          </Link>
        </div>
      </Card>
      <Card className="stack">
        <h2>Учасники</h2>
        {members.isPending ? (
          <Skeleton />
        ) : members.error ? (
          <ErrorMessage>{members.error.message}</ErrorMessage>
        ) : (
          <>
            {members.data.data.length === 0 && (
              <p className="muted">Власник ще не запросив учасників.</p>
            )}
            <ul className="plain-list">
              {members.data.data.map((member) => (
                <li key={member.userId} className="row spread">
                  <span>
                    {member.user.name}{' '}
                    <span className="muted small">
                      {member.role === 'MANAGER' ? 'Менеджер' : 'Учасник'}
                    </span>
                  </span>
                  {isOwner && <MemberActions project={record.id} member={member} />}
                </li>
              ))}
            </ul>
          </>
        )}
        {isOwner && <MemberForm project={record.id} />}
      </Card>
      {additional?.(record, manage)}
    </div>
  );
}

function MemberForm({ project }: { project: string }) {
  const [userId, setUserId] = useState('');
  const mutation = useMutation({
    mutationFn: () => save(`/projects/${project}/members`, { userId: userId.trim() }),
    onSuccess: () => {
      setUserId('');
      void refreshData('members');
      toast.success('Учасника додано');
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <form
      className="filters"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <FormField label="Ідентифікатор учасника">
        <Input
          required
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
          placeholder="UUID із профілю"
        />
      </FormField>
      <Button
        type="submit"
        disabled={!z.uuid().safeParse(userId.trim()).success || mutation.isPending}
      >
        Додати учасника
      </Button>
    </form>
  );
}

function MemberActions({ project, member }: { project: string; member: Member }) {
  const path = `/projects/${project}/members/${member.userId}`;
  const update = useMutation({
    mutationFn: (role: string) => save(path, { role }, true),
    onSuccess: () => {
      void refreshData('members');
      toast.success('Роль оновлено');
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <div className="row">
      <select
        aria-label={`Роль: ${member.user.name}`}
        className="input compact"
        value={member.role}
        disabled={update.isPending}
        onChange={(event) => update.mutate(event.target.value)}
      >
        <option value="MEMBER">Учасник</option>
        <option value="MANAGER">Менеджер</option>
      </select>
      <DeleteButton
        label="учасника"
        action={() => remove(path)}
        onDone={() => {
          void refreshData('members', 'tasks');
        }}
      />
    </div>
  );
}

export function TaskDetails({ upload }: { upload?: (task: Task) => ReactNode }) {
  const { id } = useParams();
  const actor = useAuth((state) => state.user);
  const navigate = useNavigate();
  const task = useQuery({
    queryKey: ['tasks', id],
    queryFn: ({ signal }) => item<Task>(`/tasks/${id}`, signal),
  });
  const projectId = task.data?.projectId;
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
  const status = useMutation({
    mutationFn: (status: Task['status']) => save<Task>(`/tasks/${id}`, { status }, true),
    onSuccess: () => {
      void refreshData('tasks', 'summary', 'stats');
      toast.success('Статус оновлено');
    },
    onError: (e) => toast.error(e.message),
  });
  if (task.isPending) return <Skeleton />;
  if (task.error) return <ErrorMessage>{task.error.message}</ErrorMessage>;
  const record = task.data;
  const manage =
    actor?.role === 'ADMIN' ||
    actor?.id === project.data?.ownerId ||
    members.data?.data.some((m) => m.userId === actor?.id && m.role === 'MANAGER') === true;
  const owner =
    project.data?.ownerId === record.assigneeId
      ? 'Власник проєкту'
      : members.data?.data.find((m) => m.userId === record.assigneeId)?.user.name;
  return (
    <div className="page">
      <Breadcrumb links={[{ to: '/tasks', text: 'Завдання' }]} current={record.title} />
      <div className="row spread">
        <h1>{record.title}</h1>
        <div className="row">
          <Link className="button button-quiet" to={`/tasks/${id}/edit`}>
            Редагувати
          </Link>
          {manage && (
            <DeleteButton
              label="завдання, коментарі та вкладення"
              action={() => remove(`/tasks/${id}`)}
              onDone={() => {
                void refreshData('tasks', 'comments', 'attachments', 'summary', 'stats');
                void navigate('/tasks');
              }}
            />
          )}
        </div>
      </div>
      <Card className="stack">
        <div className="row">
          <StatusBadge status={record.status} />
          <span className="muted small">{priorityText[record.priority]} пріоритет</span>
        </div>
        <p className="prewrap">{record.description || 'Без опису'}</p>
        <p className="small muted">
          Термін · {formatDate(record.dueDate)} · Виконавець ·{' '}
          {owner ?? (record.assigneeId || 'Не призначено')}
        </p>
        <div className="row">
          <Link className="text-link" to={`/projects/${record.projectId}`}>
            {project.data?.name ?? 'Відкрити проєкт'}
          </Link>
          <select
            aria-label="Змінити статус"
            className="input compact"
            value={record.status}
            disabled={status.isPending}
            onChange={(event) => status.mutate(event.target.value as Task['status'])}
          >
            {Object.entries(statusText).map(([key, text]) => (
              <option key={key} value={key}>
                {text}
              </option>
            ))}
          </select>
        </div>
      </Card>
      <Comments taskId={record.id} canManage={manage} />
      <Files taskId={record.id} canManage={manage} upload={upload?.(record)} />
    </div>
  );
}

function Comments({ taskId, canManage }: { taskId: string; canManage: boolean }) {
  const actor = useAuth((s) => s.user);
  const data = useQuery({
    queryKey: ['comments', taskId],
    queryFn: ({ signal }) => list<Comment>('/comments', { taskId, limit: 100 }, signal),
  });
  return (
    <Card className="stack">
      <h2>Коментарі</h2>
      <CommentForm taskId={taskId} />
      {data.isPending ? (
        <Skeleton />
      ) : data.error ? (
        <ErrorMessage>{data.error.message}</ErrorMessage>
      ) : (
        <ul className="plain-list">
          {data.data.data.map((comment) => (
            <li key={comment.id} className="stack">
              <p className="prewrap">{comment.body}</p>
              <p className="muted small">{formatDate(comment.createdAt)}</p>
              {(canManage || actor?.id === comment.authorId) && (
                <CommentActions taskId={taskId} comment={comment} />
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function CommentActions({ taskId, comment }: { taskId: string; comment: Comment }) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      {editing ? (
        <CommentForm taskId={taskId} comment={comment} done={() => setEditing(false)} />
      ) : (
        <div className="row">
          <Button className="button-quiet" onClick={() => setEditing(true)}>
            Редагувати коментар
          </Button>
          <DeleteButton
            label="коментар"
            action={() => remove(`/comments/${comment.id}`)}
            onDone={() => {
              void refreshData('comments');
            }}
          />
        </div>
      )}
    </>
  );
}

function CommentForm({
  taskId,
  comment,
  done,
}: {
  taskId: string;
  comment?: Comment;
  done?: () => void;
}) {
  const [body, setBody] = useState(comment?.body ?? '');
  const mutation = useMutation({
    mutationFn: () =>
      save(
        comment ? `/comments/${comment.id}` : '/comments',
        { body: body.trim(), ...(!comment ? { taskId } : {}) },
        !!comment,
      ),
    onSuccess: () => {
      setBody('');
      done?.();
      void refreshData('comments');
      toast.success('Коментар збережено');
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <FormField label="Коментар">
        <textarea
          className="input"
          value={body}
          maxLength={3000}
          onChange={(e) => setBody(e.target.value)}
        />
      </FormField>
      <div className="row">
        <Button type="submit" disabled={mutation.isPending || !body.trim()}>
          {comment ? 'Зберегти коментар' : 'Додати коментар'}
        </Button>
        {done && (
          <Button className="button-quiet" onClick={done}>
            Скасувати
          </Button>
        )}
      </div>
    </form>
  );
}

export function UploadForm({ taskId }: { taskId: string }) {
  const mutation = useMutation({
    mutationFn: (form: FormData) => api.post('/files', form),
    onSuccess: () => {
      void refreshData('attachments');
      toast.success('Вкладення додано');
    },
    onError: (error) => toast.error(error.message),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = new FormData(form);
    input.set('taskId', taskId);
    mutation.mutate(input, { onSuccess: () => form.reset() });
  }
  return (
    <form className="filters" onSubmit={submit}>
      <FormField label="Файли · до 5 МБ кожен">
        <Input name="files" type="file" accept=".txt,.pdf,.png,.jpg,.jpeg" multiple required />
      </FormField>
      <Button type="submit" disabled={mutation.isPending}>
        Завантажити
      </Button>
    </form>
  );
}

async function download(file: Attachment) {
  try {
    const { data } = await api.get<Blob>(`/files/${file.id}`, { responseType: 'blob' });
    const url = URL.createObjectURL(data);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.fileName;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    toast.error(apiError(error).message);
  }
}

function Files({
  taskId,
  canManage,
  upload,
}: {
  taskId: string;
  canManage: boolean;
  upload?: ReactNode;
}) {
  const actor = useAuth((s) => s.user);
  const data = useQuery({
    queryKey: ['attachments', taskId],
    queryFn: ({ signal }) => list<Attachment>('/attachments', { taskId, limit: 100 }, signal),
  });
  return (
    <Card className="stack">
      <h2>Вкладення</h2>
      {upload ?? <UploadForm taskId={taskId} />}
      {data.isPending ? (
        <Skeleton />
      ) : data.error ? (
        <ErrorMessage>{data.error.message}</ErrorMessage>
      ) : (
        <ul className="plain-list">
          {data.data.data.map((file) => (
            <li key={file.id} className="row spread">
              <div>
                {file.url.startsWith('/api/files/') ? (
                  <Button className="button-quiet" onClick={() => void download(file)}>
                    {file.fileName} ↓
                  </Button>
                ) : /^https?:\/\//i.test(file.url) ? (
                  <a
                    className="text-link"
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {file.fileName} ↗
                  </a>
                ) : (
                  file.fileName
                )}
                <p className="muted small">{formatBytes(file.size)}</p>
              </div>
              {(canManage || actor?.id === file.uploadedById) && (
                <DeleteButton
                  label="вкладення"
                  action={() => remove(`/attachments/${file.id}`)}
                  onDone={() => {
                    void refreshData('attachments');
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
