import { useCallback, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Description,
  Input,
  Label,
  Link,
  TextField,
} from '@heroui/react';
import {
  useResourceFlowsServiceGetNodeSchemas,
  useResourceFlowsServiceGetSharedMachineFlowWarnings,
  useResourcesServiceResourceUsageGetActiveSession,
} from '@attraccess/react-query-client';
import { AlertStatusIcon, LabeledSwitch, useTranslations } from '@attraccess/plugins-frontend-ui';
import nodeTranslationsDe from '../../details/flows/node/de.json';
import nodeTranslationsEn from '../../details/flows/node/en.json';
import { EditorTabProps } from './props';

const MIN_PARALLEL_SESSIONS = 1;
const MAX_PARALLEL_SESSIONS = 1000;

// Same titles as the flow editor: core nodes from its translations, plugin nodes from their schema label.
function useFlowNodeTitle(resourceId: number | undefined, enabled: boolean) {
  const { t, tExists } = useTranslations({
    en: { nodes: nodeTranslationsEn.nodes },
    de: { nodes: nodeTranslationsDe.nodes },
  });
  const { data: nodeSchemas } = useResourceFlowsServiceGetNodeSchemas({ resourceId: resourceId as number }, undefined, {
    enabled: !!resourceId && enabled,
  });
  return useCallback(
    (nodeType: string) => {
      const titleKey = 'nodes.' + nodeType + '.title';
      if (tExists(titleKey)) return t(titleKey);
      return nodeSchemas?.find((schema) => schema.type === nodeType)?.label ?? nodeType;
    },
    [nodeSchemas, t, tExists],
  );
}

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
  const isShared = maxParallelSessions > 1;
  const { data: flowWarnings, isError: flowWarningsFailed } = useResourceFlowsServiceGetSharedMachineFlowWarnings(
    { resourceId: resource?.id as number },
    undefined,
    { enabled: !!resource?.id && isShared },
  );
  const nodeTitle = useFlowNodeTitle(resource?.id, isShared && !!flowWarnings?.length);
  const activeSessionCount = activeSessions?.activeSessionCount ?? 0;
  const isBelowActiveCount = maxParallelSessions < activeSessionCount;

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
        {/* One Description, so the field announces the below-active-count hint along with its description. */}
        <Description>
          {t('inputs.machine.maxParallelSessions.description')}
          {isBelowActiveCount && (
            <>
              {' '}
              <span className="block text-warning" data-cy="resource-edit-modal-max-parallel-sessions-hint">
                {t('inputs.machine.maxParallelSessions.belowActiveHint', { count: activeSessionCount })}
              </span>
            </>
          )}
        </Description>
      </TextField>

      {/* Never blocks saving; if the check fails, the generic warning still shows. */}
      {isShared && (flowWarningsFailed || !!flowWarnings?.length) && (
        <Alert status="warning" data-cy="resource-edit-modal-max-parallel-sessions-flows-warning">
          <AlertStatusIcon status="warning" />
          <AlertContent>
            <AlertTitle>{t('inputs.machine.maxParallelSessions.flowsWarningTitle')}</AlertTitle>
            <AlertDescription>{t('inputs.machine.maxParallelSessions.flowsWarning')}</AlertDescription>
            {!!flowWarnings?.length && (
              <ul className="list-disc pl-4 text-sm">
                {flowWarnings.map((warning) => (
                  <li key={`${warning.flowId ?? 'resource'}:${warning.triggerNodeId}`}>
                    {/* Every entry names its flow; a global flow's name opens that flow's editor. */}
                    {warning.flowId !== null ? (
                      <Link
                        href={`/devices/flows/${warning.flowId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-cy="resource-edit-modal-max-parallel-sessions-global-flow-link"
                      >
                        {warning.flowName ?? `#${warning.flowId}`}
                      </Link>
                    ) : (
                      t('inputs.machine.maxParallelSessions.flowsWarningOwnFlow')
                    )}
                    {': '}
                    {nodeTitle(warning.triggerType)} →{' '}
                    {warning.effectNodes.map((effect) => nodeTitle(effect.nodeType)).join(', ')}
                  </li>
                ))}
              </ul>
            )}
            {(flowWarningsFailed || flowWarnings?.some((warning) => warning.flowId === null)) && (
              <Link href={`/resources/${resource?.id}/flows`} target="_blank" rel="noopener noreferrer">
                {t('inputs.machine.maxParallelSessions.flowsWarningOpen')}
              </Link>
            )}
          </AlertContent>
        </Alert>
      )}
    </div>
  );
}
