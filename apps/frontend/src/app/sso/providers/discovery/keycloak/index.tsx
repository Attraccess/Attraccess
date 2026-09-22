import {
  TextField,
  Label,
  Input,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  useOverlayState,
} from '@heroui/react';
import { Button } from '../../../../../components/button';
import { StandardModal } from '../../../../../components/standardModal';
import { OpenIDConfiguration } from '../OpenIDC.data';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useCallback, useState } from 'react';
import { useToastMessage } from '../../../../../components/toastProvider';
import de from './de.json';
import en from './en.json';
import API_ERROR_TRANSLATIONS_DE from '../../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../../global-translations/api-errors.en.json';
import { ApiError, useAuthenticationServiceDiscoverKeycloakOidc } from '@attraccess/react-query-client';

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
  const { refetch: discoverKeycloak } = useAuthenticationServiceDiscoverKeycloakOidc<OpenIDConfiguration>(
    { host, realm },
    undefined,
    { enabled: false },
  );

  const discover = useCallback(async () => {
    if (!host || !realm) {
      return;
    }

    setIsDiscovering(true);

    try {
      const { data: config } = await discoverKeycloak();
      if (!config) throw new Error('Failed to fetch configuration');
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
  }, [host, realm, toast, t, tExists, onDiscovery, close, discoverKeycloak]);

  return (
    <>
      {activator(open)}
      <StandardModal
        isOpen={isOpen}
        onOpenChange={(o) => {
          if (!o) close();
        }}
        size="md"
      >
        {({ close }) => (
          <>
            <ModalHeader>
              <ModalHeading>{t('title')}</ModalHeading>
            </ModalHeader>
            <ModalBody className="flex flex-col gap-4">
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
      </StandardModal>
    </>
  );
}
