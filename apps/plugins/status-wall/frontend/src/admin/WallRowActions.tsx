import { TableRowActions } from '@attraccess/plugins-frontend-ui';
import { ExternalLinkIcon, LinkIcon, PencilIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { wallLink, type Wall } from '../api';
import { useStatusWallTranslations } from '../i18n';

interface Props {
  wall: Wall;
  isBusy: boolean;
  onShowLink: () => void;
  onEdit: () => void;
  onRegenerate: () => Promise<unknown>;
  onDelete: () => Promise<unknown>;
}

export function WallRowActions({ wall, isBusy, onShowLink, onEdit, onRegenerate, onDelete }: Readonly<Props>) {
  const { t } = useStatusWallTranslations();
  return (
    <TableRowActions
      itemName={wall.name}
      isPending={isBusy}
      data-cy={`status-wall-menu-${wall.id}`}
      actions={[
        {
          key: 'open',
          label: t('actions.open'),
          icon: ExternalLinkIcon,
          onPress: () => window.open(wallLink(wall.token), '_blank', 'noopener'),
        },
        { key: 'link', label: t('actions.link'), icon: LinkIcon, onPress: onShowLink },
        { key: 'edit', label: t('actions.edit'), icon: PencilIcon, onPress: onEdit },
        {
          key: 'regenerate',
          label: t('actions.regenerate'),
          icon: RefreshCwIcon,
          onPress: onRegenerate,
          confirm: {
            status: 'warning',
            title: t('regenerate.title', { name: wall.name }),
            message: t('regenerate.body'),
            confirmLabel: t('regenerate.confirm'),
          },
        },
        {
          key: 'delete',
          label: t('actions.delete'),
          icon: Trash2Icon,
          tone: 'danger',
          onPress: onDelete,
          confirm: {
            title: t('delete.title', { name: wall.name }),
            message: t('delete.body'),
            confirmLabel: t('delete.confirm'),
            confirmDataCy: `status-wall-delete-confirm-${wall.id}`,
          },
        },
      ]}
    />
  );
}
