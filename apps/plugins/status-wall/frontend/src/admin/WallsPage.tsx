import { PageHeader, StatusAlert, StatusDialog, TableDataLoadingIndicator } from '@attraccess/plugins-frontend-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MonitorIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { deleteWall, listWalls, regenerateWallLink, type Wall } from '../api';
import { useStatusWallTranslations } from '../i18n';
import { WallFormModal } from './WallFormModal';
import { WallLinkDialog } from './WallLinkDialog';
import { WallsTable } from './WallsTable';

const WALLS_KEY = ['status-wall', 'walls'];

/** Management of status walls: what each one shows and the link a screen opens. */
export function WallsPage() {
  const { t } = useStatusWallTranslations();
  const queryClient = useQueryClient();
  const walls = useQuery({ queryKey: WALLS_KEY, queryFn: listWalls });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Wall | null>(null);
  const [linkWall, setLinkWall] = useState<Wall | null>(null);
  const [error, setError] = useState<string | null>(null);

  const action = useMutation({
    mutationFn: ({ kind, wall }: { kind: 'regenerate' | 'delete'; wall: Wall }) =>
      kind === 'regenerate' ? regenerateWallLink(wall.id) : deleteWall(wall.id),
    onSuccess: (result) => {
      if (result) setLinkWall(result);
      return queryClient.invalidateQueries({ queryKey: WALLS_KEY });
    },
    onError: (failure) => setError(failure instanceof Error ? failure.message : String(failure)),
  });
  // The error dialog reports a failure, so a confirmation closes either way.
  const run = (kind: 'regenerate' | 'delete', wall: Wall) => action.mutateAsync({ kind, wall }).catch(() => undefined);

  const openForm = (wall: Wall | null) => {
    setEditing(wall);
    setFormOpen(true);
  };

  return (
    <div className="sw:mx-auto sw:flex sw:w-full sw:max-w-5xl sw:flex-col sw:gap-6 sw:p-4 sw:md:p-6">
      <PageHeader
        noMargin
        icon={<MonitorIcon className="sw:h-6 sw:w-6 sw:text-accent-soft-foreground" />}
        title={t('page.title')}
        subtitle={t('page.description')}
        actions={[
          {
            key: 'create',
            label: t('page.create'),
            icon: <PlusIcon className="sw:h-4 sw:w-4" />,
            variant: 'primary',
            onPress: () => openForm(null),
            dataCy: 'status-wall-create',
          },
        ]}
      />

      {walls.error && (
        <StatusAlert status="danger" title={t('page.loadFailed')}>
          {walls.error.message}
        </StatusAlert>
      )}

      {walls.isPending ? (
        <TableDataLoadingIndicator />
      ) : (
        <WallsTable
          walls={walls.data ?? []}
          busyId={action.isPending ? (action.variables?.wall.id ?? null) : null}
          onShowLink={setLinkWall}
          onEdit={openForm}
          onRegenerate={(wall) => run('regenerate', wall)}
          onDelete={(wall) => run('delete', wall)}
        />
      )}

      <WallFormModal
        isOpen={formOpen}
        wall={editing}
        onOpenChange={setFormOpen}
        onSaved={(saved, created) => {
          if (created) setLinkWall(saved);
          void queryClient.invalidateQueries({ queryKey: WALLS_KEY });
        }}
      />
      <WallLinkDialog wall={linkWall} onClose={() => setLinkWall(null)} />
      <StatusDialog isOpen={error !== null} onClose={() => setError(null)} status="error" title={t('failed')}>
        {error ?? ''}
      </StatusDialog>
    </div>
  );
}
