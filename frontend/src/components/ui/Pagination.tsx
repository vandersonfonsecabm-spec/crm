import { ChevronLeft, ChevronRight } from "lucide-react";
import type { HTMLAttributes } from "react";
import { Button } from "./Button";
import { cx } from "./utils";

type PaginationProps = Omit<HTMLAttributes<HTMLElement>, "onChange"> & {
  page: number;
  totalPages: number;
  total?: number;
  visibleCount?: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  itemLabel?: string;
  previousLabel?: string;
  nextLabel?: string;
};

export function Pagination({ className, disabled = false, itemLabel = "registros", nextLabel = "Próxima", onPageChange, page, previousLabel = "Anterior", total, totalPages, visibleCount, ...props }: PaginationProps) {
  const safeTotalPages = Math.max(1, totalPages);
  const currentPage = Math.min(Math.max(1, page), safeTotalPages);
  const hasPrevious = currentPage > 1;
  const hasNext = currentPage < safeTotalPages && (total === undefined || total > 0);
  return (
    <nav {...props} aria-label="Paginação" className={cx("flex min-w-0 items-center justify-between gap-3 border-t border-[var(--border-default)] px-4 py-3", className)}>
      <Button aria-label={`Ir para ${previousLabel.toLowerCase()}`} disabled={disabled || !hasPrevious} leftIcon={<ChevronLeft size={13} />} onClick={() => onPageChange(Math.max(1, currentPage - 1))} size="sm" variant="secondary">{previousLabel}</Button>
      <p aria-live="polite" className="min-w-0 text-center text-[11px] tabular-nums text-[var(--text-muted)]">
        Página <span className="font-semibold text-[var(--text-secondary)]">{currentPage}</span> de {safeTotalPages}
        {visibleCount !== undefined && total !== undefined && <> · <span className="font-semibold text-[var(--text-secondary)]">{visibleCount}</span> de {total} {itemLabel}</>}
      </p>
      <Button aria-label={`Ir para ${nextLabel.toLowerCase()}`} disabled={disabled || !hasNext} onClick={() => onPageChange(Math.min(safeTotalPages, currentPage + 1))} rightIcon={<ChevronRight size={13} />} size="sm" variant="secondary">{nextLabel}</Button>
    </nav>
  );
}
