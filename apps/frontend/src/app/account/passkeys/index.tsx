import { useCallback, useState } from 'react';
import {
  Input,
  Label,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
  TextField,
} from '@heroui/react';
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
import { EmptyState } from '../../../components/emptyState';
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

      <Table data-cy="passkeys-table">
        <TableScrollContainer>
          <TableContent aria-label={t('title')}>
            <TableHeader>
              <TableColumn id="name" isRowHeader>
                {t('columns.name')}
              </TableColumn>
              <TableColumn id="lastUsed">{t('columns.lastUsed')}</TableColumn>
              {/* ponytail: header text is sr-only - the icon buttons carry their own labels, and the visible
                  word costs ~50px the Security column cannot spare at tablet width */}
              <TableColumn id="actions">
                <span className="sr-only">{t('columns.actions')}</span>
              </TableColumn>
            </TableHeader>
            <TableBody
              items={passkeys ?? []}
              dependencies={[isDeleting]}
              renderEmptyState={() => <EmptyState message={t('empty')} />}
            >
              {(passkey) => (
                <TableRow key={passkey.id} id={passkey.id} data-cy={`passkey-item-${passkey.id}`}>
                  <TableCell>{passkey.name}</TableCell>
                  <TableCell>
                    {passkey.lastUsedAt ? <DateTimeDisplay date={passkey.lastUsedAt} /> : t('neverUsed')}
                  </TableCell>
                  <TableCell>
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
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </TableContent>
        </TableScrollContainer>
      </Table>

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
