import { DateTimeDisplay, useTranslations } from '@attraccess/plugins-frontend-ui';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/modal';
import { Button, Pagination, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from '@heroui/react';
import { useMemo, useState } from 'react';
import { TableDataLoadingIndicator } from '../../../components/tableComponents';
import { EmptyState } from '../../../components/emptyState';
import { IntroductionStatusChip } from '../../IntroductionStatusChip';
import { ResourceIntroductionHistoryItem } from '@attraccess/react-query-client';

import * as en from './en.json';
import * as de from './de.json';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  isLoading: boolean;
  history: ResourceIntroductionHistoryItem[];
}
export function IntroductionHistoryModal(props: Readonly<Props>) {
  const { isOpen, history, isLoading, onClose } = props;

  const { t } = useTranslations('introductionHistoryModal', { en, de });

  const orderedHistory = useMemo(() => {
    return [...history].sort((a, b) => {
      const dateA = new Date(a.createdAt);
      const dateB = new Date(b.createdAt);
      return dateB.getTime() - dateA.getTime(); // descending order (newest first)
    });
  }, [history]);

  const rowsPerPage = 10;
  const [page, setPage] = useState(1);

  const totalPages = useMemo(() => {
    return Math.ceil(orderedHistory.length / rowsPerPage) || 1;
  }, [rowsPerPage, orderedHistory]);

  const currentPage = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    const end = start + rowsPerPage;

    return orderedHistory.slice(start, end);
  }, [orderedHistory, page, rowsPerPage]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} scrollBehavior="inside">
      <ModalContent>
        <ModalHeader>{t('modal.title')}</ModalHeader>
        <ModalBody>
          <Table
            bottomContent={
              <div className="flex w-full justify-center">
                <Pagination isCompact showControls page={page} total={totalPages} onChange={(page) => setPage(page)} />
              </div>
            }
          >
            <TableHeader>
              <TableColumn>{t('table.columns.date')}</TableColumn>
              <TableColumn>{t('table.columns.action')}</TableColumn>
              <TableColumn>{t('table.columns.comment')}</TableColumn>
            </TableHeader>
            <TableBody
              items={currentPage}
              loadingState={isLoading ? 'loading' : 'idle'}
              loadingContent={<TableDataLoadingIndicator />}
              emptyContent={<EmptyState />}
            >
              {(item) => (
                <TableRow key={item.id}>
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
          </Table>
        </ModalBody>
        <ModalFooter>
          <Button onPress={onClose}>{t('modal.closeButton')}</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
