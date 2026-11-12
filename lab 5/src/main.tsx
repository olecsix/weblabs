import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Layout } from '@/components/Layout';
import { About, Home, NotFound } from '@/pages/Public';
import AuthPage from '@/pages/Auth';
import { Dashboard, ProjectList, TaskList } from '@/pages/Lists';
import { ProjectEditor, TaskEditor } from '@/pages/Editor';
import { ProjectDetails, TaskDetails } from '@/pages/Details';
import { ProtectedRoute, SessionActions, Workspace } from '@/components/Workspace';
import { queryClient } from '@/services/data';
import './styles.css';

const theme = localStorage.getItem('task-theme');
document.documentElement.classList.toggle(
  'dark',
  theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches,
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout actions={<SessionActions />} />}>
              <Route index element={<Home ready />} />
              <Route path="about" element={<About />} />
              <Route path="login" element={<AuthPage key="login" mode="login" />} />
              <Route path="register" element={<AuthPage key="register" mode="register" />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<Workspace />}>
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="projects" element={<ProjectList />} />
                  <Route path="projects/new" element={<ProjectEditor />} />
                  <Route path="projects/:id" element={<ProjectDetails />} />
                  <Route path="projects/:id/edit" element={<ProjectEditor />} />
                  <Route path="tasks" element={<TaskList />} />
                  <Route path="tasks/new" element={<TaskEditor />} />
                  <Route path="tasks/:id" element={<TaskDetails />} />
                  <Route path="tasks/:id/edit" element={<TaskEditor />} />
                </Route>
              </Route>
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster richColors position="bottom-right" />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
