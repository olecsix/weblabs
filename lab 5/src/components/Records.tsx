import type { ReactNode } from 'react';
import { Button } from './ui';

export function Pagination({
  page,
  pages,
  setPage,
}: {
  page: number;
  pages: number;
  setPage: (page: number) => void;
}) {
  if (pages <= 1 && page === 1) return null;
  return (
    <nav className="row pagination" aria-label="Сторінки результатів">
      <Button className="button-quiet" disabled={page <= 1} onClick={() => setPage(page - 1)}>
        Назад
      </Button>
      <span className="muted small">
        Сторінка {page} з {Math.max(1, pages)}
      </span>
      <Button className="button-quiet" disabled={page >= pages} onClick={() => setPage(page + 1)}>
        Далі
      </Button>
    </nav>
  );
}

export function RecordList<T extends { id: string }>({
  rows,
  render,
  grid = false,
}: {
  rows: T[];
  render: (row: T) => ReactNode;
  grid?: boolean;
}) {
  return (
    <ul className={grid ? 'record-grid' : 'record-list'}>
      {rows.map((row) => (
        <li key={row.id}>{render(row)}</li>
      ))}
    </ul>
  );
}

export function RecordTable<T extends { id: string }>({
  rows,
  columns,
}: {
  rows: T[];
  columns: { label: string; render: (row: T) => ReactNode }[];
}) {
  return (
    <div className="table-scroll">
      <table className="record-table">
        <thead>
          <tr>
            {columns.map(({ label }) => (
              <th key={label} scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map(({ label, render }) => (
                <td key={label}>{render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
