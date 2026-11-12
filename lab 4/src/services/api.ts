import axios from 'axios';
import type { ApiFailure } from '@/types/api';

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

api.interceptors.request.use((config) => {
  config.headers.set('Accept', 'application/json');
  return config;
});
api.interceptors.response.use(
  (response) => response,
  (error: unknown) => Promise.reject(apiError(error)),
);
