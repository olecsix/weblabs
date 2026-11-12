import { QueryClient } from '@tanstack/react-query';
import type { Item, Page } from '@/types/api';
import { useAuth } from '@/stores/auth';
import { api, ApiError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (attempt, error) =>
        attempt < 1 && !(error instanceof ApiError && (error.status ?? 500) < 500),
    },
  },
});

useAuth.subscribe((state, previous) => {
  if (state.user?.id !== previous.user?.id) queryClient.clear();
});

export const list = <T>(
  path: string,
  params?: Record<string, string | number | undefined>,
  signal?: AbortSignal,
) => api.get<Page<T>>(path, { params, signal }).then(({ data }) => data);
export const item = <T>(path: string, signal?: AbortSignal) =>
  api.get<Item<T>>(path, { signal }).then(({ data }) => data.data);
export const save = <T>(path: string, input: unknown, update = false) =>
  api
    .request<Item<T>>({ method: update ? 'PATCH' : 'POST', url: path, data: input })
    .then(({ data }) => data.data);
export const remove = (path: string) => api.delete(path);
export const refreshData = (...resources: string[]) =>
  Promise.all(resources.map((resource) => queryClient.invalidateQueries({ queryKey: [resource] })));
