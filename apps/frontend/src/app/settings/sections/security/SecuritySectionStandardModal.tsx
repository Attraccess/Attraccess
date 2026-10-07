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
import { Button } from '../../../../components/button';
import { StandardModal } from '../../../../components/standardModal';
import { useSecuritySectionState } from './useSecuritySectionState';
type Props = Pick<
  ReturnType<typeof useSecuritySectionState>,
  'isConfirmOpen' | 'setIsConfirmOpen' | 't' | 'policyDiff' | 'isSaving' | 'commit'
>;
export function SecuritySectionStandardModal({
  isConfirmOpen,
  setIsConfirmOpen,
  t,
  policyDiff,
  isSaving,
  commit,
}: Props) {
  return (
    <StandardModal isOpen={isConfirmOpen} onOpenChange={(open) => !open && setIsConfirmOpen(false)} size="lg">
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
            <Button variant="primary" onPress={commit} isPending={isSaving} data-testid="policy-diff-confirm">
              {t('diff.confirm')}
            </Button>
          </ModalFooter>
        </>
      )}
    </StandardModal>
  );
}
