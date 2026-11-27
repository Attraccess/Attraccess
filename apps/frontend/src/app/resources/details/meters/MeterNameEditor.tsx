import { useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react';
import { ResourceMeterDto } from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAuth } from '../../../../hooks/useAuth';
import { MeterNameForm } from './MeterNameForm';
import en from './en.json';
import de from './de.json';

/** The "Create meter" button and the form it opens, for people who may edit the resource. */
export function MeterNameEditor({
  resourceId,
  onSaved,
}: {
  resourceId: number;
  onSaved?: (meter: ResourceMeterDto) => void;
}) {
  const { t } = useTranslations({ en, de });
  const { hasPermission } = useAuth();
  const [editing, setEditing] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const focusButton = useRef(false);
  // The button only exists again once the form is gone.
  useEffect(() => {
    if (editing || !focusButton.current) return;
    focusButton.current = false;
    button.current?.focus();
  }, [editing]);
  if (!hasPermission('resources.update')) return null;
  if (editing)
    return (
      <MeterNameForm
        resourceId={resourceId}
        onSaved={onSaved}
        onClose={(hadFocus) => {
          focusButton.current = hadFocus;
          setEditing(false);
        }}
      />
    );
  return (
    <Button ref={button} size="sm" variant="secondary" data-cy="meter-create" onPress={() => setEditing(true)}>
      {t('create')}
    </Button>
  );
}
