import { Table } from '@heroui/react';
import { EyeIcon } from 'lucide-react';
import {
  TableActionsColumnHeader,
  TableRowActions,
  useDateTimeFormatter,
  useTranslations,
} from '@attraccess/plugins-frontend-ui';
import { AuditEntryDto } from '@attraccess/react-query-client';
import { useAuditDomainLabel } from '../useAuditDomainLabel';
import { actor } from './actor';
import { auditLabel } from './auditLabel';
import { target } from './target';
import en from '../en.json';
import de from '../de.json';

export function AuditEntriesTable({
  items,
  onInspect,
}: {
  items: AuditEntryDto[];
  onInspect: (entry: AuditEntryDto) => void;
}) {
  const { t } = useTranslations({ en, de });
  const domainLabel = useAuditDomainLabel();
  const formatDate = useDateTimeFormatter({ showTime: false });
  const formatTime = useDateTimeFormatter({ showDate: false, showSeconds: true });
  return (
    <div className="hidden md:block">
      <Table>
        <Table.ScrollContainer>
          <Table.Content aria-label={t('activity')}>
            <Table.Header>
              <Table.Column isRowHeader>{t('activity')}</Table.Column>
              <Table.Column>{t('actor')}</Table.Column>
              <Table.Column>{t('target')}</Table.Column>
              <Table.Column>{t('time')}</Table.Column>
              <Table.Column id="actions">
                <TableActionsColumnHeader />
              </Table.Column>
            </Table.Header>
            <Table.Body>
              {items.map((entry) => (
                <Table.Row key={entry.id} id={entry.id} textValue={entry.action}>
                  <Table.Cell>
                    <div className="space-y-1">
                      <p className="font-medium">{auditLabel('events', entry.action, t)}</p>
                      <div className="flex flex-wrap gap-2 text-xs text-muted">
                        <span>{domainLabel(entry.domain)}</span>
                        <span>·</span>
                        <span>{t(`outcomes.${entry.outcome}`)}</span>
                      </div>
                    </div>
                  </Table.Cell>
                  <Table.Cell>{actor(entry, t)}</Table.Cell>
                  <Table.Cell>
                    <span className="break-words">{target(entry, t)}</span>
                  </Table.Cell>
                  <Table.Cell>
                    <time className="whitespace-nowrap text-xs text-muted" dateTime={entry.at}>
                      {formatDate(entry.at)}
                      <br />
                      {formatTime(entry.at)}
                    </time>
                  </Table.Cell>
                  <Table.Cell>
                    <TableRowActions
                      itemName={`#${entry.id}`}
                      actions={[
                        { key: 'inspect', label: t('inspect'), icon: EyeIcon, onPress: () => onInspect(entry) },
                      ]}
                    />
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
    </div>
  );
}
