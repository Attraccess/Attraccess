import { AlertStatusIcon } from '@attraccess/plugins-frontend-ui';
import { Alert, Checkbox } from '@heroui/react';
import type { ConfigurationImpact } from '../api/client';
import { useWagoTranslations } from '../i18n';

export function ImpactWarning({
  impacts,
  names,
  acknowledged,
  onChange,
}: {
  impacts: ConfigurationImpact[];
  names: Record<string, string>;
  acknowledged: boolean;
  onChange: (value: boolean) => void;
}) {
  const { t, tBackendMessage } = useWagoTranslations();
  if (!impacts.length) return null;
  return (
    <Alert status="warning">
      <AlertStatusIcon status="warning" />
      <Alert.Content>
        <Alert.Title>{t('revisions.impacts')}</Alert.Title>
        <Alert.Description>{t('revisions.impactDescription')}</Alert.Description>
        <ul>
          {impacts.map((impact) => (
            <li key={impact.channelId}>
              {names[impact.channelId] ?? impact.channelId}: {tBackendMessage(impact.message)}
              {impact.references.length ? (
                impact.references.map((reference) => (
                  <p key={reference.nodeId}>
                    {reference.flowId != null
                      ? t('revisions.globalReference', {
                          flow: reference.flowName ?? `#${reference.flowId}`,
                          node: reference.nodeId,
                          type: reference.nodeType,
                        })
                      : t('revisions.reference', {
                          resource: reference.resourceId,
                          node: reference.nodeId,
                          type: reference.nodeType,
                        })}
                  </p>
                ))
              ) : (
                <p>{t('revisions.noReferences')}</p>
              )}
            </li>
          ))}
        </ul>
        <Checkbox isSelected={acknowledged} onChange={onChange}>
          <Checkbox.Content className="wg:items-start">
            <Checkbox.Control className="wg:mt-0.5">
              <Checkbox.Indicator />
            </Checkbox.Control>
            {t('revisions.accept')}
          </Checkbox.Content>
        </Checkbox>
      </Alert.Content>
    </Alert>
  );
}
