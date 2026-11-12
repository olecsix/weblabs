import type { ComponentPropsWithRef, ReactNode } from 'react';

export function Button({
  className = '',
  type = 'button',
  ...props
}: ComponentPropsWithRef<'button'>) {
  return <button type={type} className={`button ${className}`} {...props} />;
}
export function Input({ className = '', ...props }: ComponentPropsWithRef<'input'>) {
  return <input className={`input ${className}`} {...props} />;
}
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}
export function Badge({
  children,
  variant = 'neutral',
}: {
  children: ReactNode;
  variant?: 'neutral' | 'blue' | 'green' | 'red';
}) {
  return <span className={`badge badge-${variant}`}>{children}</span>;
}
export function Loading({ label = 'Завантаження…' }: { label?: string }) {
  return (
    <div role="status" className="loading">
      <span className="spinner" /> {label}
    </div>
  );
}
export function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <p className="error" role="alert">
      {children}
    </p>
  );
}
export function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error && (
        <small className="field-error" role="alert">
          {error}
        </small>
      )}
    </label>
  );
}
export function Skeleton() {
  return (
    <div className="stack" role="status" aria-label="Завантаження">
      {[1, 2, 3].map((line) => (
        <div key={line} className="skeleton" />
      ))}
    </div>
  );
}
