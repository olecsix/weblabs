import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Layout } from '@/components/Layout';
import { About, Home, NotFound } from '@/pages/Public';
import { LiveConnection, NotificationBell, OfflineBanner, OnlineBadge } from '@/components/Live';
import { Loading } from '@/components/ui';
import { ProtectedRoute, SessionActions, Workspace } from '@/components/Workspace';
import { queryClient } from '@/services/data';
import './styles.css';

const AuthPage = lazy(() => import('@/pages/Auth'));
const Dashboard = lazy(() =>
  import('@/pages/Lists').then((module) => ({ default: module.Dashboard })),
);
const ProjectList = lazy(() =>
  import('@/pages/Lists').then((module) => ({ default: module.ProjectList })),
);
const TaskList = lazy(() =>
  import('@/pages/Lists').then((module) => ({ default: module.TaskList })),
);
const ProjectEditor = lazy(() =>
  import('@/pages/Editor').then((module) => ({ default: module.ProjectEditor })),
);
const TaskEditor = lazy(() =>
  import('@/pages/Editor').then((module) => ({ default: module.TaskEditor })),
);
const ProjectDetails = lazy(() =>
  import('@/pages/LiveDetails').then((module) => ({ default: module.ProjectLiveDetails })),
);
const TaskDetails = lazy(() =>
  import('@/pages/LiveDetails').then((module) => ({ default: module.TaskLiveDetails })),
);
const Stream = lazy(() => import('@/pages/Stream'));

const theme = localStorage.getItem('task-theme');
document.documentElement.classList.toggle(
  'dark',
  theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches,
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <LiveConnection />
        <OfflineBanner />
        <BrowserRouter>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route element={<Layout actions={<SessionActions extra={<NotificationBell />} />} />}>
                <Route index element={<Home ready />} />
                <Route path="about" element={<About />} />
                <Route path="login" element={<AuthPage key="login" mode="login" />} />
                <Route path="register" element={<AuthPage key="register" mode="register" />} />
                <Route element={<ProtectedRoute />}>
                  <Route
                    element={
                      <Workspace>
                        <OnlineBadge />
                      </Workspace>
                    }
                  >
                    <Route path="dashboard" element={<Dashboard />} />
                    <Route path="projects" element={<ProjectList />} />
                    <Route path="projects/new" element={<ProjectEditor />} />
                    <Route path="projects/:id" element={<ProjectDetails />} />
                    <Route path="projects/:id/edit" element={<ProjectEditor />} />
                    <Route path="tasks" element={<TaskList />} />
                    <Route path="tasks/new" element={<TaskEditor />} />
                    <Route path="tasks/:id" element={<TaskDetails />} />
                    <Route path="tasks/:id/edit" element={<TaskEditor />} />
                    <Route path="stream" element={<Stream />} />
                  </Route>
                </Route>
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster richColors position="bottom-right" />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
