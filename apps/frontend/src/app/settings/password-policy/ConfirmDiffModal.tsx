import {
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
} from '@heroui/react';
import { Button } from '../../../components/button';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

interface DiffRow {
  field: string;
  before: string;
  after: string;
}

interface Props {
  isOpen: boolean;
  diff: DiffRow[];
  isConfirming?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function ConfirmDiffModal({ isOpen, diff, isConfirming, onClose, onConfirm }: Props) {
  const { t } = useTranslations({ en, de });
  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <ModalBackdrop>
        <ModalContainer size="lg">
          <ModalDialog>
            <ModalHeader className="flex flex-col gap-1">
              <span>{t('diff.title')}</span>
              <span className="text-sm font-normal text-default-500">{t('diff.subtitle')}</span>
            </ModalHeader>
            <ModalBody>
              {diff.length === 0 ? (
                <p className="text-sm text-default-500">{t('diff.noChanges')}</p>
              ) : (
                <Table aria-label="changes" data-testid="policy-diff-table">
                  <TableScrollContainer>
                    <TableContent>
                      <TableHeader>
                        <TableColumn isRowHeader>{t('diff.field')}</TableColumn>
                        <TableColumn>{t('diff.before')}</TableColumn>
                        <TableColumn>{t('diff.after')}</TableColumn>
                      </TableHeader>
                      <TableBody>
                        {diff.map((row) => (
                          <TableRow key={row.field}>
                            <TableCell className="font-medium">{row.field}</TableCell>
                            <TableCell>
                              <code>{row.before}</code>
                            </TableCell>
                            <TableCell>
                              <code className="text-success-600">{row.after}</code>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </TableContent>
                  </TableScrollContainer>
                </Table>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" onPress={onClose} isDisabled={isConfirming}>
                {t('diff.cancel')}
              </Button>
              <Button
                variant="primary"
                onPress={onConfirm}
                isPending={isConfirming}
                isDisabled={diff.length === 0}
                data-testid="policy-diff-confirm"
              >
                {t('diff.confirm')}
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}
