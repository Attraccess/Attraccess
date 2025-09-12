import { Alert, Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import { PageHeader } from '../../../components/pageHeader';
import { useTranslations, useUrlQuery } from '@attraccess/plugins-frontend-ui';
import { PasswordInput } from '../../../components/PasswordInput';

import de from './de.json';
import en from './en.json';
import { useCallback, useMemo, useState } from 'react';
import { SSOProviderType, useAuthenticationServiceLinkUserToExternalAccount } from '@attraccess/react-query-client';
import { useCallbackURL } from '../use-sso-callback-url';

interface Props {
  show: boolean;
}

export function SSOLinkingRequiredModal(props: Props) {
  const { show } = props;

  const { t } = useTranslations({
    de,
    en,
  });

  const query = useUrlQuery();
  const { email, externalId, ssoProviderId, ssoProviderType } = useMemo(() => {
    return {
      email: query.get('email'),
      externalId: query.get('externalId'),
      ssoProviderId: query.get('ssoProviderId'),
      ssoProviderType: query.get('ssoProviderType'),
    };
  }, [query]);

  const [password, setPassword] = useState('');

  const cleanHref = useMemo(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('accountLinking');
    url.searchParams.delete('email');
    url.searchParams.delete('externalId');
    url.searchParams.delete('ssoProviderId');

    return url.toString();
  }, []);

  const callbackURL = useCallbackURL(
    ssoProviderId ? parseInt(ssoProviderId, 10) : -1,
    ssoProviderType as SSOProviderType,
    cleanHref,
  );

  const { mutate: linkMutation, isPending: linkingIsLoading } = useAuthenticationServiceLinkUserToExternalAccount({
    onSuccess: () => {
      window.location.href = callbackURL;
    },
  });

  const linkUser = useCallback(() => {
    if (!externalId) {
      return;
    }

    if (!email) {
      return;
    }

    linkMutation({
      requestBody: {
        email,
        externalId,
        password,
      },
    });
  }, [email, externalId, linkMutation, password]);

  return (
    <Modal isOpen={show} isDismissable={false}>
      <ModalContent>
        <ModalHeader>
          <PageHeader title={t('title')} subtitle={t('subtitle')} noMargin />
        </ModalHeader>

        <ModalBody>
          <Alert color="warning">{t('description', { email })}</Alert>

          <PasswordInput
            label={t('inputs.password.label')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </ModalBody>

        <ModalFooter>
          <Button color="primary" onPress={linkUser} isLoading={linkingIsLoading}>
            {t('actions.link')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
