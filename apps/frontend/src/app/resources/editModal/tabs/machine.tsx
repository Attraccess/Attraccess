import { useState } from 'react';
import { Alert, AlertContent, AlertDescription, Input, Label, TextField } from '@heroui/react';
import { useResourcesServiceResourceUsageGetActiveSession } from '@attraccess/react-query-client';
import { AlertStatusIcon, LabeledSwitch } from '@attraccess/plugins-frontend-ui';
import { EditorTabProps } from './props';

const MIN_PARALLEL_SESSIONS = 1;
const MAX_PARALLEL_SESSIONS = 1000;

export function MachineTab(props: EditorTabProps) {
  const { t, formData, setField, resource } = props;

  const maxParallelSessions = formData.maxParallelSessions ?? 1;
  // Lets the field be emptied while typing; the stored value is always a valid number
  const [draft, setDraft] = useState<string | null>(null);

  const { data: activeSessions } = useResourcesServiceResourceUsageGetActiveSession(
    { resourceId: resource?.id as number },
    undefined,
    { enabled: !!resource?.id },
  );
  const activeSessionCount = activeSessions?.activeSessionCount ?? 0;

  const onMaxParallelSessionsChange = (raw: string) => {
    setDraft(raw);
    const parsed = Math.floor(Number(raw));
    if (raw.trim() === '' || Number.isNaN(parsed)) return;
    setField('maxParallelSessions', Math.min(MAX_PARALLEL_SESSIONS, Math.max(MIN_PARALLEL_SESSIONS, parsed)));
  };

  return (
    <div className="flex flex-col gap-2">
      <LabeledSwitch
        isSelected={formData.allowTakeOver}
        onChange={(value) => setField('allowTakeOver', value)}
        data-cy="resource-edit-modal-allow-takeover-switch"
      >
        <div className="flex flex-col">
          <span className="text-small">{t('inputs.machine.allowTakeOver.label')}</span>
          <span className="text-tiny text-default-400">{t('inputs.machine.allowTakeOver.description')}</span>
        </div>
      </LabeledSwitch>

      <TextField
        value={draft ?? String(maxParallelSessions)}
        onChange={onMaxParallelSessionsChange}
        onBlur={() => setDraft(null)}
        data-cy="resource-edit-modal-max-parallel-sessions-input"
        className="w-full"
      >
        <Label>{t('inputs.machine.maxParallelSessions.label')}</Label>
        <Input type="number" min={MIN_PARALLEL_SESSIONS} max={MAX_PARALLEL_SESSIONS} className="w-full" />
        <span className="text-tiny text-default-400">{t('inputs.machine.maxParallelSessions.description')}</span>
      </TextField>

      {maxParallelSessions < activeSessionCount && (
        <span className="text-tiny text-warning" data-cy="resource-edit-modal-max-parallel-sessions-hint">
          {t('inputs.machine.maxParallelSessions.belowActiveHint', { count: activeSessionCount })}
        </span>
      )}

      {maxParallelSessions > 1 && (
        <Alert status="warning" data-cy="resource-edit-modal-max-parallel-sessions-flows-warning">
          <AlertStatusIcon status="warning" />
          <AlertContent>
            <AlertDescription>{t('inputs.machine.maxParallelSessions.flowsWarning')}</AlertDescription>
          </AlertContent>
        </Alert>
      )}
    </div>
  );
}
