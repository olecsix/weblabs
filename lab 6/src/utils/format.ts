import type { Priority, Status } from '@/types/api';

export const statusText: Record<Status, string> = {
  TODO: 'До роботи',
  IN_PROGRESS: 'У роботі',
  DONE: 'Готово',
};
export const priorityText: Record<Priority, string> = {
  LOW: 'Низький',
  MEDIUM: 'Звичайний',
  HIGH: 'Високий',
};
const dates = new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium', timeZone: 'UTC' });
export const formatDate = (value: string | null) =>
  value ? dates.format(new Date(value)) : 'Без терміну';
export const formatBytes = (value: number) =>
  value < 1024 ? `${value} Б` : `${Math.round(value / 1024)} КБ`;
