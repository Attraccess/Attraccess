import { Alert, AlertContent, AlertDescription, Button, Modal, ModalBackdrop, ModalBody, ModalContainer, ModalDialog, ModalFooter, ModalHeader, ModalHeading } from '@heroui/react';
import { AlertStatusIcon } from '../../../components/AlertStatusIcon';
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
      <ModalContainer size="md">
        <ModalDialog>
          {() => (<>
        <ModalHeader>
          <ModalHeading>{t('title')}</ModalHeading>
          <p className="text-sm text-muted">{t('subtitle')}</p>
        </ModalHeader>

        <ModalBody>
          <Alert status="warning">
            <AlertStatusIcon status="warning" />
            <AlertContent>
              <AlertDescription>{t('description', { email })}</AlertDescription>
            </AlertContent>
          </Alert>

          <PasswordInput
            label={t('inputs.password.label')}
            value={password}
            onChange={(setPassword)}
            autoComplete="current-password"
          />
        </ModalBody>

        <ModalFooter>
          <Button variant="primary" onPress={linkUser} isPending={linkingIsLoading}>
            {t('actions.link')}
          </Button>
        </ModalFooter>
          </>)}
        </ModalDialog>
      </ModalContainer>
    </Modal>
  );
}
