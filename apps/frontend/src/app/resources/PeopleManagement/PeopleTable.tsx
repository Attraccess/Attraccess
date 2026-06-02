import {
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
} from '@heroui/react';
import { AwardIcon, CheckIcon, WrenchIcon } from 'lucide-react';
import { User } from '@attraccess/react-query-client';
import { AttraccessUser, DateTimeDisplay, TFunction } from '@attraccess/plugins-frontend-ui';
import { EmptyState } from '../../../components/emptyState';
import { PeopleRowActions } from './PeopleRowActions';
import { PersonRow } from './types';

interface PeopleTableProps {
  t: TFunction;
  rows: PersonRow[];
  isLoading: boolean;
  canManageIntroducers: boolean;
  canManageIntroductions: boolean;
  pendingIntroducerUserId: number | null;
  pendingIntroductionUserId: number | null;
  isRevokingIntroducer: boolean;
  isGrantingIntroduction: boolean;
  isRevokingIntroduction: boolean;
  onOpenHistory: (userId: number) => void;
  onToggleIntroduction: (user: User, action: 'grant' | 'revoke') => void;
  onRevokeIntroducer: (userId: number) => void;
}

export function PeopleTable(props: Readonly<PeopleTableProps>) {
  const {
    t,
    rows,
    isLoading,
    canManageIntroducers,
    canManageIntroductions,
    pendingIntroducerUserId,
    pendingIntroductionUserId,
    isRevokingIntroducer,
    isGrantingIntroduction,
    isRevokingIntroduction,
    onOpenHistory,
    onToggleIntroduction,
    onRevokeIntroducer,
  } = props;

  return (
    <Table>
      <TableContent aria-label={t('title')}>
        <TableHeader>
          <TableColumn isRowHeader>{t('columns.name')}</TableColumn>
          <TableColumn>{t('columns.role')}</TableColumn>
          <TableColumn>{t('columns.introduced')}</TableColumn>
          <TableColumn>{t('columns.actions')}</TableColumn>
        </TableHeader>
        <TableBody
          items={isLoading ? [] : rows}
          renderEmptyState={() =>
            isLoading ? (
              <div className="flex justify-center py-12">
                <Spinner data-cy="people-loading-spinner" />
              </div>
            ) : (
              <EmptyState message={t('emptyState')} />
            )
          }
        >
          {(row) => (
            <TableRow key={row.user.id} id={row.user.id}>
              <TableCell className="w-full">
                <AttraccessUser user={row.user} />
              </TableCell>
              <TableCell>
                {row.isIntroducer ? (
                  <span className="inline-flex items-center gap-1 text-success">
                    <AwardIcon className="w-4 h-4" />
                    {t('roles.introducer')}
                  </span>
                ) : row.isMaintainer ? (
                  <span className="inline-flex items-center gap-1 text-primary">
                    <WrenchIcon className="w-4 h-4" />
                    {t('roles.maintainer')}
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
                <PeopleRowActions
                  t={t}
                  row={row}
                  canManageIntroducers={canManageIntroducers}
                  canManageIntroductions={canManageIntroductions}
                  pendingIntroducerUserId={pendingIntroducerUserId}
                  pendingIntroductionUserId={pendingIntroductionUserId}
                  isRevokingIntroducer={isRevokingIntroducer}
                  isGrantingIntroduction={isGrantingIntroduction}
                  isRevokingIntroduction={isRevokingIntroduction}
                  onOpenHistory={onOpenHistory}
                  onToggleIntroduction={onToggleIntroduction}
                  onRevokeIntroducer={onRevokeIntroducer}
                />
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </TableContent>
    </Table>
  );
}
