import { useState } from 'react';
import { Button, FieldError, Input, Label, TextField } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ResourceMeterDto,
  useResourceMeteringServiceCreateResourceMeter,
  useResourceMeteringServiceUpdateResourceMeter,
  UseResourceMeteringServiceListResourceMetersKeyFn,
} from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

export function MeterNameEditor({
  resourceId,
  meter,
  onSaved,
}: {
  resourceId: number;
  meter?: ResourceMeterDto;
  onSaved?: (meter: ResourceMeterDto) => void;
}) {
  const { t } = useTranslations({ en, de });
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(meter?.name ?? '');
  const [error, setError] = useState(false);
  const create = useResourceMeteringServiceCreateResourceMeter();
  const update = useResourceMeteringServiceUpdateResourceMeter();
  const pending = create.isPending || update.isPending;
  const save = async () => {
    if (!name.trim()) return;
    setError(false);
    try {
      const saved = meter
        ? await update.mutateAsync({ resourceId, meterId: meter.id, requestBody: { name: name.trim() } })
        : await create.mutateAsync({ resourceId, requestBody: { name: name.trim() } });
      await queryClient.invalidateQueries({
        queryKey: UseResourceMeteringServiceListResourceMetersKeyFn({ resourceId }),
      });
      setEditing(false);
      setName(saved.name);
      onSaved?.(saved);
    } catch {
      setError(true);
    }
  };
  if (!editing)
    return (
      <Button
        size="sm"
        variant="secondary"
        onPress={() => {
          setName(meter?.name ?? '');
          setError(false);
          setEditing(true);
        }}
      >
        {t(meter ? 'rename' : 'create')}
      </Button>
    );
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
        <Input maxLength={100} autoFocus />
        <FieldError>{error ? t('error') : null}</FieldError>
      </TextField>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onPress={() => void save()} isDisabled={!name.trim() || pending}>
          {t(meter ? 'save' : 'create')}
        </Button>
        <Button size="sm" variant="ghost" onPress={() => setEditing(false)} isDisabled={pending}>
          {t('cancel')}
        </Button>
      </div>
    </div>
  );
}
