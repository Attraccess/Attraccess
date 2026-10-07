import { AuditEntryDto } from '@attraccess/react-query-client';
import type { Translate } from './index.translate';
import { Button } from '@heroui/react';
import { Drawer } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { EntryDetails } from './index.entry-details';
import { humanize } from './audit-log-model';
import { Label } from '@heroui/react';
import { ListBox } from '@heroui/react';
import { Select } from '@heroui/react';
import { AuditSettingsDto } from '@attraccess/react-query-client';
import { ShieldCheckIcon } from 'lucide-react';
import { Alert } from '@heroui/react';
import { AlertContent } from '@heroui/react';
import { AlertDescription } from '@heroui/react';
import { AlertTitle } from '@heroui/react';
import { AlertStatusIcon } from '../../../../components/AlertStatusIcon';

export function actor(entry: AuditEntryDto, t: Translate) {
  return entry.actorUsername
    ? `${entry.actorUsername}${entry.actorUsernameSource === 'current' ? ` (${t('currentNameShort')})` : ''}`
    : entry.actorId === null
      ? t('unknownActor')
      : `#${entry.actorId}`;
}

export function auditLabel(section: 'events' | 'targets' | 'fields' | 'settingNames', value: string, t: Translate) {
  return Object.hasOwn(en[section], value) ? t(`${section}[${JSON.stringify(value)}]`) : humanize(value);
}

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
            <Drawer.Body>{selected && <EntryDetails entry={selected} t={t} />}</Drawer.Body>
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

export function AuditSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <Select
      className="min-w-0"
      value={value || 'all'}
      onChange={(key) => onChange(key === 'all' ? '' : String(key ?? ''))}
    >
      <Label>{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((option) => (
            <ListBox.Item key={option.value || 'all'} id={option.value || 'all'} textValue={option.label}>
              {option.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

export function AuditSettingsSummary({ settings }: { settings: AuditSettingsDto | undefined }) {
  const { t } = useTranslations({ en, de });
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
      <ShieldCheckIcon size={16} className={settings?.enabled ? 'text-success' : 'text-muted'} />
      <span>{settings ? t(settings.enabled ? 'enabled' : 'disabled') : t('unknownSettings')}</span>
      {settings && (
        <>
          <span aria-hidden>·</span>
          <span>
            {settings.retention_days} {t('retainedDays')}
          </span>
        </>
      )}
    </div>
  );
}

export function Notice({
  title,
  description,
  status = 'danger',
}: {
  title: string;
  description?: string;
  status?: 'danger' | 'success';
}) {
  return (
    <Alert status={status}>
      <AlertStatusIcon status={status} />
      <AlertContent>
        <AlertTitle>{title}</AlertTitle>
        {description && <AlertDescription>{description}</AlertDescription>}
      </AlertContent>
    </Alert>
  );
}

export function target(entry: AuditEntryDto, t: Translate) {
  if (entry.subjectType === 'setting' && typeof entry.details.settingKey === 'string')
    return auditLabel('settingNames', entry.details.settingKey, t);
  return (
    (entry.subjectLabel &&
      `${entry.subjectLabel}${entry.subjectLabelSource === 'current' ? ` (${t('currentNameShort')})` : ''}`) ||
    (entry.subjectId === null ? t('noTarget') : `${auditLabel('targets', entry.subjectType, t)} #${entry.subjectId}`)
  );
}
