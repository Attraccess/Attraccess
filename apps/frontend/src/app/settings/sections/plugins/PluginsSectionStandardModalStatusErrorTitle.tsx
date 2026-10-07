import { ModalBody, ModalFooter, ModalHeader, ModalHeading } from '@heroui/react';
import { Button } from '../../../../components/button';
import { StandardModal } from '../../../../components/standardModal';
import { usePluginsSectionState } from './usePluginsSectionState';
type Props = Pick<
  ReturnType<typeof usePluginsSectionState>,
  'failedPlugin' | 'setFailedPlugin' | 't' | 'retryPlugin' | 'isRetryingPlugin'
>;
export function PluginsSectionStandardModalStatusErrorTitle({
  failedPlugin,
  setFailedPlugin,
  t,
  retryPlugin,
  isRetryingPlugin,
}: Props) {
  return (
    <StandardModal
      isOpen={failedPlugin !== null}
      onOpenChange={(open) => !open && setFailedPlugin(null)}
      data-cy="plugins-list-load-error-modal"
      size="md"
    >
      {({ close }) => (
        <>
          <ModalHeader>
            <ModalHeading>{t('status.errorTitle', { pluginName: failedPlugin?.name ?? '' })}</ModalHeading>
          </ModalHeader>
          <ModalBody>
            <p className="text-sm text-muted">{t('status.errorDescription')}</p>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-medium border border-divider p-3 text-sm text-danger">
              {failedPlugin?.error}
            </pre>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onPress={close}>
              {t('status.close')}
            </Button>
            <Button
              variant="primary"
              onPress={() => void retryPlugin()}
              isPending={isRetryingPlugin}
              data-cy="plugins-list-retry-load-button"
            >
              {t('status.retry')}
            </Button>
          </ModalFooter>
        </>
      )}
    </StandardModal>
  );
}
