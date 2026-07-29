import { useCallback, useState } from 'react';
import { Input, Label, Skeleton, TextField } from '@heroui/react';
import { KeyRound, Trash2 } from 'lucide-react';
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser';
import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser';
import { DateTimeDisplay, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  PasskeysService,
  usePasskeysServiceDeletePasskey,
  usePasskeysServiceListPasskeys,
  type Passkey,
} from '@attraccess/react-query-client';
import { Button } from '../../../components/button';
import { useToastMessage } from '../../../components/toastProvider';
import en from './en.json';
import de from './de.json';

export function PasskeysCard() {
  const { t } = useTranslations({ en, de });
  const { showToast } = useToastMessage();
  const { data: passkeys, isLoading, refetch } = usePasskeysServiceListPasskeys();

  const [name, setName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  const { mutateAsync: deletePasskey, isPending: isDeleting } = usePasskeysServiceDeletePasskey();

  const handleRegister = useCallback(async () => {
    setIsRegistering(true);

    try {
      const { options } = await PasskeysService.getPasskeyRegistrationOptions();
      const response = await startRegistration({
        optionsJSON: options as unknown as PublicKeyCredentialCreationOptionsJSON,
      });

      await PasskeysService.verifyPasskeyRegistration({
        requestBody: {
          response: response as unknown as Record<string, unknown>,
          name: name.trim() || undefined,
        },
      });

      setName('');
      await refetch();
      showToast({ title: t('success.added'), type: 'success' });
    } catch (error) {
      // The browser throws when the user dismisses the system prompt - that is not worth a toast
      if (error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'AbortError')) {
        return;
      }
      console.error('Failed to register passkey', error);
      showToast({ title: t('errors.addFailed'), type: 'error' });
    } finally {
      setIsRegistering(false);
    }
  }, [name, refetch, showToast, t]);

  const handleDelete = useCallback(
    async (passkey: Passkey) => {
      try {
        await deletePasskey({ id: passkey.id });
        await refetch();
        showToast({ title: t('success.deleted'), type: 'success' });
      } catch (error) {
        console.error('Failed to delete passkey', error);
        showToast({ title: t('errors.deleteFailed'), type: 'error' });
      }
    },
    [deletePasskey, refetch, showToast, t],
  );

  if (!browserSupportsWebAuthn()) {
    return null;
  }

  if (isLoading) {
    return <Skeleton className="w-full h-10" />;
  }

  return (
    <div className="flex flex-col gap-4" data-cy="passkeys-card">
      <div>
        <div className="text-sm font-medium">{t('title')}</div>
        <div className="text-sm text-default-500">{t('description')}</div>
      </div>

      {passkeys?.length === 0 ? (
        <div className="text-sm text-default-500" data-cy="passkeys-empty">
          {t('empty')}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {passkeys?.map((passkey) => (
            <li
              key={passkey.id}
              className="flex items-center gap-3 rounded-medium bg-default-100 px-3 py-2"
              data-cy={`passkey-item-${passkey.id}`}
            >
              <KeyRound size={16} className="shrink-0 text-default-500" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{passkey.name}</div>
                <div className="text-xs text-default-500">
                  {passkey.lastUsedAt ? (
                    <>
                      {t('lastUsed')} <DateTimeDisplay date={passkey.lastUsedAt} />
                    </>
                  ) : (
                    <>
                      {t('added')} <DateTimeDisplay date={passkey.createdAt} />
                    </>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                isIconOnly
                aria-label={t('actions.delete', { name: passkey.name })}
                onPress={() => handleDelete(passkey)}
                isDisabled={isDeleting}
                data-cy={`passkey-delete-${passkey.id}`}
              >
                <Trash2 size={16} className="text-danger" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <TextField value={name} onChange={setName} isDisabled={isRegistering}>
        <Label>{t('nameLabel')}</Label>
        <Input placeholder={t('namePlaceholder')} data-cy="passkey-name-input" />
      </TextField>

      <Button onPress={handleRegister} isPending={isRegistering} isDisabled={isRegistering} data-cy="passkey-add-button">
        <KeyRound size={16} />
        {t('actions.add')}
      </Button>
    </div>
  );
}
