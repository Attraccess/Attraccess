import { Button, Card, Chip } from '@heroui/react';
import { ChevronRightIcon } from 'lucide-react';
import { auditLabel } from './index.helpers';
import { actor } from './index.helpers';
import { target } from './index.helpers';
import type { useAuditLogSectionState } from './useAuditLogSectionState';
type Props = Pick<ReturnType<typeof useAuditLogSectionState>, 'items' | 't' | 'domainLabel' | 'setSelected'>;
export function AuditLogMobileEntries({ items, t, domainLabel, setSelected }: Props) {
  return (
    <div className="space-y-3 md:hidden">
      {items.map((entry) => (
        <Card key={entry.id} variant="secondary">
          <Card.Header>
            <div className="flex justify-between gap-3">
              <Chip size="sm">{domainLabel(entry.domain)}</Chip>
              <time className="text-xs text-muted" dateTime={entry.at}>
                {new Date(entry.at).toLocaleString()}
              </time>
            </div>
            <Card.Title>{auditLabel('events', entry.action, t)}</Card.Title>
            <Card.Description>
              {actor(entry, t)} · {target(entry, t)}
            </Card.Description>
          </Card.Header>
          <Card.Footer className="justify-between">
            <Button size="sm" variant="ghost" onPress={() => setSelected(entry)}>
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
