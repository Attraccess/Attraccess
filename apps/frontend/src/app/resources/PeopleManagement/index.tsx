import { useCallback, useMemo, useState } from 'react';
import {
  Button,
  Card,
  CardProps,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownPopover,
  DropdownTrigger,
  Form,
  Label,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TextArea,
  TextField,
  Tooltip,
  useOverlayState,
} from '@heroui/react';
import {
  AlertCircle,
  AwardIcon,
  CheckIcon,
  ChevronDownIcon,
  HistoryIcon,
  ShieldCheckIcon,
  ShieldOffIcon,
  Trash2Icon,
  UserPlusIcon,
} from 'lucide-react';
import {
  ResourceIntroducer,
  ResourceIntroduction,
  UseAccessControlServiceResourceIntroducersGetManyKeyFn,
  UseAccessControlServiceResourceIntroductionsGetHistoryKeyFn,
  UseAccessControlServiceResourceIntroductionsGetManyKeyFn,
  useAccessControlServiceResourceIntroducersGetMany,
  useAccessControlServiceResourceIntroducersGrant,
  useAccessControlServiceResourceIntroducersRevoke,
  useAccessControlServiceResourceIntroductionsGetHistory,
  useAccessControlServiceResourceIntroductionsGetMany,
  useAccessControlServiceResourceIntroductionsGrant,
  useAccessControlServiceResourceIntroductionsRevoke,
  User,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { AttraccessUser, DateTimeDisplay, useTranslations, UserSearch } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../components/toastProvider';
import { EmptyState } from '../../../components/emptyState';
import { Select } from '../../../components/select';
import { IntroductionHistoryModal } from '../../../components/IntroductionsManagement/history';
import { useHasValidIntroduction } from '../../../hooks/useHasValidIntroduction';
import { PageHeader } from '../../../components/pageHeader';
import en from './en.json';
import de from './de.json';

type AddMode = 'introducer' | 'introduction';
type FilterMode = 'all' | 'introducers' | 'introduced';

interface PersonRow {
  user: User;
  isIntroducer: boolean;
  introducer: ResourceIntroducer | null;
  introduction: ResourceIntroduction | null;
  hasValidIntroduction: boolean;
  introductionLastEventAt: string | null;
  activityAt: string;
}

interface PeopleManagementProps {
  resourceId: number;
  canManageIntroducers: boolean;
  canManageIntroductions: boolean;
}

export function PeopleManagement(props: Readonly<PeopleManagementProps & Omit<CardProps, 'children'>>) {
  const { resourceId, canManageIntroducers, canManageIntroductions, ...rest } = props;
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<FilterMode>('all');
  const [addMode, setAddMode] = useState<AddMode | null>(null);
  const [addUser, setAddUser] = useState<User | null>(null);
  const [addComment, setAddComment] = useState('');
  const { isOpen: isAddOpen, open: openAdd, close: closeAdd } = useOverlayState();

  const [revokeContext, setRevokeContext] = useState<{ user: User; action: 'grant' | 'revoke' } | null>(null);
  const [revokeComment, setRevokeComment] = useState('');
  const { isOpen: isRevokeOpen, open: openRevoke, close: closeRevoke } = useOverlayState();

  const [historyUserId, setHistoryUserId] = useState<number | null>(null);
  const { isOpen: isHistoryOpen, open: openHistory, close: closeHistory } = useOverlayState();

  const { data: introducers, error: introducersError } = useAccessControlServiceResourceIntroducersGetMany({
    resourceId,
  });

  const { data: introductions, error: introductionsError } = useAccessControlServiceResourceIntroductionsGetMany({
    resourceId,
  });

  const userHasValidIntroduction = useHasValidIntroduction({ introductions: introductions ?? [] });

  const invalidateIntroducers = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: UseAccessControlServiceResourceIntroducersGetManyKeyFn({ resourceId }),
    });
  }, [queryClient, resourceId]);

  const invalidateIntroductions = useCallback(
    (userId?: number) => {
      queryClient.invalidateQueries({
        queryKey: UseAccessControlServiceResourceIntroductionsGetManyKeyFn({ resourceId }),
      });
      if (userId !== undefined) {
        queryClient.invalidateQueries({
          queryKey: UseAccessControlServiceResourceIntroductionsGetHistoryKeyFn({ resourceId, userId }),
        });
      }
    },
    [queryClient, resourceId],
  );

  const { mutateAsync: grantIntroducer, isPending: isGrantingIntroducer } =
    useAccessControlServiceResourceIntroducersGrant({
      onSuccess: () => {
        toast.success({
          title: t('toasts.introducerGranted.title'),
          description: t('toasts.introducerGranted.description'),
        });
        invalidateIntroducers();
      },
      onError: (err: Error) => {
        toast.error({
          title: t('toasts.introducerGrantFailed.title'),
          description: t('toasts.introducerGrantFailed.description', { error: err.message }),
        });
      },
    });

  const { mutateAsync: revokeIntroducer, isPending: isRevokingIntroducer } =
    useAccessControlServiceResourceIntroducersRevoke({
      onSuccess: () => {
        toast.success({
          title: t('toasts.introducerRevoked.title'),
          description: t('toasts.introducerRevoked.description'),
        });
        invalidateIntroducers();
      },
      onError: (err: Error) => {
        toast.error({
          title: t('toasts.introducerRevokeFailed.title'),
          description: t('toasts.introducerRevokeFailed.description', { error: err.message }),
        });
      },
    });

  const { mutateAsync: grantIntroduction, isPending: isGrantingIntroduction } =
    useAccessControlServiceResourceIntroductionsGrant({
      onSuccess: (_data, variables) => {
        toast.success({
          title: t('toasts.introductionGranted.title'),
          description: t('toasts.introductionGranted.description'),
        });
        invalidateIntroductions(variables.userId);
      },
      onError: (err: Error) => {
        toast.error({
          title: t('toasts.introductionGrantFailed.title'),
          description: t('toasts.introductionGrantFailed.description', { error: err.message }),
        });
      },
    });

  const { mutateAsync: revokeIntroduction, isPending: isRevokingIntroduction } =
    useAccessControlServiceResourceIntroductionsRevoke({
      onSuccess: (_data, variables) => {
        toast.success({
          title: t('toasts.introductionRevoked.title'),
          description: t('toasts.introductionRevoked.description'),
        });
        invalidateIntroductions(variables.userId);
      },
      onError: (err: Error) => {
        toast.error({
          title: t('toasts.introductionRevokeFailed.title'),
          description: t('toasts.introductionRevokeFailed.description', { error: err.message }),
        });
      },
    });

  const isMutating =
    isGrantingIntroducer || isRevokingIntroducer || isGrantingIntroduction || isRevokingIntroduction;

  const rows = useMemo<PersonRow[]>(() => {
    const byUserId = new Map<number, PersonRow>();

    (introducers ?? []).forEach((introducer) => {
      if (!introducer.user) return;
      byUserId.set(introducer.user.id, {
        user: introducer.user,
        isIntroducer: true,
        introducer,
        introduction: null,
        hasValidIntroduction: false,
        introductionLastEventAt: null,
        activityAt: introducer.grantedAt,
      });
    });

    (introductions ?? []).forEach((introduction) => {
      const user = introduction.receiverUser;
      if (!user) return;
      const sortedHistory = [...(introduction.history ?? [])].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      const lastEvent = sortedHistory[0];
      const lastEventAt = lastEvent?.createdAt ?? introduction.createdAt;
      const isValid = userHasValidIntroduction(user);
      const existing = byUserId.get(user.id);
      if (existing) {
        existing.introduction = introduction;
        existing.hasValidIntroduction = isValid;
        existing.introductionLastEventAt = lastEventAt;
        if (new Date(lastEventAt).getTime() > new Date(existing.activityAt).getTime()) {
          existing.activityAt = lastEventAt;
        }
      } else {
        byUserId.set(user.id, {
          user,
          isIntroducer: false,
          introducer: null,
          introduction,
          hasValidIntroduction: isValid,
          introductionLastEventAt: lastEventAt,
          activityAt: lastEventAt,
        });
      }
    });

    return Array.from(byUserId.values()).sort(
      (a, b) => new Date(b.activityAt).getTime() - new Date(a.activityAt).getTime(),
    );
  }, [introducers, introductions, userHasValidIntroduction]);

  const filteredRows = useMemo(() => {
    if (filter === 'introducers') return rows.filter((r) => r.isIntroducer);
    if (filter === 'introduced') return rows.filter((r) => r.hasValidIntroduction);
    return rows;
  }, [rows, filter]);

  const handleAddOpen = useCallback(
    (mode: AddMode) => {
      setAddMode(mode);
      setAddUser(null);
      setAddComment('');
      openAdd();
    },
    [openAdd],
  );

  const handleAddSubmit = useCallback(async () => {
    if (!addUser || !addMode) return;
    if (addMode === 'introducer') {
      await grantIntroducer({ resourceId, userId: addUser.id });
    } else {
      await grantIntroduction({
        resourceId,
        userId: addUser.id,
        requestBody: { comment: addComment || undefined },
      });
    }
    setAddUser(null);
    setAddComment('');
    setAddMode(null);
    closeAdd();
  }, [addUser, addMode, addComment, grantIntroducer, grantIntroduction, resourceId, closeAdd]);

  const handleIntroductionToggle = useCallback(
    (user: User, action: 'grant' | 'revoke') => {
      setRevokeContext({ user, action });
      setRevokeComment('');
      openRevoke();
    },
    [openRevoke],
  );

  const handleRevokeSubmit = useCallback(async () => {
    if (!revokeContext) return;
    const { user, action } = revokeContext;
    if (action === 'grant') {
      await grantIntroduction({
        resourceId,
        userId: user.id,
        requestBody: { comment: revokeComment || undefined },
      });
    } else {
      await revokeIntroduction({
        resourceId,
        userId: user.id,
        requestBody: { comment: revokeComment || undefined },
      });
    }
    setRevokeContext(null);
    setRevokeComment('');
    closeRevoke();
  }, [revokeContext, revokeComment, grantIntroduction, revokeIntroduction, resourceId, closeRevoke]);

  const handleHistoryOpen = useCallback(
    (userId: number) => {
      setHistoryUserId(userId);
      openHistory();
    },
    [openHistory],
  );

  if (introducersError || introductionsError) {
    return (
      <Card {...rest}>
        <Card.Content>
          <div className="flex items-center gap-3 p-2">
            <AlertCircle size={20} className="text-danger" />
            <div>
              <p className="font-medium text-danger">{t('loadError')}</p>
              <p className="text-sm text-foreground-500">{t('loadErrorDescription')}</p>
            </div>
          </div>
        </Card.Content>
      </Card>
    );
  }

  const showBothAdd = canManageIntroducers && canManageIntroductions;

  return (
    <Card {...rest}>
      <Card.Header>
        <PageHeader
          title={t('title')}
          subtitle={t('subtitle')}
          icon={<ShieldCheckIcon />}
          noMargin
          actions={
            (canManageIntroducers || canManageIntroductions) &&
            (showBothAdd ? (
              <Dropdown>
                <DropdownTrigger aria-label={t('addPerson')} data-cy="people-add-person">
                  <Button variant="primary">
                    <UserPlusIcon className="w-4 h-4" />
                    {t('addPerson')}
                    <ChevronDownIcon className="w-4 h-4" />
                  </Button>
                </DropdownTrigger>
                <DropdownPopover>
                  <DropdownMenu aria-label={t('addPerson')}>
                    <DropdownItem
                      key="introduction"
                      id="introduction"
                      onPress={() => handleAddOpen('introduction')}
                      data-cy="people-add-introduction"
                    >
                      <ShieldCheckIcon className="w-4 h-4 inline mr-2" />
                      {t('addOptions.introduction')}
                    </DropdownItem>
                    <DropdownItem
                      key="introducer"
                      id="introducer"
                      onPress={() => handleAddOpen('introducer')}
                      data-cy="people-add-introducer"
                    >
                      <AwardIcon className="w-4 h-4 inline mr-2" />
                      {t('addOptions.introducer')}
                    </DropdownItem>
                  </DropdownMenu>
                </DropdownPopover>
              </Dropdown>
            ) : (
              <Button
                variant="primary"
                onPress={() => handleAddOpen(canManageIntroducers ? 'introducer' : 'introduction')}
                data-cy="people-add-person"
              >
                <UserPlusIcon className="w-4 h-4" />
                {canManageIntroducers ? t('addOptions.introducer') : t('addOptions.introduction')}
              </Button>
            ))
          }
        />
      </Card.Header>

      <Card.Content className="flex flex-col gap-4">
        <Select
          aria-label={t('filters.all')}
          value={filter}
          onChange={(key) => setFilter(key as FilterMode)}
          items={[
            { key: 'all', label: t('filters.all') },
            { key: 'introducers', label: t('filters.introducers') },
            { key: 'introduced', label: t('filters.introduced') },
          ]}
          data-cy="people-filter"
          className="max-w-xs"
        />

        <Table>
          <TableContent aria-label={t('title')}>
            <TableHeader>
              <TableColumn isRowHeader>{t('columns.name')}</TableColumn>
              <TableColumn>{t('columns.introducer')}</TableColumn>
              <TableColumn>{t('columns.introduced')}</TableColumn>
              <TableColumn>{t('columns.actions')}</TableColumn>
            </TableHeader>
            <TableBody
              items={filteredRows}
              renderEmptyState={() => <EmptyState message={t('emptyState')} />}
            >
              {(row) => (
                <TableRow key={row.user.id} id={row.user.id}>
                  <TableCell className="w-full">
                    <AttraccessUser user={row.user} />
                  </TableCell>
                  <TableCell>
                    {row.isIntroducer ? (
                      <span className="inline-flex items-center gap-1 text-success">
                        <CheckIcon className="w-4 h-4" />
                        {t('value.yes')}
                      </span>
                    ) : (
                      <span className="text-foreground-400">{t('value.no')}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.hasValidIntroduction && row.introductionLastEventAt ? (
                      <span className="inline-flex items-center gap-1 text-success">
                        <CheckIcon className="w-4 h-4" />
                        <DateTimeDisplay date={row.introductionLastEventAt} />
                      </span>
                    ) : row.introduction && row.introductionLastEventAt ? (
                      <span className="text-danger text-sm">
                        <DateTimeDisplay date={row.introductionLastEventAt} />
                      </span>
                    ) : (
                      <span className="text-foreground-400">{t('value.no')}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2 flex-wrap">
                      {row.introduction && (
                        <Tooltip>
                          <Tooltip.Trigger>
                            <Button
                              variant="ghost"
                              isIconOnly
                              onPress={() => handleHistoryOpen(row.user.id)}
                              aria-label={t('rowActions.history')}
                              data-cy={`people-row-history-${row.user.id}`}
                            >
                              <HistoryIcon className="w-4 h-4" />
                            </Button>
                          </Tooltip.Trigger>
                          <Tooltip.Content>{t('rowActions.history')}</Tooltip.Content>
                        </Tooltip>
                      )}

                      {canManageIntroductions &&
                        (row.hasValidIntroduction ? (
                          <Tooltip>
                            <Tooltip.Trigger>
                              <Button
                                variant="ghost"
                                isIconOnly
                                isPending={isRevokingIntroduction}
                                onPress={() => handleIntroductionToggle(row.user, 'revoke')}
                                aria-label={t('rowActions.revokeIntroduction')}
                                data-cy={`people-row-revoke-introduction-${row.user.id}`}
                              >
                                <ShieldOffIcon className="w-4 h-4" />
                              </Button>
                            </Tooltip.Trigger>
                            <Tooltip.Content>{t('rowActions.revokeIntroduction')}</Tooltip.Content>
                          </Tooltip>
                        ) : row.introduction ? (
                          <Tooltip>
                            <Tooltip.Trigger>
                              <Button
                                variant="ghost"
                                isIconOnly
                                isPending={isGrantingIntroduction}
                                onPress={() => handleIntroductionToggle(row.user, 'grant')}
                                aria-label={t('rowActions.grantIntroduction')}
                                data-cy={`people-row-grant-introduction-${row.user.id}`}
                              >
                                <ShieldCheckIcon className="w-4 h-4" />
                              </Button>
                            </Tooltip.Trigger>
                            <Tooltip.Content>{t('rowActions.grantIntroduction')}</Tooltip.Content>
                          </Tooltip>
                        ) : null)}

                      {canManageIntroducers && row.isIntroducer && (
                        <Tooltip>
                          <Tooltip.Trigger>
                            <Button
                              variant="ghost"
                              isIconOnly
                              isPending={isRevokingIntroducer}
                              onPress={() => revokeIntroducer({ resourceId, userId: row.user.id })}
                              aria-label={t('rowActions.revokeIntroducer')}
                              data-cy={`people-row-revoke-introducer-${row.user.id}`}
                            >
                              <Trash2Icon className="w-4 h-4" />
                            </Button>
                          </Tooltip.Trigger>
                          <Tooltip.Content>{t('rowActions.revokeIntroducer')}</Tooltip.Content>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </TableContent>
        </Table>
      </Card.Content>

      <Modal
        isOpen={isAddOpen}
        onOpenChange={(o) => {
          if (!o) {
            closeAdd();
            setAddUser(null);
            setAddComment('');
            setAddMode(null);
          }
        }}
      >
        <ModalBackdrop>
          <ModalContainer size="md">
            <ModalDialog>
              {({ close }) => (
                <>
                  <ModalHeader>
                    <ModalHeading>
                      {addMode === 'introducer' ? t('addModal.title.introducer') : t('addModal.title.introduction')}
                    </ModalHeading>
                  </ModalHeader>
                  <ModalBody className="flex flex-col gap-4">
                    <UserSearch label={t('addModal.userLabel')} onSelectionChange={setAddUser} />
                    {addMode === 'introduction' && (
                      <TextField value={addComment} onChange={setAddComment}>
                        <Label>{t('addModal.commentLabel')}</Label>
                        <TextArea />
                      </TextField>
                    )}
                  </ModalBody>
                  <ModalFooter>
                    <Button variant="ghost" onPress={close} isDisabled={isMutating}>
                      {t('addModal.cancel')}
                    </Button>
                    <Button
                      variant="primary"
                      onPress={handleAddSubmit}
                      isDisabled={!addUser}
                      isPending={isMutating}
                      data-cy="people-add-submit"
                    >
                      {t('addModal.submit')}
                    </Button>
                  </ModalFooter>
                </>
              )}
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </Modal>

      <Modal
        isOpen={isRevokeOpen}
        onOpenChange={(o) => {
          if (!o) {
            closeRevoke();
            setRevokeContext(null);
            setRevokeComment('');
          }
        }}
      >
        <ModalBackdrop>
          <ModalContainer size="md">
            <ModalDialog>
              {({ close }) => (
                <>
                  <ModalHeader>
                    <ModalHeading>{t('commentModal.title')}</ModalHeading>
                  </ModalHeader>
                  <ModalBody>
                    <Form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleRevokeSubmit();
                      }}
                    >
                      <TextField value={revokeComment} onChange={setRevokeComment} className="w-full">
                        <Label>{t('commentModal.title')}</Label>
                        <TextArea />
                      </TextField>
                      <button type="submit" hidden />
                    </Form>
                  </ModalBody>
                  <ModalFooter>
                    <Button variant="ghost" onPress={close} isDisabled={isMutating}>
                      {t('commentModal.cancel')}
                    </Button>
                    <Button
                      variant="primary"
                      onPress={handleRevokeSubmit}
                      isPending={isMutating}
                      data-cy="people-revoke-submit"
                    >
                      {t('commentModal.submit')}
                    </Button>
                  </ModalFooter>
                </>
              )}
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </Modal>

      {historyUserId !== null && (
        <HistoryModalLoader
          resourceId={resourceId}
          userId={historyUserId}
          isOpen={isHistoryOpen}
          onClose={() => {
            closeHistory();
            setHistoryUserId(null);
          }}
        />
      )}
    </Card>
  );
}

interface HistoryLoaderProps {
  resourceId: number;
  userId: number;
  isOpen: boolean;
  onClose: () => void;
}

function HistoryModalLoader(props: Readonly<HistoryLoaderProps>) {
  const { resourceId, userId, isOpen, onClose } = props;
  const { data: history, isLoading } = useAccessControlServiceResourceIntroductionsGetHistory(
    { resourceId, userId },
    undefined,
    { enabled: isOpen && !!userId },
  );

  return <IntroductionHistoryModal isOpen={isOpen} onClose={onClose} history={history ?? []} isLoading={isLoading} />;
}
