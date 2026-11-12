import axios, { type InternalAxiosRequestConfig } from 'axios';
import type { ApiFailure, AuthResponse } from '@/types/api';
import { useAuth } from '@/stores/auth';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api',
  timeout: 15000,
});

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly requestId?: string,
  ) {
    super(message);
  }
}

export function apiError(error: unknown) {
  if (error instanceof ApiError) return error;
  if (axios.isAxiosError<ApiFailure>(error)) {
    return new ApiError(
      error.response?.data?.error?.message ?? 'Сервер недоступний. Перевірте підключення.',
      error.response?.status,
      error.response?.data?.error?.requestId,
    );
  }
  return new ApiError(error instanceof Error ? error.message : 'Невідома помилка');
}

let refreshing: Promise<boolean> | null = null;
export function refreshSession() {
  if (refreshing) return refreshing;
  const current = useAuth.getState().refreshToken;
  if (!current) return Promise.resolve(false);
  refreshing = axios
    .post<AuthResponse>(
      '/auth/refresh',
      { refreshToken: current },
      { baseURL: api.defaults.baseURL, timeout: 15_000 },
    )
    .then(({ data }) => {
      if (useAuth.getState().refreshToken !== current) return false;
      useAuth.getState().setSession(data);
      return true;
    })
    .catch(() => {
      if (useAuth.getState().refreshToken === current) useAuth.getState().clear();
      return false;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

api.interceptors.request.use((config) => {
  config.headers.set('Accept', 'application/json');
  const token = useAuth.getState().accessToken;
  if (token && config.url !== '/health') config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});
api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const config = error.config as
        (InternalAxiosRequestConfig & { retried?: boolean }) | undefined;
      if (
        config &&
        !config.retried &&
        !/^\/auth\/(login|register|refresh)$/.test(config.url ?? '')
      ) {
        config.retried = true;
        if (await refreshSession()) return api.request(config);
      }
    }
    throw apiError(error);
  },
);
