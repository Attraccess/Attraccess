import React, { useMemo, useState } from 'react';
import { PageHeader, PageAction } from '../../components/pageHeader';
import { useDebounce, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  Button,
  Chip,
  TextField,
  InputGroup,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableScrollContainer,
  TableRow,
} from '@heroui/react';
import { SearchIcon, UserPlusIcon, TicketIcon } from 'lucide-react';
import { TableToolbar } from '../../components/TableToolbar';
import { GuestDto, useGuestsServiceFindManyGuests } from '@attraccess/react-query-client';
import { EmptyState } from '../../components/emptyState';
import { useNavigate } from 'react-router-dom';
import { SimplePagination } from '../../components/simplePagination';
import { TableDataLoadingIndicator } from '../../components/tableComponents';

import en from './en.json';
import de from './de.json';
import { CreateGuestModal } from './create-guest-modal';

export const GuestManagementPage: React.FC = () => {
  const { t } = useTranslations({ en, de });

  const [limit] = useState(10);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const debouncedSearch = useDebounce(search, 500);
  const navigate = useNavigate();

  const { data: searchResult, isFetched, isLoading, isError } = useGuestsServiceFindManyGuests({
    limit,
    page,
    search: debouncedSearch,
  });

  const totalPages = useMemo(() => {
    if (!searchResult?.total) {
      return 1;
    }
    return Math.ceil(searchResult.total / limit);
  }, [searchResult?.total, limit]);

  return (
    <div data-cy="guest-management-page">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        backTo="/"
        icon={<TicketIcon className="w-6 h-6" />}
        data-cy="guest-management-page-header"
        actions={
          [
            {
              key: 'add-guest',
              label: t('actions.addGuest'),
              icon: <UserPlusIcon className="w-4 h-4" />,
              variant: 'primary',
              renderTrigger: (triggerProps) => (
                <CreateGuestModal>{(onOpen) => <Button {...triggerProps} onPress={onOpen} />}</CreateGuestModal>
              ),
            },
          ] satisfies PageAction[]
        }
      />

      <div className="mt-6">
        <TableToolbar
          search={
            <TextField value={search} onChange={setSearch} aria-label={t('table.inputs.search')}>
              <InputGroup>
                <InputGroup.Prefix>
                  <SearchIcon size={16} />
                </InputGroup.Prefix>
                <InputGroup.Input placeholder={t('table.inputs.search')} data-cy="guest-management-search-input" />
              </InputGroup>
            </TextField>
          }
        />

        {isLoading ? (
          <TableDataLoadingIndicator />
        ) : isError ? (
          <p className="text-sm text-danger p-4" data-cy="guest-management-error">
            {t('table.loadError')}
          </p>
        ) : (
          <Table>
            <TableScrollContainer>
              <TableContent aria-label={t('table.ariaLabel')}>
                <TableHeader>
                  <TableColumn width="0">{t('table.columns.id')}</TableColumn>
                  <TableColumn isRowHeader>{t('table.columns.name')}</TableColumn>
                  <TableColumn width="0">{t('table.columns.guestCode')}</TableColumn>
                  <TableColumn className="hidden md:table-cell">{t('table.columns.email')}</TableColumn>
                  <TableColumn width="0">{t('table.columns.status')}</TableColumn>
                  <TableColumn width="0" className="hidden md:table-cell">
                    {t('table.columns.credential')}
                  </TableColumn>
                </TableHeader>

                <TableBody items={(searchResult?.data ?? []) as GuestDto[]} renderEmptyState={() => <EmptyState />}>
                  {(guest) => (
                    <TableRow
                      key={guest.id}
                      id={guest.id}
                      className="cursor-pointer hover:bg-primary-50 transition-bg duration-300"
                      onAction={() => navigate(`/guests/${guest.id}`)}
                    >
                      <TableCell>{guest.id}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{guest.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="text-sm">{guest.guestCode ?? '-'}</code>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{guest.email ?? t('table.noEmail')}</TableCell>
                      <TableCell>
                        {guest.guestEnabled ? (
                          <Chip size="sm" color="success" variant="soft" data-cy={`guest-status-chip-${guest.id}`}>
                            {t('table.status.enabled')}
                          </Chip>
                        ) : (
                          <Chip size="sm" color="danger" variant="soft" data-cy={`guest-status-chip-${guest.id}`}>
                            {t('table.status.disabled')}
                          </Chip>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {guest.hasCredential ? (
                          <Chip size="sm" color="accent" variant="secondary">
                            {t('table.credential.enrolled')}
                          </Chip>
                        ) : (
                          <Chip size="sm" color="default" variant="primary">
                            {t('table.credential.notEnrolled')}
                          </Chip>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </TableContent>
            </TableScrollContainer>
          </Table>
        )}

        <div className="flex w-full justify-end mt-4">
          {isFetched && (
            <SimplePagination showControls page={page} total={totalPages} onChange={(page) => setPage(page)} />
          )}
        </div>
      </div>
    </div>
  );
};
