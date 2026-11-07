import { Button, LabeledSwitch, StandardModal, StatusDialog } from '@attraccess/plugins-frontend-ui';
import { ModalBody, ModalFooter, ModalHeader, ModalHeading } from '@heroui/react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { createFeed, listHostGroups, searchHostResources, updateFeed } from '../api';
import { useReservationsTranslations } from '../i18n';
import { describeError } from '../lib/errors';
import type { IcalFeed, IcalFeedSecret, IcalSelection } from '../lib/types';
import { TextInput } from '../shared/fields';

const EMPTY: IcalSelection = { resourceIds: [], groupIds: [], introduced: false, maintained: false, ownOnly: false };

interface Props {
  isOpen: boolean;
  /** The feed being edited; null creates a new one. */
  feed: IcalFeed | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (secret: IcalFeedSecret | null) => void;
}

const toggle = (list: number[], id: number) =>
  list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id];

export function FeedFormModal({ isOpen, feed, onOpenChange, onSaved }: Readonly<Props>) {
  const { t } = useReservationsTranslations();
  const [name, setName] = useState('');
  const [selection, setSelection] = useState<IcalSelection>(EMPTY);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName(feed?.name ?? '');
    setSelection(feed?.selection ?? EMPTY);
    setSearch('');
  }, [isOpen, feed]);

  const resources = useQuery({
    queryKey: ['reservations', 'host-resources', search],
    queryFn: () => searchHostResources(search),
    enabled: isOpen && !selection.ownOnly,
    staleTime: 30_000,
  });
  const groups = useQuery({
    queryKey: ['reservations', 'host-groups'],
    queryFn: listHostGroups,
    enabled: isOpen && !selection.ownOnly,
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: async () => {
      const body = { name: name.trim(), selection };
      if (feed) {
        await updateFeed(feed.id, body);
        return null;
      }
      return createFeed(body);
    },
    onSuccess: (secret) => {
      onSaved(secret);
      onOpenChange(false);
    },
    onError: (failure) => setError(describeError(failure, t)),
  });

  const hasSelection =
    selection.ownOnly ||
    selection.introduced ||
    selection.maintained ||
    selection.resourceIds.length > 0 ||
    selection.groupIds.length > 0;
  const canSave = name.trim().length > 0 && hasSelection;

  return (
    <>
      <StandardModal isOpen={isOpen} onOpenChange={onOpenChange} size="md" data-cy="reservations-feed-form">
        <ModalHeader>
          <ModalHeading>{feed ? t('feeds.form.editTitle') : t('feeds.form.createTitle')}</ModalHeading>
        </ModalHeader>
        <ModalBody className="rv:flex rv:flex-col rv:gap-4 rv:p-1">
          <TextInput label={t('feeds.form.name')} value={name} onChange={setName} maxLength={100} isRequired />
          <LabeledSwitch isSelected={selection.ownOnly} onChange={(ownOnly) => setSelection({ ...selection, ownOnly })}>
            {t('feeds.form.ownOnly')}
          </LabeledSwitch>
          {!selection.ownOnly && (
            <>
              <LabeledSwitch
                isSelected={selection.introduced}
                onChange={(introduced) => setSelection({ ...selection, introduced })}
              >
                {t('feeds.form.introduced')}
              </LabeledSwitch>
              <LabeledSwitch
                isSelected={selection.maintained}
                onChange={(maintained) => setSelection({ ...selection, maintained })}
              >
                {t('feeds.form.maintained')}
              </LabeledSwitch>
              <fieldset className="rv:flex rv:flex-col rv:gap-2">
                <legend className="rv:mb-1 rv:text-sm rv:font-semibold">{t('feeds.form.groups')}</legend>
                {(groups.data ?? []).map((group) => (
                  <LabeledSwitch
                    key={group.id}
                    isSelected={selection.groupIds.includes(group.id)}
                    onChange={() => setSelection({ ...selection, groupIds: toggle(selection.groupIds, group.id) })}
                  >
                    {group.name}
                  </LabeledSwitch>
                ))}
                {groups.data?.length === 0 && <p className="rv:text-sm rv:text-muted">{t('feeds.form.noGroups')}</p>}
              </fieldset>
              <fieldset className="rv:flex rv:flex-col rv:gap-2">
                <legend className="rv:mb-1 rv:text-sm rv:font-semibold">{t('feeds.form.resources')}</legend>
                <TextInput
                  label={t('feeds.form.searchResources')}
                  value={search}
                  onChange={setSearch}
                  description={t('feeds.form.selectedCount', { count: selection.resourceIds.length })}
                />
                {(resources.data ?? []).map((resource) => (
                  <LabeledSwitch
                    key={resource.id}
                    isSelected={selection.resourceIds.includes(resource.id)}
                    onChange={() =>
                      setSelection({ ...selection, resourceIds: toggle(selection.resourceIds, resource.id) })
                    }
                  >
                    {resource.name}
                  </LabeledSwitch>
                ))}
              </fieldset>
            </>
          )}
          {!hasSelection && <p className="rv:text-sm rv:text-muted">{t('feeds.form.needSelection')}</p>}
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
            data-cy="reservations-feed-save"
          >
            {feed ? t('common.save') : t('feeds.form.create')}
          </Button>
        </ModalFooter>
      </StandardModal>
      <StatusDialog isOpen={error !== null} onClose={() => setError(null)} status="error" title={t('feeds.failed')}>
        {error ?? ''}
      </StatusDialog>
    </>
  );
}
