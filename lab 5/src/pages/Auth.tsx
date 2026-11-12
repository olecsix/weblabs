import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { z } from 'zod';
import { Button, Card, ErrorMessage, FormField, Input } from '@/components/ui';
import { api, apiError } from '@/services/api';
import { useAuth } from '@/stores/auth';
import type { AuthResponse } from '@/types/api';

const credentials = z.object({
  email: z.email('Введіть коректну адресу'),
  password: z.string().min(8, 'Щонайменше 8 символів').max(128),
});
const registerSchema = credentials
  .extend({
    name: z.string().trim().min(2, 'Введіть щонайменше 2 символи').max(100),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Паролі мають збігатися',
  });

type Values = z.input<typeof credentials> &
  Partial<Pick<z.input<typeof registerSchema>, 'name' | 'confirmPassword'>>;
const authForm = z.object({
  ...credentials.shape,
  name: z.string().optional(),
  confirmPassword: z.string().optional(),
});

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const isRegister = mode === 'register';
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuth((state) => state.user);
  const setSession = useAuth((state) => state.setSession);
  const schema = authForm.superRefine((values, context) => {
    if (isRegister) {
      const result = registerSchema.safeParse(values);
      if (!result.success)
        for (const issue of result.error.issues)
          context.addIssue({ code: 'custom', path: issue.path, message: issue.message });
    }
  });
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });
  if (user) return <Navigate to="/dashboard" replace />;

  async function submit(values: Values) {
    try {
      const input = isRegister
        ? { name: values.name?.trim(), email: values.email, password: values.password }
        : { email: values.email, password: values.password };
      const { data } = await api.post<AuthResponse>(`/auth/${mode}`, input);
      const from = (location.state as { from?: string } | null)?.from;
      setSession(data);
      void navigate(from?.startsWith('/') && !from.startsWith('//') ? from : '/dashboard', {
        replace: true,
      });
    } catch (error) {
      setError('root', { message: apiError(error).message });
    }
  }

  return (
    <div className="auth-page">
      <Card className="stack">
        <p className="eyebrow">Task Manager</p>
        <h1>{isRegister ? 'Створити акаунт' : 'Вхід'}</h1>
        <form className="stack" noValidate onSubmit={handleSubmit(submit)}>
          {isRegister && (
            <FormField label="Ім’я" error={errors.name?.message}>
              <Input autoComplete="name" {...register('name')} />
            </FormField>
          )}
          <FormField label="Електронна пошта" error={errors.email?.message}>
            <Input type="email" autoComplete="email" {...register('email')} />
          </FormField>
          <FormField label="Пароль" error={errors.password?.message}>
            <Input
              type="password"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              {...register('password')}
            />
          </FormField>
          {isRegister && (
            <FormField label="Повторіть пароль" error={errors.confirmPassword?.message}>
              <Input type="password" autoComplete="new-password" {...register('confirmPassword')} />
            </FormField>
          )}
          {errors.root?.message && <ErrorMessage>{errors.root.message}</ErrorMessage>}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Зачекайте…' : isRegister ? 'Зареєструватися' : 'Увійти'}
          </Button>
        </form>
        <p className="muted small">
          {isRegister ? 'Вже маєте акаунт? ' : 'Ще немає акаунта? '}
          <Link className="text-link" to={isRegister ? '/login' : '/register'}>
            {isRegister ? 'Увійти' : 'Зареєструватися'}
          </Link>
        </p>
      </Card>
    </div>
  );
}
