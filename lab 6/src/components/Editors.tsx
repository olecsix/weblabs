import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button, ErrorMessage, FormField, Input } from './ui';
import { api } from '@/services/api';
import { refreshData } from '@/services/data';

export function RichText({ value }: { value: string }) {
  const lines = value.split('\n');
  return (
    <div className="rich-text">
      {lines.map((line, index) => {
        const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/);
        return (
          <p key={index}>
            {parts.map((part, number) =>
              part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
                <strong key={number}>{part.slice(2, -2)}</strong>
              ) : part.startsWith('*') && part.endsWith('*') && part.length > 2 ? (
                <em key={number}>{part.slice(1, -1)}</em>
              ) : (
                part
              ),
            ) || '\u00a0'}
          </p>
        );
      })}
    </div>
  );
}

export function RichEditor({
  value,
  onChange,
  onBlur,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);
  function wrap(marker: string) {
    const el = textarea.current;
    if (!el) return;
    const { selectionStart: start, selectionEnd: end } = el;
    const selected = value.slice(start, end) || 'текст';
    const next = value.slice(0, start) + marker + selected + marker + value.slice(end);
    if (next.length > 5000) return;
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + marker.length, start + marker.length + selected.length);
    });
  }
  return (
    <div className="rich-editor stack">
      <div className="row" role="group" aria-label="Форматування опису">
        <Button className="button-quiet" disabled={preview} onClick={() => wrap('**')}>
          Жирний
        </Button>
        <Button className="button-quiet" disabled={preview} onClick={() => wrap('*')}>
          Курсив
        </Button>
        <Button
          className="button-quiet"
          aria-pressed={preview}
          onClick={() => setPreview(!preview)}
        >
          {preview ? 'Редагувати текст' : 'Попередній перегляд'}
        </Button>
      </div>
      {preview ? (
        <RichText value={value || 'Опис порожній.'} />
      ) : (
        <textarea
          className="input"
          ref={textarea}
          aria-label="Опис"
          value={value}
          maxLength={5000}
          onBlur={onBlur}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}

export function DatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => (value ? new Date(`${value}T00:00:00Z`) : new Date()));
  const year = month.getUTCFullYear();
  const index = month.getUTCMonth();
  const days = new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
  const start = (new Date(Date.UTC(year, index, 1)).getUTCDay() + 6) % 7;
  const formatMonth = new Intl.DateTimeFormat('uk-UA', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return (
    <div className="stack">
      <div className="row">
        <Input
          type="date"
          aria-label="Термін"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <Button className="button-quiet" aria-expanded={open} onClick={() => setOpen(!open)}>
          Календар
        </Button>
      </div>
      {open && (
        <div
          className="calendar stack"
          aria-label="Вибір дати"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
          }}
        >
          <div className="row spread">
            <Button
              className="button-quiet"
              aria-label="Попередній місяць"
              onClick={() => setMonth(new Date(Date.UTC(year, index - 1, 1)))}
            >
              ‹
            </Button>
            <strong aria-live="polite">{formatMonth.format(month)}</strong>
            <Button
              className="button-quiet"
              aria-label="Наступний місяць"
              onClick={() => setMonth(new Date(Date.UTC(year, index + 1, 1)))}
            >
              ›
            </Button>
          </div>
          <div className="calendar-grid">
            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'].map((d) => (
              <span key={d} className="muted small">
                {d}
              </span>
            ))}
            {Array.from({ length: start }, (_, i) => (
              <span key={`blank-${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const date = new Date(Date.UTC(year, index, i + 1)).toISOString().slice(0, 10);
              return (
                <button
                  className="calendar-day"
                  type="button"
                  aria-label={date}
                  aria-pressed={date === value}
                  key={date}
                  onClick={() => {
                    onChange(date);
                    setOpen(false);
                  }}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function crop(
  source: HTMLImageElement,
  canvas: HTMLCanvasElement,
  scale: number,
  horizontal: number,
  vertical: number,
) {
  const side = Math.max(
    1,
    Math.floor((Math.min(source.naturalWidth, source.naturalHeight) * scale) / 100),
  );
  const x = Math.floor(((source.naturalWidth - side) * horizontal) / 100);
  const y = Math.floor(((source.naturalHeight - side) * vertical) / 100);
  const size = Math.min(side, 1024);
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas недоступний');
  context.drawImage(source, x, y, side, side, 0, 0, size, size);
}

export function ImageCropUpload({ taskId }: { taskId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState('');
  const [scale, setScale] = useState(100);
  const [horizontal, setHorizontal] = useState(50);
  const [vertical, setVertical] = useState(50);
  const canvas = useRef<HTMLCanvasElement>(null);
  const chooser = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth * image.naturalHeight > 36_000_000) {
        setError('Зображення перевищує 36 Мп');
        return;
      }
      setSource(image);
    };
    image.onerror = () => setError('Не вдалося прочитати зображення');
    image.src = url;
    return () => {
      image.onload = null;
      image.onerror = null;
      URL.revokeObjectURL(url);
    };
  }, [file]);
  useEffect(() => {
    if (source && canvas.current) crop(source, canvas.current, scale, horizontal, vertical);
  }, [source, scale, horizontal, vertical]);
  const upload = useMutation({
    mutationFn: async () => {
      const preview = canvas.current;
      if (!preview) throw new Error('Немає зображення');
      const result = await new Promise<Blob>((resolve, reject) =>
        preview.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Помилка обрізання'))),
          'image/png',
        ),
      );
      if (result.size > 5 * 1024 * 1024) throw new Error('Результат перевищує 5 МБ');
      const form = new FormData();
      form.set('taskId', taskId);
      form.append('files', result, 'image-crop.png');
      await api.post('/files', form);
    },
    onSuccess: () => {
      setFile(null);
      setSource(null);
      if (chooser.current) chooser.current.value = '';
      void refreshData('attachments');
      toast.success('Зображення додано');
    },
    onError: (e) => setError(e.message),
  });
  return (
    <details className="cropper">
      <summary>Обрізати зображення перед завантаженням</summary>
      <div className="stack crop-body">
        <FormField label="Зображення для обрізання">
          <Input
            ref={chooser}
            type="file"
            accept="image/png,image/jpeg"
            onChange={(e) => {
              const next = e.target.files?.[0] ?? null;
              setSource(null);
              setError('');
              setScale(100);
              setHorizontal(50);
              setVertical(50);
              if (
                next &&
                (!['image/png', 'image/jpeg'].includes(next.type) || next.size > 5 * 1024 * 1024)
              ) {
                setFile(null);
                setError('Оберіть PNG або JPEG до 5 МБ');
                return;
              }
              setFile(next);
            }}
          />
        </FormField>
        {error && <ErrorMessage>{error}</ErrorMessage>}
        {source && (
          <div className="crop-layout">
            <canvas ref={canvas} aria-label="Попередній перегляд обрізання" />
            <div className="stack">
              <FormField label="Розмір області">
                <input
                  type="range"
                  min="20"
                  max="100"
                  value={scale}
                  onChange={(e) => setScale(Number(e.target.value))}
                />
              </FormField>
              <FormField label="Горизонталь">
                <input
                  type="range"
                  value={horizontal}
                  onChange={(e) => setHorizontal(Number(e.target.value))}
                />
              </FormField>
              <FormField label="Вертикаль">
                <input
                  type="range"
                  value={vertical}
                  onChange={(e) => setVertical(Number(e.target.value))}
                />
              </FormField>
              <Button disabled={upload.isPending} onClick={() => upload.mutate()}>
                Завантажити обрізане
              </Button>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
