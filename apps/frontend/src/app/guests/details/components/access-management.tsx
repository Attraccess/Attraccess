import { useCallback, useMemo, useState } from 'react';
import { Chip, Table, TableBody, TableCell, TableColumn, TableContent, TableHeader, TableRow, TableScrollContainer, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { TableDataLoadingIndicator } from '../../../../components/tableComponents';
import {
  ApiError,
  UseGuestsServiceGetGuestAccessKeyFn,
  useAccessControlServiceResourceGroupIntroductionsGrant,
  useAccessControlServiceResourceGroupIntroductionsRevoke,
  useAccessControlServiceResourceIntroductionsGrant,
  useAccessControlServiceResourceIntroductionsRevoke,
  useGuestsServiceGetGuestAccess,
  useResourcesServiceGetAllResources,
  useResourcesServiceResourceGroupsGetMany,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useToastMessage } from '../../../../components/toastProvider';
import { Button } from '../../../../components/button';
import { Select } from '../../../../components/select';
import { StandardModal } from '../../../../components/standardModal';
import { EmptyState } from '../../../../components/emptyState';

interface Props {
  guestId: number;
  t: (key: string, data?: Record<string, unknown>) => string;
}

export function GuestAccessManagement({ guestId, t }: Props) {
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const { data: access, isLoading: isLoadingAccess, isError: isAccessError } = useGuestsServiceGetGuestAccess({
    id: guestId,
  });
  const { data: resourcesData } = useResourcesServiceGetAllResources({ limit: 100 });
  const { data: groups } = useResourcesServiceResourceGroupsGetMany();

  const invalidateAccess = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: UseGuestsServiceGetGuestAccessKeyFn({ id: guestId }) });
  }, [guestId, queryClient]);

  const handleError = useCallback(
    (error: unknown) => {
      toast.error({ title: (error as ApiError)?.message ?? 'Error' });
    },
    [toast],
  );

  const [addOpen, setAddOpen] = useState(false);
  const [kind, setKind] = useState<'resource' | 'group'>('resource');
  const [selectedTarget, setSelectedTarget] = useState<string>('');

  // Grant and revoke are paired operations: grant closes the add modal and resets its
  // in-progress selection, revoke acts inline on a row and has no modal state to clear.
  // Resetting the form here keeps the post-success UI handling explicit and symmetric.
  const resetAddForm = useCallback(() => {
    setAddOpen(false);
    setKind('resource');
    setSelectedTarget('');
  }, []);

  const { mutate: grantResourceIntroduction, isPending: isGrantingResource } =
    useAccessControlServiceResourceIntroductionsGrant({
      onSuccess: () => {
        toast.success({ title: t('sections.access.add.success') });
        invalidateAccess();
        resetAddForm();
      },
      onError: handleError,
    });

  const { mutate: grantGroupIntroduction, isPending: isGrantingGroup } =
    useAccessControlServiceResourceGroupIntroductionsGrant({
      onSuccess: () => {
        toast.success({ title: t('sections.access.add.success') });
        invalidateAccess();
        resetAddForm();
      },
      onError: handleError,
    });

  const { mutate: revokeResourceIntroduction, isPending: isRevokingResource } =
    useAccessControlServiceResourceIntroductionsRevoke({
      onSuccess: () => {
        toast.success({ title: t('sections.access.revoke.success') });
        invalidateAccess();
      },
      onError: handleError,
    });

  const { mutate: revokeGroupIntroduction, isPending: isRevokingGroup } =
    useAccessControlServiceResourceGroupIntroductionsRevoke({
      onSuccess: () => {
        toast.success({ title: t('sections.access.revoke.success') });
        invalidateAccess();
      },
      onError: handleError,
    });

  const targetItems = useMemo(() => {
    if (kind === 'resource') {
      return (resourcesData?.data ?? []).map((resource) => ({ key: String(resource.id), label: resource.name }));
    }
    return (groups ?? []).map((group) => ({ key: String(group.id), label: group.name }));
  }, [kind, resourcesData, groups]);

  const onGrant = useCallback(() => {
    const targetId = Number(selectedTarget);
    if (!targetId) {
      return;
    }
    if (kind === 'resource') {
      grantResourceIntroduction({ resourceId: targetId, userId: guestId, requestBody: {} });
    } else {
      grantGroupIntroduction({ groupId: targetId, userId: guestId, requestBody: {} });
    }
  }, [grantGroupIntroduction, grantResourceIntroduction, guestId, kind, selectedTarget]);

  const onRevoke = useCallback(
    (entry: { type: 'resource' | 'group'; targetId: number }) => {
      if (entry.type === 'resource') {
        revokeResourceIntroduction({ resourceId: entry.targetId, userId: guestId, requestBody: {} });
      } else {
        revokeGroupIntroduction({ groupId: entry.targetId, userId: guestId, requestBody: {} });
      }
    },
    [guestId, revokeGroupIntroduction, revokeResourceIntroduction],
  );

  const entries = access?.entries ?? [];
  const isGranting = isGrantingResource || isGrantingGroup;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-default-500">{t('sections.access.description')}</p>

      <div className="flex justify-end">
        <Button variant="secondary" onPress={() => setAddOpen(true)} data-cy="guest-access-add-button">
          {t('sections.access.add.button')}
        </Button>
      </div>

      {isLoadingAccess ? (
        <TableDataLoadingIndicator />
      ) : isAccessError ? (
        <p className="text-sm text-danger" data-cy="guest-access-error">
          {t('sections.access.loadError')}
        </p>
      ) : (
        <Table>
          <TableScrollContainer>
            <TableContent aria-label={t('sections.access.title')}>
              <TableHeader>
                <TableColumn width="0">{t('sections.access.columns.type')}</TableColumn>
                <TableColumn isRowHeader>{t('sections.access.columns.name')}</TableColumn>
                <TableColumn width="0">{t('sections.access.columns.status')}</TableColumn>
                <TableColumn width="0" />
              </TableHeader>
              <TableBody items={entries} renderEmptyState={() => <EmptyState message={t('sections.access.empty')} />}>
                {(entry) => (
                  <TableRow key={entry.introductionId} id={entry.introductionId}>
                    <TableCell>
                      <Chip size="sm" variant="primary" color="default">
                        {entry.type === 'group' ? t('sections.access.type.group') : t('sections.access.type.resource')}
                      </Chip>
                    </TableCell>
                    <TableCell>{entry.targetName}</TableCell>
                    <TableCell>
                      {entry.valid ? (
                        <Chip size="sm" color="success" variant="soft">
                          {t('sections.access.status.valid')}
                        </Chip>
                      ) : (
                        <Chip size="sm" color="danger" variant="soft">
                          {t('sections.access.status.invalid')}
                        </Chip>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="secondary"
                        size="sm"
                        isPending={isRevokingResource || isRevokingGroup}
                        onPress={() => onRevoke({ type: entry.type, targetId: entry.targetId })}
                        data-cy={`guest-access-revoke-${entry.type}-${entry.targetId}`}
                      >
                        {t('sections.access.revoke.button')}
                      </Button>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </TableContent>
          </TableScrollContainer>
        </Table>
      )}

      <StandardModal isOpen={addOpen} onOpenChange={(o) => setAddOpen(o)} size="md">
        <ModalHeader>
          <h2 className="text-lg font-semibold">{t('sections.access.add.title')}</h2>
        </ModalHeader>
        <ModalBody>
          <div className="flex flex-col gap-4">
            <Select
              label={t('sections.access.add.kind')}
              value={kind}
              onChange={(key) => {
                setKind(key as 'resource' | 'group');
                setSelectedTarget('');
              }}
              items={[
                { key: 'resource', label: t('sections.access.add.kindResource') },
                { key: 'group', label: t('sections.access.add.kindGroup') },
              ]}
              data-cy="guest-access-kind-select"
            />
            <Select
              label={kind === 'resource' ? t('sections.access.add.resource') : t('sections.access.add.group')}
              value={selectedTarget}
              onChange={setSelectedTarget}
              items={targetItems}
              placeholder="…"
              data-cy="guest-access-target-select"
            />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onPress={() => setAddOpen(false)}>
            {t('sections.access.add.cancel')}
          </Button>
          <Button variant="primary" onPress={onGrant} isPending={isGranting} isDisabled={!selectedTarget}>
            {t('sections.access.add.grant')}
          </Button>
        </ModalFooter>
      </StandardModal>
    </div>
  );
}
