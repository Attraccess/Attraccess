import {
  ModalBody,
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
  TableScrollContainer,
} from '@heroui/react';
import { Button, StandardModal, useTranslations } from '@attraccess/plugins-frontend-ui';
import en from '../en.json';
import de from '../de.json';

export interface PolicyDiffRow {
  field: string;
  label: string;
  before: string;
  after: string;
}

interface PolicyDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  policyDiff: PolicyDiffRow[];
  isSaving: boolean;
  onConfirm: () => void;
}

export function PolicyDiffModal({ isOpen, onClose, policyDiff, isSaving, onConfirm }: PolicyDiffModalProps) {
  const { t } = useTranslations({ en, de });
  return (
    <StandardModal isOpen={isOpen} onOpenChange={(open) => !open && onClose()} size="lg">
      {({ close }) => (
        <>
          <ModalHeader className="flex flex-col gap-1">
            <ModalHeading>{t('diff.title')}</ModalHeading>
            <span className="text-sm font-normal text-muted">{t('diff.subtitle')}</span>
          </ModalHeader>
          <ModalBody>
            <Table data-testid="policy-diff-table">
              <TableScrollContainer>
                <TableContent aria-label={t('diff.title')}>
                  <TableHeader>
                    <TableColumn isRowHeader>{t('diff.field')}</TableColumn>
                    <TableColumn>{t('diff.before')}</TableColumn>
                    <TableColumn>{t('diff.after')}</TableColumn>
                  </TableHeader>
                  <TableBody>
                    {policyDiff.map((row) => (
                      <TableRow key={row.field} id={row.field}>
                        <TableCell className="font-medium">{row.label}</TableCell>
                        <TableCell>
                          <code className="text-muted">{row.before}</code>
                        </TableCell>
                        <TableCell>
                          <code className="text-foreground">{row.after}</code>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </TableContent>
              </TableScrollContainer>
            </Table>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onPress={close} isDisabled={isSaving}>
              {t('diff.cancel')}
            </Button>
            <Button variant="primary" onPress={onConfirm} isPending={isSaving} data-testid="policy-diff-confirm">
              {t('diff.confirm')}
            </Button>
          </ModalFooter>
        </>
      )}
    </StandardModal>
  );
}
