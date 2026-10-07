import { Chip, Spinner, Table } from '@heroui/react';
import { ActivityIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { DateTimeDisplay } from '@attraccess/plugins-frontend-ui';
import { Button } from '../../../../components/button';
import { FlatSection } from '../../../../components/flatSection';
import { useResourceDiagnosticsTabState } from './useResourceDiagnosticsTabState';
type Props = Pick<
  ReturnType<typeof useResourceDiagnosticsTabState>,
  't' | 'isLoadingTransitions' | 'transitions' | 'page' | 'totalPages' | 'setPage'
>;
export function ResourceDiagnosticsTabFlatSection({
  t,
  isLoadingTransitions,
  transitions,
  page,
  totalPages,
  setPage,
}: Props) {
  return (
    <FlatSection icon={<ActivityIcon className="w-4 h-4" />} title={t('transitions.title')}>
      {isLoadingTransitions ? (
        <Spinner size="sm" />
      ) : (transitions?.items ?? []).length === 0 ? (
        <p className="text-sm text-muted">{t('transitions.empty')}</p>
      ) : (
        <div className="flex flex-col gap-3" data-testid="diagnostics-transitions">
          <Table>
            <Table.ScrollContainer>
              <Table.Content aria-label={t('transitions.title')}>
                <Table.Header>
                  <Table.Column isRowHeader>{t('transitions.columns.timestamp')}</Table.Column>
                  <Table.Column>{t('transitions.columns.state')}</Table.Column>
                  <Table.Column>{t('transitions.columns.source')}</Table.Column>
                  <Table.Column>{t('transitions.columns.interval')}</Table.Column>
                </Table.Header>
                <Table.Body>
                  {(transitions?.items ?? []).map((transition) => (
                    <Table.Row
                      key={`${transition.intervalId}-${transition.state}-${transition.timestamp}`}
                      id={`${transition.intervalId}-${transition.state}`}
                      textValue={transition.state}
                    >
                      <Table.Cell>
                        <DateTimeDisplay date={new Date(transition.timestamp)} />
                      </Table.Cell>
                      <Table.Cell>
                        <Chip size="sm" color={transition.state === 'operating' ? 'success' : 'default'}>
                          {transition.state === 'operating' ? t('state.operating') : t('state.idle')}
                        </Chip>
                      </Table.Cell>
                      <Table.Cell className="text-sm">{t('transitions.sourceFlowSignal')}</Table.Cell>
                      <Table.Cell className="text-sm text-muted">#{transition.intervalId}</Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted">
              {t('transitions.page')
                .replace('{page}', `${page}/${totalPages}`)
                .replace('{total}', String(transitions?.totalIntervals ?? 0))}
            </span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                isDisabled={page <= 1}
                onPress={() => setPage((current) => Math.max(1, current - 1))}
                aria-label={t('transitions.previous')}
              >
                <ChevronLeftIcon size={16} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                isDisabled={page >= totalPages}
                onPress={() => setPage((current) => current + 1)}
                aria-label={t('transitions.next')}
              >
                <ChevronRightIcon size={16} />
              </Button>
            </div>
          </div>
        </div>
      )}
    </FlatSection>
  );
}
