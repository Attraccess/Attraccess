import { Alert, Button, Modal, ModalBackdrop, ModalBody, ModalContainer, ModalDialog, ModalFooter, ModalHeader } from '@heroui/react';
import { PageHeader } from '../../../components/pageHeader';
import { useTranslations, useUrlQuery } from '@attraccess/plugins-frontend-ui';
import { PasswordInput } from '../../../components/PasswordInput';
import { useToastMessage } from '../../../components/toastProvider';
import {
  ApiError,
  useAuthenticationServiceLinkUserToExternalAccount,
  SSOProviderType,
} from '@attraccess/react-query-client';

import de from './de.json';
import en from './en.json';
import { useCallback, useMemo, useState } from 'react';
import { useCallbackURL } from '../use-sso-callback-url';

interface Props {
  show: boolean;
}

export function SSOLinkingRequiredModal(props: Props) {
  const { show } = props;

  const { t, tExists } = useTranslations({
    de,
    en,
  });
  const toast = useToastMessage();

  const query = useUrlQuery();
  const { email, linkToken, tokenPayload } = useMemo(() => {
    const rawLinkToken = query.get('ssoLinkToken');
    let parsedPayload: {
      email?: string;
      providerId?: number;
      providerType?: SSOProviderType;
    } | null = null;

    if (rawLinkToken) {
      try {
        const [encodedPayload] = rawLinkToken.split('.');
        if (encodedPayload) {
          const padded = encodedPayload.replace(/-/g, '+').replace(/_/g, '/');
          const decoded = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '='));
          parsedPayload = JSON.parse(decoded);
        }
      } catch {
        parsedPayload = null;
      }
    }

    return {
      email: query.get('email') ?? parsedPayload?.email ?? undefined,
      linkToken: rawLinkToken ?? undefined,
      tokenPayload: parsedPayload,
    };
  }, [query]);

  const [password, setPassword] = useState('');

  const cleanHref = useMemo(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('accountLinking');
    url.searchParams.delete('email');
    url.searchParams.delete('ssoLinkToken');
    url.searchParams.delete('ssoProviderType');

    return url.toString();
  }, []);

  const callbackURL = useCallbackURL(
    tokenPayload?.providerId ?? -1,
    (tokenPayload?.providerType as SSOProviderType) ?? SSOProviderType.OIDC,
    cleanHref,
  );

  const { mutate: linkMutation, isPending: linkingIsLoading } = useAuthenticationServiceLinkUserToExternalAccount({
    onSuccess: () => {
      window.location.href = callbackURL;
    },
    onError: (err: unknown) => {
      toast.apiError({ error: err as ApiError, t, tExists, baseTranslationKey: 'errors', fallbackKey: 'unknown' });
    },
  });

  const linkUser = useCallback(() => {
    if (!linkToken) {
      return;
    }

    linkMutation({
      requestBody: {
        linkToken,
        password,
      },
    });
  }, [linkToken, linkMutation, password]);

  return (
    <Modal isOpen={show}>
      <ModalBackdrop isDismissable={false} />
      <ModalContainer>
        <ModalDialog>
          {() => (<>
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
          </>)}
        </ModalDialog>
      </ModalContainer>
    </Modal>
  );
}
