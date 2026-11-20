import { Button, Card, Chip } from '@heroui/react';
import { ChevronRightIcon } from 'lucide-react';
import { useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import { AuditEntryDto } from '@attraccess/react-query-client';
import { useAuditDomainLabel } from '../useAuditDomainLabel';
import { actor } from './actor';
import { auditLabel } from './auditLabel';
import { target } from './target';
import en from '../en.json';
import de from '../de.json';

export function MobileEntries({
  items,
  onInspect,
}: {
  items: AuditEntryDto[];
  onInspect: (entry: AuditEntryDto) => void;
}) {
  const { t } = useTranslations({ en, de });
  const domainLabel = useAuditDomainLabel();
  const formatDateTime = useDateTimeFormatter({ showSeconds: true });
  return (
    <div className="space-y-3 md:hidden">
      {items.map((entry) => (
        <Card key={entry.id} variant="secondary">
          <Card.Header>
            <div className="flex justify-between gap-3">
              <Chip size="sm">{domainLabel(entry.domain)}</Chip>
              <time className="text-xs text-muted" dateTime={entry.at}>
                {formatDateTime(entry.at)}
              </time>
            </div>
            <Card.Title>{auditLabel('events', entry.action, t)}</Card.Title>
            <Card.Description className="break-words">
              {actor(entry, t)} · {target(entry, t)}
            </Card.Description>
          </Card.Header>
          <Card.Footer className="justify-between">
            <Button size="sm" variant="ghost" onPress={() => onInspect(entry)}>
              {t('inspect')}
              <ChevronRightIcon size={16} />
            </Button>
            <Chip
              size="sm"
              color={entry.outcome === 'failed' ? 'danger' : entry.outcome === 'succeeded' ? 'success' : 'default'}
            >
              {t(`outcomes.${entry.outcome}`)}
            </Chip>
          </Card.Footer>
        </Card>
      ))}
    </div>
  );
}
