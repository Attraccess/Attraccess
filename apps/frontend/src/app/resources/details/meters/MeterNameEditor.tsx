import { useState } from 'react';
import { Button, FieldError, Input, Label, TextField } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ResourceMeterDto,
  useCreateResourceMeter,
  useUpdateResourceMeter,
  UseListResourceMetersKeyFn,
} from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAuth } from '../../../../hooks/useAuth';
import en from './en.json';
import de from './de.json';

export function MeterNameEditor({
  resourceId,
  meter,
  onSaved,
  onEditingChange,
  isDisabled,
}: {
  resourceId: number;
  meter?: ResourceMeterDto;
  onSaved?: (meter: ResourceMeterDto) => void;
  onEditingChange?: (editing: boolean) => void;
  /** Another action on the meter is running. */
  isDisabled?: boolean;
}) {
  const { t } = useTranslations({ en, de });
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('resources.update');
  const queryClient = useQueryClient();
  const [editing, setEditingState] = useState(false);
  const setEditing = (next: boolean) => {
    setEditingState(next);
    onEditingChange?.(next);
  };
  const [name, setName] = useState(meter?.name ?? '');
  const [error, setError] = useState(false);
  const create = useCreateResourceMeter();
  const update = useUpdateResourceMeter();
  const pending = create.isPending || update.isPending;
  const save = async () => {
    if (!canEdit || !name.trim()) return;
    setError(false);
    try {
      const saved = meter
        ? await update.mutateAsync({ path: { resourceId, meterId: meter.id }, body: { name: name.trim() } })
        : await create.mutateAsync({ path: { resourceId }, body: { name: name.trim() } });
      await queryClient.invalidateQueries({
        queryKey: UseListResourceMetersKeyFn({ path: { resourceId } }),
      });
      setEditing(false);
      setName(saved.name);
      onSaved?.(saved);
    } catch {
      setError(true);
    }
  };
  if (!canEdit) return null;
  if (!editing)
    return (
      <Button
        size="sm"
        variant="secondary"
        aria-label={meter ? t('renameLabel', { name: meter.name }) : undefined}
        isDisabled={isDisabled}
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
