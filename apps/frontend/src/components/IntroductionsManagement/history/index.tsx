import { DateTimeDisplay, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  Button,
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
  TableScrollContainer,
  TableRow,
} from '@heroui/react';
import { useMemo, useState } from 'react';
import { EmptyState } from '../../../components/emptyState';
import { IntroductionStatusChip } from '../../IntroductionStatusChip';
import { ResourceIntroductionHistoryItem } from '@attraccess/react-query-client';

import en from './en.json';
import de from './de.json';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  isLoading: boolean;
  history: ResourceIntroductionHistoryItem[];
}
export function IntroductionHistoryModal(props: Readonly<Props>) {
  const { isOpen, history, onClose } = props;

  const { t } = useTranslations({ en, de });

  const orderedHistory = useMemo(() => {
    return [...history].sort((a, b) => {
      const dateA = new Date(a.createdAt);
      const dateB = new Date(b.createdAt);
      return dateB.getTime() - dateA.getTime(); // descending order (newest first)
    });
  }, [history]);

  const rowsPerPage = 10;
  const [page] = useState(1);

  const currentPage = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    const end = start + rowsPerPage;

    return orderedHistory.slice(start, end);
  }, [orderedHistory, page, rowsPerPage]);

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <ModalBackdrop>
        <ModalContainer size="lg">
          <ModalDialog>
            {({ close }) => (
              <>
                <ModalHeader>{t('modal.title')}</ModalHeader>
                <ModalBody>
                  <Table>
                    <TableScrollContainer>
                      <TableContent aria-label={t('table.ariaLabel')}>
                        <TableHeader>
                          <TableColumn isRowHeader>{t('table.columns.date')}</TableColumn>
                          <TableColumn>{t('table.columns.action')}</TableColumn>
                          <TableColumn>{t('table.columns.comment')}</TableColumn>
                        </TableHeader>
                        <TableBody items={currentPage} renderEmptyState={() => <EmptyState />}>
                          {(item) => (
                            <TableRow key={item.id} id={item.id}>
                              <TableCell>
                                <DateTimeDisplay date={item.createdAt} />
                              </TableCell>
                              <TableCell>
                                <IntroductionStatusChip isValid={item.action === 'grant'} />
                              </TableCell>
                              <TableCell>
                                <blockquote className="text-sm whitespace-pre-wrap">{item.comment}</blockquote>
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </TableContent>
                    </TableScrollContainer>
                  </Table>
                </ModalBody>
                <ModalFooter>
                  <Button onPress={close}>{t('modal.closeButton')}</Button>
                </ModalFooter>
              </>
            )}
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}
