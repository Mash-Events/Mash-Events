'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import pagination from '@/lib/admin-pagination.cjs';

const { pageNumbers, pageRange } = pagination;

function pageButtonStyle(active = false) {
  return {
    minWidth: 30,
    height: 30,
    padding: '0 8px',
    borderRadius: 10,
    fontSize: 12,
    fontWeight: 600,
    border: `1px solid ${active ? 'var(--adm-ink)' : 'var(--adm-line-strong)'}`,
    background: active ? 'var(--adm-ink)' : 'var(--adm-panel)',
    color: active ? 'var(--adm-accent-ink)' : 'var(--adm-ink-2)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
}

// "Showing 1–25 of 140" with Previous / page numbers / Next.
export default function AdminPagination({
  page,
  pageSize,
  total,
  totalPages,
  onPage,
  label = 'items',
  disabled = false,
}) {
  const range = pageRange(page, pageSize, total);
  if (!range.total) return null;

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
      style={{ borderTop: '1px solid var(--adm-line)' }}
    >
      <p className="text-xs tabular-nums" style={{ color: 'var(--adm-ink-3)' }}>
        Showing {range.from}–{range.to} of {range.total} {label}
      </p>
      {totalPages > 1 ? (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Previous page"
            disabled={disabled || page <= 1}
            onClick={() => onPage(page - 1)}
            style={pageButtonStyle()}
            className="disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft size={14} />
          </button>
          {pageNumbers(page, totalPages).map((value, index) =>
            value === null ? (
              <span
                key={`gap-${index}`}
                className="px-1 text-xs"
                style={{ color: 'var(--adm-ink-3)' }}
              >
                …
              </span>
            ) : (
              <button
                key={value}
                type="button"
                aria-current={value === page ? 'page' : undefined}
                disabled={disabled}
                onClick={() => onPage(value)}
                style={pageButtonStyle(value === page)}
              >
                {value}
              </button>
            )
          )}
          <button
            type="button"
            aria-label="Next page"
            disabled={disabled || page >= totalPages}
            onClick={() => onPage(page + 1)}
            style={pageButtonStyle()}
            className="disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      ) : null}
    </nav>
  );
}
