import { DrawerBody, DrawerFooter, DrawerHeader, Label, TextArea, TextField } from '@heroui/react';
import { useState } from 'react';
import { Button } from '../../../components/button';
import { TFunction, UserSearch } from '@attraccess/plugins-frontend-ui';
import { User } from '@attraccess/react-query-client';
import { StandardDrawer } from '../../../components/standardDrawer';
import { AddMode } from './types';

interface AddPersonModalProps {
  t: TFunction;
  isOpen: boolean;
  mode: AddMode | null;
  comment: string;
  isPending: boolean;
  onCommentChange: (comment: string) => void;
  onAdd: (user: User) => void;
  onClose: () => void;
}

export function AddPersonModal(props: Readonly<AddPersonModalProps>) {
  const { t, isOpen, mode, comment, isPending, onCommentChange, onAdd, onClose } = props;

  const [searchResetKey, setSearchResetKey] = useState(0);

  const handleSelectionChange = (user: User | null) => {
    if (!user) return;
    onAdd(user);
    setSearchResetKey((key) => key + 1);
  };

  return (
    <StandardDrawer
      isOpen={isOpen}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DrawerHeader>
        <h2 className="text-lg font-semibold">
          {mode === 'introducer' ? t('addModal.title.introducer') : t('addModal.title.introduction')}
        </h2>
      </DrawerHeader>
      <DrawerBody className="flex flex-col gap-4">
        {mode === 'introduction' && (
          <TextField value={comment} onChange={onCommentChange}>
            <Label>{t('addModal.commentLabel')}</Label>
            <TextArea />
          </TextField>
        )}
        <UserSearch key={searchResetKey} label={t('addModal.userLabel')} onSelectionChange={handleSelectionChange} />
        <p className="text-sm text-foreground-500">{t('addModal.hint')}</p>
      </DrawerBody>
      <DrawerFooter>
        <Button variant="primary" onPress={onClose} isDisabled={isPending} data-cy="people-add-done">
          {t('addModal.done')}
        </Button>
      </DrawerFooter>
    </StandardDrawer>
  );
}
