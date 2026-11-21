import { EmptyState, TableActionsColumnHeader } from '@attraccess/plugins-frontend-ui';
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
} from '@heroui/react';
import type { Wall } from '../api';
import { useStatusWallTranslations } from '../i18n';
import { WallRowActions } from './WallRowActions';

interface Props {
  walls: Wall[];
  busyId: number | null;
  onShowLink: (wall: Wall) => void;
  onEdit: (wall: Wall) => void;
  onRegenerate: (wall: Wall) => Promise<unknown>;
  onDelete: (wall: Wall) => Promise<unknown>;
}

export function WallsTable({ walls, busyId, onShowLink, onEdit, onRegenerate, onDelete }: Readonly<Props>) {
  const { t, language } = useStatusWallTranslations();

  const describe = ({ selection }: Wall) => {
    if (selection.all) return t('selection.all');
    const parts: string[] = [];
    if (selection.groupIds.length) parts.push(t('selection.groups', { count: selection.groupIds.length }));
    if (selection.resourceIds.length) parts.push(t('selection.resources', { count: selection.resourceIds.length }));
    return parts.join(', ');
  };

  return (
    <Table data-cy="status-wall-table">
      <TableScrollContainer>
        <TableContent aria-label={t('page.title')}>
          <TableHeader>
            <TableColumn isRowHeader>{t('table.name')}</TableColumn>
            <TableColumn>{t('table.shows')}</TableColumn>
            <TableColumn id="actions">
              <TableActionsColumnHeader />
            </TableColumn>
          </TableHeader>
          <TableBody
            items={walls}
            dependencies={[busyId, language]}
            renderEmptyState={() => <EmptyState message={t('page.empty')} />}
          >
            {(wall) => (
              <TableRow key={wall.id} id={wall.id} data-cy={`status-wall-row-${wall.id}`}>
                <TableCell className="sw:font-medium">{wall.name}</TableCell>
                <TableCell className="sw:text-muted">{describe(wall)}</TableCell>
                <TableCell>
                  <WallRowActions
                    wall={wall}
                    isBusy={busyId === wall.id}
                    onShowLink={() => onShowLink(wall)}
                    onEdit={() => onEdit(wall)}
                    onRegenerate={() => onRegenerate(wall)}
                    onDelete={() => onDelete(wall)}
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </TableContent>
      </TableScrollContainer>
    </Table>
  );
}
