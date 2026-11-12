export type Status = 'TODO' | 'IN_PROGRESS' | 'DONE';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH';
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'USER' | 'ADMIN';
}
export interface Project {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  createdAt: string;
}
export interface Task {
  id: string;
  title: string;
  description: string | null;
  projectId: string;
  assigneeId: string | null;
  status: Status;
  priority: Priority;
  dueDate: string | null;
  createdAt: string;
  position?: number;
}
export interface Comment {
  id: string;
  body: string;
  taskId: string;
  authorId: string;
  createdAt: string;
}
export interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
  taskId: string;
  uploadedById: string;
}
export interface Member {
  userId: string;
  role: 'MEMBER' | 'MANAGER';
  user: { id: string; name: string };
}
export interface Page<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
export interface Item<T> {
  data: T;
}
export interface ApiFailure {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: { path: string; message: string }[];
  };
}
export interface AuthResponse {
  user: User;
  tokens: { accessToken: string; refreshToken: string };
}
