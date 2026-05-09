import { Button, TextField, Label, Input, Modal, ModalBackdrop, ModalBody, ModalContainer, ModalDialog, ModalFooter, ModalHeader, useOverlayState } from '@heroui/react';
import { OpenIDConfiguration } from '../OpenIDC.data';
import { PageHeader } from '../../../../../components/pageHeader';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useCallback, useState } from 'react';
import { useToastMessage } from '../../../../../components/toastProvider';
import de from './de.json';
import en from './en.json';
import API_ERROR_TRANSLATIONS_DE from '../../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../../global-translations/api-errors.en.json';
import { getBaseUrl } from '../../../../../api';
import { ApiError } from '@attraccess/react-query-client';

interface Props {
  onDiscovery: (settings: OpenIDConfiguration) => void;
  children: (open: () => void) => React.ReactNode;
}

export function KeycloakDiscoveryDialog(props: Props) {
  const { onDiscovery, children: activator } = props;
  const { isOpen, open, close } = useOverlayState();
  const [host, setHost] = useState('');
  const [realm, setRealm] = useState('');
  const [isDiscovering, setIsDiscovering] = useState(false);

  const { t, tExists } = useTranslations({
    en: {
      ...en,
      api: API_ERROR_TRANSLATIONS_EN,
    },
    de: {
      ...de,
      api: API_ERROR_TRANSLATIONS_DE,
    },
  });

  const toast = useToastMessage();

  const discover = useCallback(async () => {
    if (!host || !realm) {
      return;
    }

    setIsDiscovering(true);

    try {
      const baseUrl = getBaseUrl();
      const params = new URLSearchParams({ host, realm });
      const response = await fetch(`${baseUrl}/api/auth/sso/discovery/keycloak?${params.toString()}`, {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch configuration: ${response.statusText}`);
      }

      const config: OpenIDConfiguration = await response.json();
      onDiscovery(config);
      close();
      toast.success({ title: t('success.title'), description: t('success.description') });
    } catch (error) {
      toast.apiError({
        error: error as ApiError,
        t,
        tExists,
        baseTranslationKey: 'api',
      });
    } finally {
      setIsDiscovering(false);
    }
  }, [host, realm, toast, t, tExists, onDiscovery, close]);

  return (
    <>
      {activator(open)}
      <Modal isOpen={isOpen} onOpenChange={(o) => { if (!o) close(); }}>
        <ModalBackdrop />
        <ModalContainer>
          <ModalDialog>
            {({ close }) => (
              <>
                <ModalHeader>
                  <PageHeader noMargin title={t('title')} />
                </ModalHeader>
                <ModalBody>
                  <TextField value={host} onChange={setHost}>
                    <Label>{t('host')}</Label>
                    <Input />
                  </TextField>
                  <TextField value={realm} onChange={setRealm}>
                    <Label>{t('realm')}</Label>
                    <Input />
                  </TextField>
                </ModalBody>
                <ModalFooter>
                  <Button variant="primary" onPress={discover} isPending={isDiscovering}>
                    {t('discover')}
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
