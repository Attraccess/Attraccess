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
import {
  Button,
  DateTimeDisplay,
  EmptyState,
  TableActionsColumnHeader,
  TableRowActions,
  useTranslations,
} from '@attraccess/plugins-frontend-ui';
import {
  useDeletePasskey,
  useListPasskeys,
  type Passkey,
  verifyPasskeyRegistration,
  getPasskeyRegistrationOptions,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../components/toastProvider';
import en from './en.json';
import de from './de.json';

export function PasskeysCard() {
  // React escapes the output; escaping names again would show `A &amp; B` in confirmations.
  const { t } = useTranslations({ en, de }, { escapeValues: false });
  const { showToast } = useToastMessage();
  const { data: passkeys, isLoading, refetch } = useListPasskeys();

  const [name, setName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  const { mutateAsync: deletePasskey, isPending: isDeleting } = useDeletePasskey();

  const handleRegister = useCallback(async () => {
    setIsRegistering(true);

    try {
      const { options } = await getPasskeyRegistrationOptions({ throwOnError: true }).then(({ data }) => data);
      const response = await startRegistration({
        optionsJSON: options as unknown as PublicKeyCredentialCreationOptionsJSON,
      });

      await verifyPasskeyRegistration({
        body: {
          response: response as unknown as Record<string, unknown>,
          name: name.trim() || undefined,
        },
        throwOnError: true,
      }).then(({ data }) => data);

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
        await deletePasskey({ path: { id: passkey.id } });
        await refetch();
        showToast({ title: t('success.deleted'), type: 'success' });
      } catch (error) {
        console.error('Failed to delete passkey', error);
        showToast({ title: t('errors.deleteFailed'), type: 'error' });
        throw error;
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
              <TableColumn id="actions">
                <TableActionsColumnHeader />
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
                    <TableRowActions
                      itemName={passkey.name}
                      actions={[
                        {
                          key: 'delete',
                          label: t('actions.delete'),
                          icon: Trash2,
                          tone: 'danger',
                          isDisabled: isDeleting,
                          onPress: () => handleDelete(passkey),
                          confirm: {
                            title: t('deleteConfirm.title', { name: passkey.name }),
                            message: t('deleteConfirm.message'),
                            confirmDataCy: `passkey-delete-confirm-${passkey.id}`,
                          },
                          'data-cy': `passkey-delete-${passkey.id}`,
                        },
                      ]}
                    />
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

      <Button
        onPress={handleRegister}
        isPending={isRegistering}
        isDisabled={isRegistering}
        data-cy="passkey-add-button"
      >
        <KeyRound size={16} />
        {t('actions.add')}
      </Button>
    </div>
  );
}
