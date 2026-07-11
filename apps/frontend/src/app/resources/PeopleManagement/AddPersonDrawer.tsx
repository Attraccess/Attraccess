import { DrawerBody, DrawerFooter, DrawerHeader, Label, TextArea, TextField } from '@heroui/react';
import { useCallback, useState } from 'react';
import { Button } from '../../../components/button';
import { TFunction, UserSearch } from '@attraccess/plugins-frontend-ui';
import { User } from '@attraccess/react-query-client';
import { StandardDrawer } from '../../../components/standardDrawer';
import { AddMode } from './types';

interface AddPersonDrawerProps {
  t: TFunction;
  isOpen: boolean;
  mode: AddMode | null;
  comment: string;
  isPending: boolean;
  onCommentChange: (comment: string) => void;
  onAdd: (user: User) => Promise<void>;
  onClose: () => void;
}

export function AddPersonDrawer(props: Readonly<AddPersonDrawerProps>) {
  const { t, isOpen, mode, comment, isPending, onCommentChange, onAdd, onClose } = props;

  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const handleClose = useCallback(() => {
    setSelectedUser(null);
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

  return (
    <StandardDrawer
      isOpen={isOpen}
      onOpenChange={(o) => {
        if (!o) handleClose();
      }}
    >
      <DrawerHeader>
        <h2 className="text-lg font-semibold">
          {mode === 'introducer'
            ? t('addModal.title.introducer')
            : mode === 'maintainer'
            ? t('addModal.title.maintainer')
            : t('addModal.title.introduction')}
        </h2>
      </DrawerHeader>
      <DrawerBody className="flex flex-col gap-4">
        {mode === 'introduction' && (
          <TextField value={comment} onChange={onCommentChange}>
            <Label>{t('addModal.commentLabel')}</Label>
            <TextArea />
          </TextField>
        )}
        <UserSearch label={t('addModal.userLabel')} onSelectionChange={setSelectedUser} />
      </DrawerBody>
      <DrawerFooter>
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
      </DrawerFooter>
    </StandardDrawer>
  );
}
