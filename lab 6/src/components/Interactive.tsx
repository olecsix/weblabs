import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button, Input } from './ui';

export function ConfirmDialog({
  label,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  label: string;
  pending: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const description = useId();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => {
      if (element?.open) element.close();
    };
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      className="confirm-dialog"
      aria-labelledby={title}
      aria-describedby={description}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
    >
      <div className="stack">
        <h2 id={title}>Підтвердити дію</h2>
        <p id={description}>Видалити {label}?</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="row spread">
          <Button className="button-quiet" autoFocus disabled={pending} onClick={onClose}>
            Скасувати
          </Button>
          <Button className="button-danger" disabled={pending} onClick={onConfirm}>
            {pending ? 'Видаляємо…' : 'Підтвердити видалення'}
          </Button>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}

export function Tabs({
  options,
  label,
}: {
  options: { id: string; label: string; content: ReactNode }[];
  label: string;
}) {
  const [index, setIndex] = useState(0);
  const prefix = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const current = options[index];
  function move(event: KeyboardEvent) {
    const target =
      event.key === 'ArrowRight'
        ? (index + 1) % options.length
        : event.key === 'ArrowLeft'
          ? (index + options.length - 1) % options.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? options.length - 1
              : null;
    if (target === null) return;
    event.preventDefault();
    setIndex(target);
    buttons.current[target]?.focus();
  }
  return (
    <div className="stack">
      <div className="tablist" role="tablist" aria-label={label} onKeyDown={move}>
        {options.map((option, number) => (
          <button
            key={option.id}
            ref={(element) => {
              buttons.current[number] = element;
            }}
            type="button"
            role="tab"
            id={`${prefix}-${option.id}`}
            aria-controls={`${prefix}-${option.id}-panel`}
            aria-selected={index === number}
            tabIndex={index === number ? 0 : -1}
            onClick={() => setIndex(number)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div
        id={`${prefix}-${current.id}-panel`}
        role="tabpanel"
        aria-labelledby={`${prefix}-${current.id}`}
        tabIndex={0}
      >
        {current.content}
      </div>
    </div>
  );
}

export function SearchMenu({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const button = useRef<HTMLButtonElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const id = useId();
  const selected = options.find((entry) => entry.value === value);
  const filtered = options.filter((entry) =>
    entry.label.toLocaleLowerCase('uk').includes(query.trim().toLocaleLowerCase('uk')),
  );
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (event.target instanceof Node && !wrapper.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);
  function close() {
    setOpen(false);
    setQuery('');
    button.current?.focus();
  }
  return (
    <div
      ref={wrapper}
      className="search-menu"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          close();
        }
      }}
    >
      <Button
        className="button-quiet"
        ref={button}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen(!open);
          setQuery('');
        }}
      >
        {label} · {selected?.label ?? 'Оберіть'} ▾
      </Button>
      {open && (
        <div id={id} className="search-menu-pane card stack">
          <Input
            autoFocus
            aria-label={`Пошук: ${label}`}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Пошук…"
          />
          {filtered.length ? (
            <ul className="choice-list">
              {filtered.map((option) => (
                <li key={option.value}>
                  <button
                    type="button"
                    className="choice"
                    aria-pressed={value === option.value}
                    onClick={() => {
                      onChange(option.value);
                      close();
                    }}
                  >
                    {option.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Немає збігів.</p>
          )}
        </div>
      )}
    </div>
  );
}
