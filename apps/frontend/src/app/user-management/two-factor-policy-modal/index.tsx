import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  TwoFactorPolicy,
  useTwoFactorAuthenticationServiceGetTwoFactorPolicy,
  useTwoFactorAuthenticationServiceSetTwoFactorPolicy,
} from '@attraccess/react-query-client';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Button,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  ModalIcon,
  useOverlayState,
} from '@heroui/react';
import { Select } from '../../../components/select';
import { Settings2Icon } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useToastMessage } from '../../../components/toastProvider';
import API_ERROR_TRANSLATIONS_DE from '../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../global-translations/api-errors.en.json';
import de from './de.json';
import en from './en.json';

interface Props {
  children: (onOpen: () => void) => ReactNode;
}

export function TwoFactorPolicyModal(props: Props) {
  const { isOpen, open, setOpen, close } = useOverlayState();
  const { t, tExists } = useTranslations({
    de: {
      ...de,
      api: API_ERROR_TRANSLATIONS_DE,
    },
    en: {
      ...en,
      api: API_ERROR_TRANSLATIONS_EN,
    },
  });
  const toast = useToastMessage();

  const { data: policyData, isLoading } = useTwoFactorAuthenticationServiceGetTwoFactorPolicy(undefined, {
    enabled: isOpen,
  });

  const [selectedPolicy, setSelectedPolicy] = useState<TwoFactorPolicy | null>(null);

  useEffect(() => {
    if (policyData?.policy) {
      setSelectedPolicy(policyData.policy);
    }
  }, [policyData?.policy]);

  const policyOptions = useMemo(
    () => [
      {
        value: TwoFactorPolicy.OPTIONAL,
        label: t('options.optional.label'),
        description: t('options.optional.description'),
      },
      {
        value: TwoFactorPolicy.REQUIRED_FOR_PRIVILEGED,
        label: t('options.privileged.label'),
        description: t('options.privileged.description'),
      },
      {
        value: TwoFactorPolicy.REQUIRED_FOR_ALL,
        label: t('options.all.label'),
        description: t('options.all.description'),
      },
    ],
    [t],
  );

  const selectedOption = useMemo(
    () => policyOptions.find((option) => option.value === selectedPolicy) ?? null,
    [policyOptions, selectedPolicy],
  );

  const { mutate: savePolicy, isPending: isSaving } = useTwoFactorAuthenticationServiceSetTwoFactorPolicy({
    onSuccess: () => {
      toast.success({
        title: t('actions.save.success.title'),
        description: t('actions.save.success.description'),
      });
      close();
    },
    onError: (error) => {
      toast.apiError({
        error: error as ApiError,
        t,
        tExists,
        baseTranslationKey: 'api',
      });
    },
  });

  const onSave = useCallback(() => {
    if (!selectedPolicy) {
      return;
    }
    savePolicy({ requestBody: { policy: selectedPolicy } });
  }, [savePolicy, selectedPolicy]);

  return (
    <>
      {props.children(open)}
      <Modal isOpen={isOpen} onOpenChange={setOpen}>
        <ModalBackdrop>
          <ModalContainer size="md">
            <ModalDialog>
              {() => (
                <>
                  <ModalHeader>
                    <ModalIcon><Settings2Icon /></ModalIcon>
                    <ModalHeading>{t('title')}</ModalHeading>
                    <p className="text-sm text-muted">{t('subtitle')}</p>
                  </ModalHeader>
                  <ModalBody className="flex flex-col gap-4">
                    <Alert status="warning">
                      <AlertContent>
                        <AlertTitle>{t('warning.title')}</AlertTitle>
                        <AlertDescription>{t('warning.description')}</AlertDescription>
                      </AlertContent>
                    </Alert>
                    <Select
                      label={t('inputs.policy.label')}
                      isDisabled={isLoading}
                      value={selectedPolicy ?? undefined}
                      onChange={(key) => {
                        if (key) setSelectedPolicy(key as TwoFactorPolicy);
                      }}
                      items={policyOptions.map((option) => ({
                        key: option.value,
                        textValue: option.label,
                        label: (
                          <div className="flex flex-col gap-1">
                            <span>{option.label}</span>
                            <span className="text-xs text-default-500">{option.description}</span>
                          </div>
                        ),
                      }))}
                    />
                    {selectedOption && <div className="text-sm text-default-500">{selectedOption.description}</div>}
                  </ModalBody>
                  <ModalFooter>
                    <Button variant="primary" onPress={onSave} isPending={isSaving} isDisabled={!selectedPolicy}>
                      {t('actions.save.label')}
                    </Button>
                  </ModalFooter>
                </>
              )}
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </Modal>
    </>
  );
}
