import { DrawerBody, DrawerFooter, DrawerHeader, DrawerHeading, Label, TextArea, TextField } from '@heroui/react';
import { useCallback, useState } from 'react';
import { Button, StandardDrawer, TFunction, UserIdentity, UserSearch } from '@attraccess/plugins-frontend-ui';
import { IntroductionTabs } from './IntroductionTabs';
import { AddMode, PeopleTarget } from './types';

interface AddPersonDrawerProps {
  t: TFunction;
  target: PeopleTarget;
  isOpen: boolean;
  mode: AddMode | null;
  comment: string;
  isPending: boolean;
  onCommentChange: (comment: string) => void;
  onAdd: (user: UserIdentity) => Promise<void>;
  onClose: () => void;
}

export function AddPersonDrawer(props: Readonly<AddPersonDrawerProps>) {
  const { t, target, isOpen, mode, comment, isPending, onCommentChange, onAdd, onClose } = props;

  const [selectedUser, setSelectedUser] = useState<UserIdentity | null>(null);
  const [isMassIntroductionRunning, setIsMassIntroductionRunning] = useState(false);

  const handleClose = useCallback(() => {
    setSelectedUser(null);
    setIsMassIntroductionRunning(false);
    onClose();
  }, [onClose]);

  const handleConfirm = useCallback(async () => {
    if (!selectedUser) return;
    try {
      await onAdd(selectedUser);
    } catch {
      // Mutation failed; error toast is shown by usePeopleMutations. Keep the drawer open.
      return;
    }
    handleClose();
  }, [selectedUser, onAdd, handleClose]);

  const fields = (
    <>
      {mode === 'introduction' && (
        <TextField value={comment} onChange={onCommentChange}>
          <Label>{t('addModal.commentLabel')}</Label>
          <TextArea />
        </TextField>
      )}
      <UserSearch resetSignal={isOpen} label={t('addModal.userLabel')} onSelectionChange={setSelectedUser} />
    </>
  );

  const actions = (
    <>
      <Button variant="ghost" onPress={handleClose} isDisabled={isPending} data-cy="people-add-cancel">
        {t('addModal.cancel')}
      </Button>
      <Button
        variant="primary"
        onPress={handleConfirm}
        isDisabled={!selectedUser}
        isPending={isPending}
        data-cy="people-add-confirm"
      >
        {t('addModal.submit')}
      </Button>
    </>
  );

  return (
    <StandardDrawer
      isOpen={isOpen}
      onOpenChange={(o) => {
        if (!o) handleClose();
      }}
      // A stray click next to the drawer must not end a running mass introduction.
      backdropProps={{ isDismissable: !isMassIntroductionRunning }}
    >
      <DrawerHeader>
        <DrawerHeading className="text-lg font-semibold">
          {mode === 'introducer'
            ? t('addModal.title.introducer')
            : mode === 'maintainer'
              ? t('addModal.title.maintainer')
              : t('addModal.title.introduction')}
        </DrawerHeading>
      </DrawerHeader>
      {mode === 'introduction' ? (
        <IntroductionTabs
          t={t}
          target={target}
          individualFields={fields}
          individualActions={actions}
          onClose={handleClose}
          onMassIntroductionRunningChange={setIsMassIntroductionRunning}
        />
      ) : (
        <>
          <DrawerBody className="flex flex-col gap-4">{fields}</DrawerBody>
          <DrawerFooter>{actions}</DrawerFooter>
        </>
      )}
    </StandardDrawer>
  );
}
