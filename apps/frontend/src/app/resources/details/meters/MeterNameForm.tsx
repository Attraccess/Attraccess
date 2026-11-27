import { useEffect, useRef, useState } from 'react';
import { Button, FieldError, Input, Label, TextField } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ResourceMeterDto,
  useCreateResourceMeter,
  useUpdateResourceMeter,
  UseListResourceMetersKeyFn,
} from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

/** Names a new meter, or renames `meter`. Its parents show it only to people who may edit the resource. */
export function MeterNameForm({
  resourceId,
  meter,
  onSaved,
  onClose,
}: {
  resourceId: number;
  meter?: ResourceMeterDto;
  onSaved?: (meter: ResourceMeterDto) => void;
  onClose: () => void;
}) {
  const { t } = useTranslations({ en, de });
  const queryClient = useQueryClient();
  const [name, setName] = useState(meter?.name ?? '');
  const [error, setError] = useState(false);
  const create = useCreateResourceMeter();
  const update = useUpdateResourceMeter();
  const pending = create.isPending || update.isPending;
  const input = useRef<HTMLInputElement>(null);
  // Not `autoFocus`: opened from a menu, the form mounts while the closing menu still moves the focus, which would
  // take it away again.
  useEffect(() => {
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);
  const save = async () => {
    if (!name.trim()) return;
    setError(false);
    try {
      const saved = meter
        ? await update.mutateAsync({ path: { resourceId, meterId: meter.id }, body: { name: name.trim() } })
        : await create.mutateAsync({ path: { resourceId }, body: { name: name.trim() } });
      await queryClient.invalidateQueries({
        queryKey: UseListResourceMetersKeyFn({ path: { resourceId } }),
      });
      onClose();
      onSaved?.(saved);
    } catch {
      setError(true);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <TextField
        value={name}
        onChange={setName}
        isInvalid={error}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void save();
          }
        }}
      >
        <Label>{t('name')}</Label>
        <Input ref={input} maxLength={100} />
        <FieldError>{error ? t('error') : null}</FieldError>
      </TextField>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onPress={() => void save()} isDisabled={!name.trim() || pending}>
          {t(meter ? 'save' : 'create')}
        </Button>
        <Button size="sm" variant="ghost" onPress={onClose} isDisabled={pending}>
          {t('cancel')}
        </Button>
      </div>
    </div>
  );
}
