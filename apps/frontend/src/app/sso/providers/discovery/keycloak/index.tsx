import { Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, useDisclosure } from '@heroui/react';
import { OpenIDConfiguration } from '../OpenIDC.data';
import { PageHeader } from '../../../../../components/pageHeader';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useCallback, useState } from 'react';
import { useToastMessage } from '../../../../../components/toastProvider';

import de from './de.json';
import en from './en.json';
import { getBaseUrl } from '../../../../../api';

interface Props {
  onDiscovery: (settings: OpenIDConfiguration) => void;
  children: (open: () => void) => React.ReactNode;
}

export function KeycloakDiscoveryDialog(props: Props) {
  const { onDiscovery, children: activator } = props;
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [host, setHost] = useState('');
  const [realm, setRealm] = useState('');
  const [isDiscovering, setIsDiscovering] = useState(false);

  const { t } = useTranslations('oidc.discovery.keycloak', {
    de,
    en,
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
      onClose();
      toast.success({ title: t('success.title'), description: t('success.description') });
    } catch (error) {
      toast.error({
        title: t('error.generic.title'),
        description: `${t('error.generic.description')} ${error instanceof Error ? error.message : error}`,
      });
    } finally {
      setIsDiscovering(false);
    }
  }, [host, realm, toast, t, onDiscovery, onClose]);

  return (
    <>
      {activator(onOpen)}
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalContent>
          <ModalHeader>
            <PageHeader noMargin title={t('title')} />
          </ModalHeader>
          <ModalBody>
            <Input label={t('host')} value={host} onChange={(e) => setHost(e.target.value)} />
            <Input label={t('realm')} value={realm} onChange={(e) => setRealm(e.target.value)} />
          </ModalBody>
          <ModalFooter>
            <Button color="primary" onPress={discover} isLoading={isDiscovering}>
              {t('discover')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
