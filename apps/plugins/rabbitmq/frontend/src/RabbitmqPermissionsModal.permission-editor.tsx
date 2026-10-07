import { Button, Input, Label, TextField } from '@heroui/react';
import { Trash2Icon } from 'lucide-react';
import { DEFAULT_MQTT_PERMISSIONS } from './users-api';
import { useRabbitmqTranslations } from './i18n';
import type { PermissionRow } from './RabbitmqPermissionsModal.contracts';

export function PermissionEditor({
  row,
  busy,
  onChange,
  onSave,
  onRemove,
}: {
  row: PermissionRow;
  busy: boolean;
  onChange: (next: PermissionRow) => void;
  onSave: () => void;
  onRemove: () => void;
}) {
  const { t } = useRabbitmqTranslations();
  return (
    <div
      className="rmq:flex rmq:flex-col rmq:gap-3 rmq:rounded-lg rmq:border rmq:border-default-200 rmq:dark:border-default-100 rmq:p-3"
      data-cy={`rabbitmq-permissions-row-${row.vhost}`}
    >
      <div className="rmq:flex rmq:items-center rmq:justify-between rmq:gap-2">
        <span className="rmq:text-sm rmq:font-semibold rmq:text-default-700">
          {t('form.vhost')} <code>{row.vhost}</code>
        </span>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label={t('permissions.remove', { vhost: row.vhost })}
          onPress={onRemove}
          isDisabled={busy}
          data-cy={`rabbitmq-permissions-remove-button-${row.vhost}`}
        >
          <Trash2Icon className="rmq:w-4 rmq:h-4 rmq:text-danger" />
        </Button>
      </div>

      <div className="rmq:grid rmq:grid-cols-1 rmq:md:grid-cols-3 rmq:gap-3">
        <TextField value={row.configure} onChange={(v) => onChange({ ...row, configure: v })}>
          <Label>{t('permissions.configure')}</Label>
          <Input autoComplete="off" data-cy={`rabbitmq-permissions-configure-input-${row.vhost}`} />
        </TextField>
        <TextField value={row.write} onChange={(v) => onChange({ ...row, write: v })}>
          <Label>{t('permissions.write')}</Label>
          <Input autoComplete="off" data-cy={`rabbitmq-permissions-write-input-${row.vhost}`} />
        </TextField>
        <TextField value={row.read} onChange={(v) => onChange({ ...row, read: v })}>
          <Label>{t('permissions.read')}</Label>
          <Input autoComplete="off" data-cy={`rabbitmq-permissions-read-input-${row.vhost}`} />
        </TextField>
      </div>

      <div className="rmq:flex rmq:flex-wrap rmq:justify-end rmq:gap-2">
        <Button
          size="sm"
          variant="ghost"
          onPress={() => onChange({ ...row, ...DEFAULT_MQTT_PERMISSIONS })}
          isDisabled={busy}
          data-cy={`rabbitmq-permissions-mqtt-defaults-button-${row.vhost}`}
        >
          {t('permissions.defaults')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          onPress={onSave}
          isPending={busy}
          data-cy={`rabbitmq-permissions-save-button-${row.vhost}`}
        >
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}
