import { Pagination } from '@heroui/react';
import { useReservationsTranslations } from '../i18n';

/** Page numbers with ellipses: the first and last page, and the current one with its neighbours. */
export function pageNumbers(page: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages: (number | 'ellipsis')[] = [1];
  if (page > 3) pages.push('ellipsis');
  for (let entry = Math.max(2, page - 1); entry <= Math.min(total - 1, page + 1); entry++) pages.push(entry);
  if (page < total - 2) pages.push('ellipsis');
  pages.push(total);
  return pages;
}

interface Props {
  page: number;
  total: number;
  onChange: (page: number) => void;
}

/** HeroUI pagination for the plugin's lists; hidden while everything fits on one page. */
export function PagePagination({ page, total, onChange }: Readonly<Props>) {
  const { t } = useReservationsTranslations();
  if (total <= 1) return null;
  return (
    <Pagination aria-label={t('common.pagination')} data-cy="reservations-pagination">
      <Pagination.Content>
        <Pagination.Item>
          <Pagination.Previous
            aria-label={t('common.previousPage')}
            isDisabled={page <= 1}
            onPress={() => onChange(page - 1)}
          >
            <Pagination.PreviousIcon />
          </Pagination.Previous>
        </Pagination.Item>
        {pageNumbers(page, total).map((entry, index) =>
          entry === 'ellipsis' ? (
            <Pagination.Item key={`ellipsis-${index}`}>
              <Pagination.Ellipsis />
            </Pagination.Item>
          ) : (
            <Pagination.Item key={entry}>
              <Pagination.Link isActive={entry === page} onPress={() => onChange(entry)}>
                {entry}
              </Pagination.Link>
            </Pagination.Item>
          ),
        )}
        <Pagination.Item>
          <Pagination.Next
            aria-label={t('common.nextPage')}
            isDisabled={page >= total}
            onPress={() => onChange(page + 1)}
          >
            <Pagination.NextIcon />
          </Pagination.Next>
        </Pagination.Item>
      </Pagination.Content>
    </Pagination>
  );
}
