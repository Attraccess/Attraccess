import { Button, LabeledSwitch, ResourceSelector, StandardModal, StatusDialog } from '@attraccess/plugins-frontend-ui';
import {
  Description,
  Fieldset,
  Input,
  Label,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  TextField,
} from '@heroui/react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { createWall, listResourceGroups, updateWall, type Wall, type WallSelection } from '../api';
import { useStatusWallTranslations } from '../i18n';
import { describeSaveError } from './saveError';

const EMPTY: WallSelection = { all: true, resourceIds: [], groupIds: [] };

interface Props {
  isOpen: boolean;
  /** The wall being edited; null creates a new one. */
  wall: Wall | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (wall: Wall, created: boolean) => void;
}

const toggle = (list: number[], id: number) =>
  list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id];

export function WallFormModal({ isOpen, wall, onOpenChange, onSaved }: Readonly<Props>) {
  const { t } = useStatusWallTranslations();
  const [name, setName] = useState('');
  const [selection, setSelection] = useState<WallSelection>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName(wall?.name ?? '');
    setSelection(wall?.selection ?? EMPTY);
  }, [isOpen, wall]);

  const groups = useQuery({
    queryKey: ['status-wall', 'resource-groups'],
    queryFn: listResourceGroups,
    enabled: isOpen && !selection.all,
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), selection };
      return wall ? updateWall(wall.id, body) : createWall(body);
    },
    onSuccess: (saved) => {
      onSaved(saved, wall === null);
      onOpenChange(false);
    },
    onError: (failure) => setError(describeSaveError(failure, t)),
  });

  // Stored groups the list does not offer (hidden from this manager or deleted) have no switch to turn them off.
  const unlistedGroupIds = selection.groupIds.filter((id) => groups.data?.every((group) => group.id !== id));

  const hasSelection = selection.all || selection.resourceIds.length > 0 || selection.groupIds.length > 0;
  const canSave = name.trim().length > 0 && hasSelection;

  return (
    <>
      <StandardModal isOpen={isOpen} onOpenChange={onOpenChange} size="md" data-cy="status-wall-form">
        <ModalHeader>
          <ModalHeading>{wall ? t('form.editTitle') : t('form.createTitle')}</ModalHeading>
        </ModalHeader>
        <ModalBody className="sw:flex sw:flex-col sw:gap-4 sw:p-1">
          <TextField value={name} onChange={setName} isRequired>
            <Label>{t('form.name')}</Label>
            <Input maxLength={100} placeholder={t('form.namePlaceholder')} data-cy="status-wall-form-name" />
          </TextField>
          <LabeledSwitch isSelected={selection.all} onChange={(all) => setSelection({ ...selection, all })}>
            {t('form.all')}
          </LabeledSwitch>
          {!selection.all && (
            <>
              <Fieldset>
                <Fieldset.Legend>{t('form.groups')}</Fieldset.Legend>
                {(groups.data ?? []).map((group) => (
                  <LabeledSwitch
                    key={group.id}
                    isSelected={selection.groupIds.includes(group.id)}
                    onChange={() => setSelection({ ...selection, groupIds: toggle(selection.groupIds, group.id) })}
                  >
                    {group.name}
                  </LabeledSwitch>
                ))}
                {groups.data?.length === 0 && unlistedGroupIds.length === 0 && (
                  <p className="sw:text-sm sw:text-muted">{t('form.noGroups')}</p>
                )}
                {unlistedGroupIds.length > 0 && (
                  <div
                    className="sw:flex sw:flex-col sw:items-start sw:gap-2"
                    data-cy="status-wall-form-unlisted-groups"
                  >
                    <p className="sw:text-sm sw:text-muted">
                      {t('form.unlistedGroups', { count: unlistedGroupIds.length })}
                    </p>
                    <Button
                      variant="tertiary"
                      size="sm"
                      onPress={() =>
                        setSelection({
                          ...selection,
                          groupIds: selection.groupIds.filter((id) => !unlistedGroupIds.includes(id)),
                        })
                      }
                    >
                      {t('form.removeUnlistedGroups')}
                    </Button>
                  </div>
                )}
              </Fieldset>
              <Fieldset>
                <Fieldset.Legend>{t('form.resources')}</Fieldset.Legend>
                <ResourceSelector
                  selection={selection.resourceIds}
                  onSelectionChange={(resourceIds) => setSelection({ ...selection, resourceIds })}
                />
                <Description>{t('form.selectedCount', { count: selection.resourceIds.length })}</Description>
              </Fieldset>
              {!hasSelection && <p className="sw:text-sm sw:text-muted">{t('form.needSelection')}</p>}
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="tertiary" onPress={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            isDisabled={!canSave}
            isPending={save.isPending}
            onPress={() => save.mutate()}
            data-cy="status-wall-form-save"
          >
            {wall ? t('common.save') : t('form.create')}
          </Button>
        </ModalFooter>
      </StandardModal>
      <StatusDialog isOpen={error !== null} onClose={() => setError(null)} status="error" title={t('failed')}>
        {error ?? ''}
      </StatusDialog>
    </>
  );
}
