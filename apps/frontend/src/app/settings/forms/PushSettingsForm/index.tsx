import { useCallback, useState } from 'react';
import {
  InputGroup,
  Label,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  Separator,
  Spinner,
  TextField,
  Tooltip,
  TooltipContent,
} from '@heroui/react';
import { AlertTriangleIcon, ClipboardCopyIcon, RefreshCwIcon } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ReplaceVapidKeysDto,
  usePushServicePushGetVapidConfig,
  UsePushServicePushGetVapidConfigKeyFn,
  usePushServicePushReplaceVapidKeys,
} from '@attraccess/react-query-client';
import { Button } from '../../../../components/button';
import { useToastMessage } from '../../../../components/toastProvider';
import en from './en.json';
import de from './de.json';

type ConfirmStep = 'warning' | 'final' | null;

export function PushSettingsForm() {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const [confirmStep, setConfirmStep] = useState<ConfirmStep>(null);
  const [pendingOverride, setPendingOverride] = useState<ReplaceVapidKeysDto | undefined>(undefined);
  const [customPublicKey, setCustomPublicKey] = useState('');
  const [customPrivateKey, setCustomPrivateKey] = useState('');

  const { data: vapidConfig, isLoading } = usePushServicePushGetVapidConfig();

  const { mutate: replaceKeys, isPending: isReplacing } = usePushServicePushReplaceVapidKeys({
    onSuccess(data) {
      queryClient.invalidateQueries({ queryKey: UsePushServicePushGetVapidConfigKeyFn() });
      setConfirmStep(null);
      setPendingOverride(undefined);
      setCustomPublicKey('');
      setCustomPrivateKey('');
      toast.success({
        title: t('keysReplaced.title'),
        description: t('keysReplaced.description', { count: data.deletedSubscriptions }),
      });
    },
    onError() {
      toast.error({ title: t('errors.replaceFailed') });
    },
  });

  const subscriptionCount = vapidConfig?.subscriptionCount ?? 0;

  const handleCopyPublicKey = useCallback(async () => {
    if (!vapidConfig?.publicKey || !navigator?.clipboard?.writeText) {
      toast.error({ title: t('copyFailed.title'), description: t('copyFailed.description') });
      return;
    }
    try {
      await navigator.clipboard.writeText(vapidConfig.publicKey);
      toast.success({ title: t('copied.title'), description: t('copied.description') });
    } catch {
      toast.error({ title: t('copyFailed.title'), description: t('copyFailed.description') });
    }
  }, [toast, t, vapidConfig?.publicKey]);

  const openRegenerateConfirm = useCallback(() => {
    setPendingOverride(undefined);
    setConfirmStep('warning');
  }, []);

  const openOverrideConfirm = useCallback(() => {
    const publicKey = customPublicKey.trim();
    const privateKey = customPrivateKey.trim();
    if (!publicKey || !privateKey) {
      return;
    }
    setPendingOverride({ publicKey, privateKey });
    setConfirmStep('warning');
  }, [customPrivateKey, customPublicKey]);

  const executeReplace = useCallback(() => {
    replaceKeys({ requestBody: pendingOverride ?? {} });
  }, [pendingOverride, replaceKeys]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-default-500">
        <Spinner />
        {t('loading')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <TextField value={vapidConfig?.publicKey ?? ''} isReadOnly>
        <Label>{t('publicKeyLabel')}</Label>
        <InputGroup>
          <InputGroup.Input className="font-mono text-sm" />
          <InputGroup.Suffix>
            <Tooltip>
              <Button variant="ghost" isIconOnly onPress={handleCopyPublicKey} aria-label={t('copyButton')}>
                <ClipboardCopyIcon size={16} />
              </Button>
              <TooltipContent>{t('copyButton')}</TooltipContent>
            </Tooltip>
          </InputGroup.Suffix>
        </InputGroup>
      </TextField>

      <div className="flex gap-2 flex-wrap">
        <Button variant="tertiary" onPress={openRegenerateConfirm} isPending={isReplacing}>
          <RefreshCwIcon size={16} />
          {t('regenerateButton')}
        </Button>
      </div>

      <Separator />

      <div className="flex flex-col gap-3">
        <h4 className="text-sm font-semibold">{t('overrideTitle')}</h4>
        <p className="text-sm text-default-500">{t('overrideDescription')}</p>

        <TextField value={customPublicKey} onChange={setCustomPublicKey}>
          <Label>{t('publicKeyInputLabel')}</Label>
          <InputGroup>
            <InputGroup.Input className="font-mono text-sm" />
          </InputGroup>
        </TextField>

        <TextField value={customPrivateKey} onChange={setCustomPrivateKey}>
          <Label>{t('privateKeyInputLabel')}</Label>
          <InputGroup>
            <InputGroup.Input className="font-mono text-sm" type="password" />
          </InputGroup>
        </TextField>

        <Button
          variant="secondary"
          onPress={openOverrideConfirm}
          isDisabled={!customPublicKey.trim() || !customPrivateKey.trim()}
        >
          {t('applyCustomButton')}
        </Button>
      </div>

      <Modal
        isOpen={confirmStep === 'warning'}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmStep(null);
            setPendingOverride(undefined);
          }
        }}
      >
        <ModalBackdrop>
          <ModalContainer size="sm">
            <ModalDialog>
              {({ close }) => (
                <>
                  <ModalHeader>
                    <ModalHeading>{t('confirmWarning.title')}</ModalHeading>
                  </ModalHeader>
                  <ModalBody>
                    <div className="flex items-start gap-2 text-warning-600 dark:text-warning-400">
                      <AlertTriangleIcon size={18} className="mt-0.5 shrink-0" />
                      <p>{t('confirmWarning.description', { count: subscriptionCount })}</p>
                    </div>
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
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </Modal>

      <Modal
        isOpen={confirmStep === 'final'}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmStep(null);
            setPendingOverride(undefined);
          }
        }}
      >
        <ModalBackdrop>
          <ModalContainer size="sm">
            <ModalDialog>
              {({ close }) => (
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
                    <Button variant="danger" onPress={executeReplace} isPending={isReplacing}>
                      {t('confirmFinal.confirm')}
                    </Button>
                  </ModalFooter>
                </>
              )}
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </Modal>
    </div>
  );
}
