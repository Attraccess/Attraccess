import {
  InputGroup,
  Label,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  Spinner,
  TextField,
  Tooltip,
  TooltipContent,
} from '@heroui/react';
import { ClipboardCopyIcon } from 'lucide-react';
import { SettingsSection } from '../../components/SettingsSection';
import { SettingsSaveBar } from '../../components/SettingsSaveBar';
import { Button } from '../../../../components/button';
import { StandardModal } from '../../../../components/standardModal';
import { useMonitoringSectionState } from './useMonitoringSectionState';
import { MonitoringSectionApiKeyLabel } from './MonitoringSectionApiKeyLabel';

export function MonitoringSection() {
  const {
    t,
    generatedKey,
    setGeneratedKey,
    pendingToggle,
    setPendingToggle,
    setThresholdDraft,
    rerollModal,
    removeModal,
    metricsSettings,
    isLoading,
    threshold,
    metricsEndpointUrl,
    prometheusSnippet,
    generateApiKey,
    isGenerating,
    deleteApiKey,
    isDeleting,
    updateToggle,
    isUpdatingToggles,
    updateThreshold,
    isSavingThreshold,
    copyToClipboard,
    isThresholdSavable,
    isThresholdDirty,
  } = useMonitoringSectionState();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner />
        {t('loading')}
      </div>
    );
  }

  const aside = (
    <>
      <TextField value={metricsEndpointUrl} isReadOnly>
        <Label>{t('endpointLabel')}</Label>
        <InputGroup>
          <InputGroup.Input className="font-mono text-sm" />
          <InputGroup.Suffix>
            <Tooltip>
              <Button
                variant="ghost"
                isIconOnly
                aria-label={t('copyButton')}
                onPress={() =>
                  copyToClipboard(metricsEndpointUrl, t('endpointCopied.title'), t('endpointCopied.description'))
                }
              >
                <ClipboardCopyIcon size={16} />
              </Button>
              <TooltipContent>{t('copyButton')}</TooltipContent>
            </Tooltip>
          </InputGroup.Suffix>
        </InputGroup>
      </TextField>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">{t('setupGuide.title')}</h3>
        <p className="text-xs text-muted">{t('setupGuide.description')}</p>
        <pre className="overflow-x-auto whitespace-pre rounded-lg bg-surface p-3 font-mono text-xs leading-relaxed">
          {prometheusSnippet}
        </pre>
        <p className="text-xs text-muted">{t('setupGuide.bearerNote')}</p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">{t('setupGuide.grafanaTitle')}</h3>
        <p className="text-xs text-muted">{t('setupGuide.grafanaDescription')}</p>
      </div>
    </>
  );

  return (
    <SettingsSection title={t('title')} description={t('sectionDescription')} aside={aside}>
      <MonitoringSectionApiKeyLabel
        {...{
          generatedKey,
          t,
          copyToClipboard,
          setGeneratedKey,
          isGenerating,
          metricsSettings,
          rerollModal,
          generateApiKey,
          removeModal,
          isUpdatingToggles,
          pendingToggle,
          setPendingToggle,
          updateToggle,
          threshold,
          setThresholdDraft,
        }}
      />

      <SettingsSaveBar
        isDirty={isThresholdDirty}
        isSaving={isSavingThreshold}
        isSaveDisabled={!isThresholdSavable}
        onSave={() => {
          if (!isThresholdSavable) {
            return;
          }
          updateThreshold({ requestBody: { slowQueryThresholdSeconds: threshold } });
        }}
        onDiscard={() => setThresholdDraft(undefined)}
      />

      <StandardModal isOpen={rerollModal.isOpen} onOpenChange={(open) => !open && rerollModal.close()} size="sm">
        {({ close }) => (
          <>
            <ModalHeader>
              <ModalHeading>{t('confirmReroll.title')}</ModalHeading>
            </ModalHeader>
            <ModalBody>
              <p>{t('confirmReroll.description')}</p>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" onPress={close}>
                {t('confirmReroll.cancel')}
              </Button>
              <Button variant="tertiary" onPress={() => generateApiKey()} isPending={isGenerating}>
                {t('confirmReroll.confirm')}
              </Button>
            </ModalFooter>
          </>
        )}
      </StandardModal>

      <StandardModal isOpen={removeModal.isOpen} onOpenChange={(open) => !open && removeModal.close()} size="sm">
        {({ close }) => (
          <>
            <ModalHeader>
              <ModalHeading>{t('confirmRemove.title')}</ModalHeading>
            </ModalHeader>
            <ModalBody>
              <p>{t('confirmRemove.description')}</p>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" onPress={close}>
                {t('confirmRemove.cancel')}
              </Button>
              <Button variant="danger" onPress={() => deleteApiKey()} isPending={isDeleting}>
                {t('confirmRemove.confirm')}
              </Button>
            </ModalFooter>
          </>
        )}
      </StandardModal>
    </SettingsSection>
  );
}

export default MonitoringSection;
