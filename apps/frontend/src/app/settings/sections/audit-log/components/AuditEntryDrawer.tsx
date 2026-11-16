import { Button, Drawer } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { AuditEntryDto } from '@attraccess/react-query-client';
import { EntryDetails } from './EntryDetails';
import { auditLabel } from './auditLabel';
import en from '../en.json';
import de from '../de.json';

export function AuditEntryDrawer({ selected, onClose }: { selected: AuditEntryDto | null; onClose: () => void }) {
  const { t } = useTranslations({ en, de });
  return (
    <Drawer
      isOpen={!!selected}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Drawer.Backdrop>
        <Drawer.Content placement="right">
          <Drawer.Dialog className="w-full max-w-xl">
            <Drawer.CloseTrigger />
            <Drawer.Header>
              <Drawer.Heading>{selected ? auditLabel('events', selected.action, t) : t('eventDetails')}</Drawer.Heading>
              <p className="text-xs text-muted">
                {t('eventDetails')} #{selected?.id}
              </p>
            </Drawer.Header>
            <Drawer.Body>{selected && <EntryDetails entry={selected} />}</Drawer.Body>
            <Drawer.Footer>
              <Button variant="secondary" slot="close">
                {t('close')}
              </Button>
            </Drawer.Footer>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}
