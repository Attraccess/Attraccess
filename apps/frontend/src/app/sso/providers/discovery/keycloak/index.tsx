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
import { OpenIDConfiguration } from '../OpenIDC.data';
import { Button, StandardModal, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useCallback, useState } from 'react';
import { useToastMessage } from '../../../../../components/toastProvider';
import de from './de.json';
import en from './en.json';
import discoveryDe from '../de.json';
import discoveryEn from '../en.json';
import { getDiscoveryErrorMessage } from '../discoveryError';
import { useAuthenticationServiceDiscoverKeycloakOidc } from '@attraccess/react-query-client';

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

  const { t } = useTranslations({
    en: { ...discoveryEn, ...en },
    de: { ...discoveryDe, ...de },
  });

  const toast = useToastMessage();
  const { refetch: discoverKeycloak } = useAuthenticationServiceDiscoverKeycloakOidc<OpenIDConfiguration>(
    { host, realm },
    undefined,
    // Discovery runs once per click: retrying a 4xx/502 only delays the error toast (a timeout by ~30 s).
    { enabled: false, retry: false },
  );

  const discover = useCallback(async () => {
    if (!host || !realm) {
      return;
    }

    setIsDiscovering(true);

    try {
      const { data: config } = await discoverKeycloak({ throwOnError: true });
      if (!config) throw new Error('Failed to fetch configuration');
      onDiscovery(config);
      close();
      toast.success({ title: t('success.title'), description: t('success.description') });
    } catch (error) {
      toast.error({ title: t('error.title'), description: getDiscoveryErrorMessage(error) ?? t('error.unreachable') });
    } finally {
      setIsDiscovering(false);
    }
  }, [host, realm, toast, t, onDiscovery, close, discoverKeycloak]);

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
