import { Accordion, Button } from '@heroui/react';
import type { useRuntimeUpdateDetailsState } from './useRuntimeUpdateDetailsState';
export function RuntimeRecoveryControls({ model }: { model: ReturnType<typeof useRuntimeUpdateDetailsState> }) {
  if (!model.status) return null;
  return (
    <Accordion>
      <Accordion.Item
        onExpandedChange={(expanded) => {
          model.lifetime.recoveryExpanded = expanded;
          if (!expanded) {
            model.lifetime.recoveryGeneration++;
            model.setPassword(null);
          }
        }}
      >
        <Accordion.Heading>
          <Accordion.Trigger>
            {model.t('runtimeManagement.administratorRecovery')}
            <Accordion.Indicator />
          </Accordion.Trigger>
        </Accordion.Heading>
        <Accordion.Panel>
          <Accordion.Body>
            {model.status.management === 'recovery_required' && (
              <Button variant="secondary" isPending={model.pending} onPress={() => void model.action('retry')}>
                {model.t('runtimeManagement.retryAccess')}
              </Button>
            )}
            {model.controllerId &&
              model.status.management === 'managed' &&
              model.status.update &&
              (['failed', 'blocked', 'recovery_required'].includes(model.status.update.phase) ||
                !!model.status.update.cleanupRetryAt) && (
                <Button variant="secondary" isPending={model.pending} onPress={() => void model.action('runtime')}>
                  {model.t('runtimeManagement.retryRuntime')}
                </Button>
              )}
            <p className="wg:mb-3 wg:text-sm wg:text-muted">{model.t('runtimeManagement.recoveryDescription')}</p>
            <Button
              fullWidth
              className="wg:h-auto wg:min-h-8 wg:whitespace-normal wg:py-2"
              size="sm"
              variant="secondary"
              isDisabled={model.pending || !model.status.sessionId}
              onPress={() => (model.password ? model.setPassword(null) : void model.action('password'))}
            >
              {model.t(model.password ? 'runtimeManagement.hidePassword' : 'runtimeManagement.revealPassword')}
            </Button>
            {model.password && (
              <code className="wg:break-all" aria-label={model.t('runtimeManagement.passwordLabel')}>
                {model.password}
              </code>
            )}
            <p className="wg:text-sm wg:text-muted">{model.t('runtimeManagement.restoreDescription')}</p>
            <Button
              fullWidth
              className="wg:h-auto wg:min-h-8 wg:whitespace-normal wg:py-2"
              size="sm"
              variant="secondary"
              isDisabled={model.pending || !model.status.sessionId}
              onPress={() => void model.action('restore')}
            >
              {model.t('runtimeManagement.restore')}
            </Button>
          </Accordion.Body>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
