import {
  InputGroup,
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
import { useMessagingSectionState } from './useMessagingSectionState';
import { MessagingSectionLimitsLoadFailed } from './MessagingSectionLimitsLoadFailed';

/**
 * Messaging limits and the push transport.
 *
 * Only the four rate limits are form state, so they are what the save bar commits. Replacing the
 * VAPID key pair is destructive and irreversible — it invalidates every existing subscription — so
 * it keeps its own two-step confirmation instead of riding along on Save.
 */
export function MessagingSection() {
  const {
    t,
    isLoading,
    setDraft,
    confirmStep,
    setConfirmStep,
    customPublicKey,
    setCustomPublicKey,
    customPrivateKey,
    setCustomPrivateKey,
    pendingOverride,
    setPendingOverride,
    vapidConfig,
    saveLimits,
    isSaving,
    replaceKeys,
    isReplacing,
    copyPublicKey,
    areLimitsReady,
    valueOf,
    isDirty,
    isSavable,
  } = useMessagingSectionState();

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
      <TextField value={vapidConfig?.publicKey ?? ''} isReadOnly>
        <span className="text-sm font-semibold text-foreground">{t('publicKeyLabel')}</span>
        <InputGroup>
          <InputGroup.Input className="font-mono text-sm" />
          <InputGroup.Suffix>
            <Tooltip>
              <Button variant="ghost" isIconOnly aria-label={t('copyButton')} onPress={copyPublicKey}>
                <ClipboardCopyIcon size={16} />
              </Button>
              <TooltipContent>{t('copyButton')}</TooltipContent>
            </Tooltip>
          </InputGroup.Suffix>
        </InputGroup>
      </TextField>
      <p className="text-xs text-muted">{t('aside.publicKeyHint', { count: vapidConfig?.subscriptionCount ?? 0 })}</p>
    </>
  );

  return (
    <SettingsSection title={t('title')} description={t('description')} aside={aside}>
      <MessagingSectionLimitsLoadFailed
        {...{
          areLimitsReady,
          t,
          valueOf,
          setDraft,
          setPendingOverride,
          setConfirmStep,
          customPublicKey,
          setCustomPublicKey,
          customPrivateKey,
          setCustomPrivateKey,
        }}
      />

      <SettingsSaveBar
        isDirty={isDirty}
        isSaving={isSaving}
        isSaveDisabled={!isSavable}
        onSave={() => {
          if (!isSavable) return;
          saveLimits({
            requestBody: {
              sendMaxPerWindow: valueOf('sendMaxPerWindow'),
              sendWindowSeconds: valueOf('sendWindowSeconds'),
              contactMaxPerWindow: valueOf('contactMaxPerWindow'),
              contactWindowSeconds: valueOf('contactWindowSeconds'),
            },
          });
        }}
        onDiscard={() => setDraft({})}
      />

      <StandardModal
        isOpen={confirmStep === 'warning'}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmStep(null);
            setPendingOverride(undefined);
          }
        }}
        size="sm"
      >
        {({ close }) => (
          <>
            <ModalHeader>
              <ModalHeading>{t('confirmWarning.title')}</ModalHeading>
            </ModalHeader>
            <ModalBody>
              <p>{t('confirmWarning.description', { count: vapidConfig?.subscriptionCount ?? 0 })}</p>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" onPress={close}>
                {t('confirmWarning.cancel')}
              </Button>
              <Button variant="tertiary" onPress={() => setConfirmStep('final')}>
                {t('confirmWarning.continue')}
              </Button>
            </ModalFooter>
          </>
        )}
      </StandardModal>

      <StandardModal
        isOpen={confirmStep === 'final'}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmStep(null);
            setPendingOverride(undefined);
          }
        }}
        size="sm"
      >
        {() => (
          <>
            <ModalHeader>
              <ModalHeading>{t('confirmFinal.title')}</ModalHeading>
            </ModalHeader>
            <ModalBody>
              <p>{t('confirmFinal.description')}</p>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" onPress={() => setConfirmStep('warning')}>
                {t('confirmFinal.cancel')}
              </Button>
              <Button
                variant="danger"
                isPending={isReplacing}
                onPress={() => replaceKeys({ requestBody: pendingOverride ?? {} })}
              >
                {t('confirmFinal.confirm')}
              </Button>
            </ModalFooter>
          </>
        )}
      </StandardModal>
    </SettingsSection>
  );
}

export default MessagingSection;
