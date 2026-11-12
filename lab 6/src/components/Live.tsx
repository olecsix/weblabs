import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge, Button, ErrorMessage, Skeleton } from './ui';
import { useAuth } from '@/stores/auth';
import { api, refreshSession } from '@/services/api';
import { queryClient, refreshData } from '@/services/data';
import { socket } from '@/services/socket';
import type { Page } from '@/types/api';
import { formatDate } from '@/utils/format';

interface Notification {
  id: string;
  title: string;
  message: string;
  priority: string;
  readAt: string | null;
  createdAt: string;
}
type NotificationPage = Page<Notification> & { meta: { unread: number } };
interface ResourceEvent {
  resource: 'tasks' | 'projects' | 'comments' | 'attachments' | 'members';
  action: string;
  projectId?: string;
}
const keys = [
  'projects',
  'tasks',
  'comments',
  'members',
  'attachments',
  'summary',
  'stats',
  'notifications',
];

export function useSocketEvent<T>(name: string, handler: (payload: T) => void) {
  const onEvent = useEffectEvent(handler);
  useEffect(() => {
    const callback = (payload: T) => onEvent(payload);
    socket.on(name, callback);
    return () => {
      socket.off(name, callback);
    };
  }, [name]);
}

export function LiveConnection() {
  const token = useAuth((state) => state.accessToken);
  useEffect(() => {
    if (!token) return;
    socket.auth = { token };
    socket.connect();
    const renew = () => {
      if (useAuth.getState().accessToken === token) void refreshSession();
    };
    socket.on('session:expired', renew);
    return () => {
      socket.off('session:expired', renew);
      socket.disconnect();
    };
  }, [token]);
  useSocketEvent('connect', () => {
    void refreshData(...keys);
  });
  useSocketEvent<ResourceEvent>('resource:changed', ({ resource }) => {
    if (resource === 'members' || resource === 'projects') void refreshData(...keys);
    else void refreshData(resource, 'summary', 'stats');
  });
  useSocketEvent<Notification>('notification', (item) => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    toast.info(item.title, { description: item.message });
  });
  return null;
}

const subscribe = (notify: () => void) => {
  socket.on('connect', notify).on('disconnect', notify);
  return () => {
    socket.off('connect', notify).off('disconnect', notify);
  };
};
export function OnlineBadge() {
  const connected = useSyncExternalStore(
    subscribe,
    () => socket.connected,
    () => false,
  );
  return (
    <div className="connection-badge" aria-live="polite">
      <Badge variant={connected ? 'green' : 'neutral'}>
        <span className="live-dot" />
        {connected ? 'Наживо' : 'Без з’єднання'}
      </Badge>
    </div>
  );
}

export function ProjectPresence({ projectId }: { projectId: string }) {
  const [data, setData] = useState<{ projectId: string; count: number | null } | null>(null);
  const connected = useSyncExternalStore(
    subscribe,
    () => socket.connected,
    () => false,
  );
  useEffect(() => {
    if (!connected) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void socket
          .timeout(2500)
          .emitWithAck('presence:project', projectId)
          .then((response: { onlineIds?: string[] }) => {
            if (alive) setData({ projectId, count: response.onlineIds?.length ?? null });
          })
          .catch(() => {
            if (alive) setData({ projectId, count: null });
          });
      }, 100);
    };
    socket.on('presence:changed', load);
    const membership = (event: ResourceEvent) => {
      if (event.projectId === projectId && event.resource === 'members') load();
    };
    socket.on('resource:changed', membership);
    load();
    return () => {
      alive = false;
      clearTimeout(timer);
      socket.off('presence:changed', load);
      socket.off('resource:changed', membership);
    };
  }, [connected, projectId]);
  const count = connected && data?.projectId === projectId ? data.count : null;
  return (
    <Badge variant={count ? 'green' : 'neutral'}>
      {count === null ? 'Статус команди недоступний' : `Онлайн у проєкті: ${count}`}
    </Badge>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  const feed = useQuery({
    queryKey: ['notifications'],
    queryFn: ({ signal }) =>
      api
        .get<NotificationPage>('/notifications', { params: { limit: 30 }, signal })
        .then(({ data }) => data),
  });
  const read = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}`, {}),
    onSuccess: () => {
      void refreshData('notifications');
    },
    onError: (error) => toast.error(error.message),
  });
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (
        event.target instanceof Node &&
        !pane.current?.contains(event.target) &&
        !button.current?.contains(event.target)
      )
        setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);
  const unread = feed.data?.meta.unread ?? 0;
  return (
    <div
      className="notifications"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpen(false);
          button.current?.focus();
        }
      }}
    >
      <Button
        ref={button}
        className="button-quiet"
        aria-expanded={open}
        aria-controls="inbox"
        onClick={() => setOpen(!open)}
      >
        Сповіщення{unread > 0 && <span className="notification-count">{unread}</span>}
      </Button>
      {open && (
        <div
          ref={pane}
          id="inbox"
          className="notification-pane card stack"
          role="region"
          aria-label="Сповіщення"
        >
          <h2>Сповіщення</h2>
          {feed.isPending ? (
            <Skeleton />
          ) : feed.error ? (
            <ErrorMessage>{feed.error.message}</ErrorMessage>
          ) : feed.data.data.length === 0 ? (
            <p className="muted">Поки порожньо.</p>
          ) : (
            <ul className="plain-list">
              {feed.data.data.map((item) => (
                <li key={item.id} className="stack">
                  <div className="row spread">
                    <strong>{item.title}</strong>
                    {item.priority === 'HIGH' && <Badge variant="red">Важливе</Badge>}
                  </div>
                  <p>
                    {item.message} <span className="muted small">{formatDate(item.createdAt)}</span>
                  </p>
                  {!item.readAt && (
                    <Button
                      className="button-quiet"
                      disabled={read.isPending}
                      onClick={() => read.mutate(item.id)}
                    >
                      Позначити прочитаним
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const networkEvents = (notify: () => void) => {
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  return () => {
    window.removeEventListener('online', notify);
    window.removeEventListener('offline', notify);
  };
};
export function OfflineBanner() {
  const online = useSyncExternalStore(
    networkEvents,
    () => navigator.onLine,
    () => true,
  );
  return online ? null : (
    <p className="offline-banner" role="status">
      Офлайн. Для оновлення робочих даних потрібне підключення.
    </p>
  );
}
