// Simple pagination wrapper that provides page/total/onChange API over v3 compound
// FEATURE: Pagination utility component for HeroUI v3 migration
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPreviousIcon, PaginationPrevious, PaginationNextIcon } from '@heroui/react';

interface SimplePaginationProps {
  page: number;
  total: number;
  onChange: (page: number) => void;
  showControls?: boolean;
  className?: string;
  'aria-label'?: string;
}

export function SimplePagination({ page, total, onChange, showControls, className, 'aria-label': ariaLabel }: SimplePaginationProps) {
  if (total <= 1) return null;

  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    if (total <= 7) {
      for (let i = 1; i <= total; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('ellipsis');
      for (let i = Math.max(2, page - 1); i <= Math.min(total - 1, page + 1); i++) pages.push(i);
      if (page < total - 2) pages.push('ellipsis');
      pages.push(total);
    }
    return pages;
  };

  return (
    <Pagination aria-label={ariaLabel ?? 'Pagination'} className={className}>
      <PaginationContent>
        {showControls && (
          <PaginationItem>
            <PaginationPrevious isDisabled={page <= 1} onPress={() => onChange(page - 1)}>
              <PaginationPreviousIcon />
            </PaginationPrevious>
          </PaginationItem>
        )}
        {getPageNumbers().map((p, idx) =>
          p === 'ellipsis' ? (
            <PaginationItem key={`ellipsis-${idx}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={p}>
              <PaginationLink isActive={p === page} onPress={() => onChange(p as number)}>
                {p}
              </PaginationLink>
            </PaginationItem>
          )
        )}
        {showControls && (
          <PaginationItem>
            <PaginationNext isDisabled={page >= total} onPress={() => onChange(page + 1)}>
              <PaginationNextIcon />
            </PaginationNext>
          </PaginationItem>
        )}
      </PaginationContent>
    </Pagination>
  );
}
