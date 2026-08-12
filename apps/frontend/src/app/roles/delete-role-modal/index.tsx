import { useEffect, useState } from 'react';
import { Button, Label, ModalBody, ModalFooter, ModalHeader, ModalHeading, Radio, RadioGroup } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  RoleWithUsageDto,
  useRbacServiceDeleteRole,
  useRbacServiceListRolesKey,
} from '@attraccess/react-query-client';
import { StandardModal } from '../../../components/standardModal';
import { Select } from '../../../components/select';
import { useToastMessage } from '../../../components/toastProvider';
import { useRbacCatalogTranslations } from '../../../hooks/useRbacCatalogTranslations';
import en from './en.json';
import de from './de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../global-translations/api-errors.en.json';
import API_ERROR_TRANSLATIONS_DE from '../../../global-translations/api-errors.de.json';

type DeleteMode = 'remove' | 'reassign';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  role: RoleWithUsageDto | null;
  allRoles: RoleWithUsageDto[];
}

export function DeleteRoleModal({ isOpen, onClose, role, allRoles }: Props) {
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });
  const { roleName } = useRbacCatalogTranslations();
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<DeleteMode>('remove');
  const [reassignToRoleId, setReassignToRoleId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (isOpen) {
      setMode('remove');
      setReassignToRoleId(undefined);
    }
  }, [isOpen]);

  const { mutate: deleteRole, isPending: isDeleting } = useRbacServiceDeleteRole({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [useRbacServiceListRolesKey] });
      toast.success({ title: t('messages.deleted') });
      onClose();
    },
    onError: (error) => {
      toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api', fallbackKey: 'generic' });
    },
  });

  if (role === null) return null;

  const userCount = role.userCount;
  const reassignOptions = allRoles
    .filter((r) => r.id !== role.id)
    .map((r) => ({ key: String(r.id), label: roleName(r) }));

  const handleConfirm = () => {
    deleteRole({
      id: role.id,
      reassignToRoleId: mode === 'reassign' && reassignToRoleId ? Number(reassignToRoleId) : undefined,
    });
  };

  return (
    <StandardModal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="sm"
    >
      {({ close }) => (
        <>
          <ModalHeader>
            <ModalHeading>{t('title')}</ModalHeading>
          </ModalHeader>
          <ModalBody>
            <div className="flex flex-col gap-4">
              <p data-cy="delete-role-modal-message">{t('message', { roleName: roleName(role) })}</p>
              <p
                className={
                  userCount > 0
                    ? 'text-sm text-warning-700 bg-warning-50 border border-warning-200 rounded-md px-3 py-2'
                    : 'text-sm text-default-400'
                }
                data-cy="delete-role-modal-impact"
              >
                {userCount > 0 ? t('impact', { count: userCount }) : t('noImpact')}
              </p>

              {userCount > 0 ? (
                <>
                  <RadioGroup
                    value={mode}
                    onChange={(value) => setMode(value as DeleteMode)}
                    data-cy="delete-role-modal-mode-radiogroup"
                  >
                    <Label className="sr-only">{t('title')}</Label>
                    {(['remove', 'reassign'] as DeleteMode[]).map((option) => (
                      <Radio key={option} value={option} data-cy={`delete-role-modal-mode-${option}`}>
                        <Radio.Control>
                          <Radio.Indicator />
                        </Radio.Control>
                        <Radio.Content className="flex flex-col">
                          <span className="text-small">{t(`options.${option}.label`)}</span>
                          <span className="text-xs text-default-400">{t(`options.${option}.description`)}</span>
                        </Radio.Content>
                      </Radio>
                    ))}
                  </RadioGroup>

                  {mode === 'reassign' ? (
                    <Select
                      value={reassignToRoleId}
                      onChange={setReassignToRoleId}
                      items={reassignOptions}
                      label={t('reassignSelect.label')}
                      placeholder={t('reassignSelect.placeholder')}
                      fullWidth
                      data-cy="delete-role-modal-reassign-select"
                    />
                  ) : null}
                </>
              ) : null}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onPress={close} data-cy="delete-role-modal-cancel-button">
              {t('actions.cancel')}
            </Button>
            <Button
              variant="danger"
              onPress={handleConfirm}
              isPending={isDeleting}
              isDisabled={mode === 'reassign' && !reassignToRoleId}
              data-cy="delete-role-modal-confirm-button"
            >
              {t('actions.delete')}
            </Button>
          </ModalFooter>
        </>
      )}
    </StandardModal>
  );
}
