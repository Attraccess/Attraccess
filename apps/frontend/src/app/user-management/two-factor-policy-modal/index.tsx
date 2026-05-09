import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  TwoFactorPolicy,
  useTwoFactorAuthenticationServiceGetTwoFactorPolicy,
  useTwoFactorAuthenticationServiceSetTwoFactorPolicy,
} from '@attraccess/react-query-client';
import { Alert, AlertContent, AlertDescription, AlertTitle, Button, ListBoxItem, Modal, ModalBackdrop, ModalBody, ModalContainer, ModalDialog, ModalFooter, ModalHeader, Select, Selection, useOverlayState } from '@heroui/react';
import { Settings2Icon } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../../components/pageHeader';
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

  const onSelectionChange = useCallback((keys: Selection) => {
    const [value] = Array.from(keys as Set<string>);
    if (value) {
      setSelectedPolicy(value as TwoFactorPolicy);
    }
  }, []);

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
        <ModalBackdrop />
        <ModalContainer>
          <ModalDialog>
            {() => (
              <>
                <ModalHeader>
                  <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<Settings2Icon />} noMargin={true} />
                </ModalHeader>
                <ModalBody>
                  <Alert status="warning" >
                    <AlertContent>
                      <AlertTitle>{t('warning.title')}</AlertTitle>
                      <AlertDescription>{t('warning.description')}</AlertDescription>
                    </AlertContent>
                  </Alert>
                  <Select
                    label={t('inputs.policy.label')}
                    selectedKeys={selectedPolicy ? new Set([selectedPolicy]) : new Set([])}
                    onSelectionChange={onSelectionChange}
                    disallowEmptySelection
                    isDisabled={isLoading}
                  >
                    {policyOptions.map((option) => (
                      <ListBoxItem key={option.value} id={option.value} textValue={option.label}>
                        <div className="flex flex-col gap-1">
                          <span>{option.label}</span>
                          <span className="text-xs text-default-500">{option.description}</span>
                        </div>
                      </ListBoxItem>
                    ))}
                  </Select>
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
      </Modal>
    </>
  );
}
