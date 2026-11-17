import { useMemo } from 'react';
import { Chip, Separator } from '@heroui/react';
import { type PermissionLike, useRbacCatalogTranslations } from '../../hooks/useRbacCatalogTranslations';
import { groupPermissionsByCategory } from '../permissionPicker/groupPermissionsByCategory';

export interface PermissionListItem extends PermissionLike {
  category?: string | null;
}

interface PermissionChipGroupsProps {
  permissions: PermissionListItem[];
  /** Heading for permissions without a category. */
  uncategorizedLabel: string;
}

/**
 * Read-only list of permissions as translated chips, grouped by category in the app's usual category order: core
 * categories, then plugin categories by plugin name, then the uncategorized ones. The description is the chip's tooltip.
 */
export function PermissionChipGroups({ permissions, uncategorizedLabel }: PermissionChipGroupsProps) {
  const { permissionLabel, permissionDescription, permissionCategory } = useRbacCatalogTranslations();

  const groups = useMemo(() => {
    const grouped = groupPermissionsByCategory(
      permissions.map((permission) => ({ ...permission, category: permission.category || '' })),
    );
    return [...grouped.filter(({ category }) => category), ...grouped.filter(({ category }) => !category)];
  }, [permissions]);

  return (
    <div className="flex flex-col gap-3">
      {groups.map(({ category, permissions: items }, index) => (
        <div key={category} className="flex flex-col gap-1.5" data-cy="permission-chip-group">
          <p className="text-xs font-semibold uppercase tracking-wide text-default-500">
            {category ? permissionCategory(category, items[0]) : uncategorizedLabel}
          </p>
          <div className="flex flex-wrap gap-1">
            {items.map((permission) => (
              <Chip
                key={permission.key}
                size="sm"
                color="accent"
                variant="secondary"
                title={permissionDescription(permission) || undefined}
              >
                {permissionLabel(permission)}
              </Chip>
            ))}
          </div>
          {index < groups.length - 1 ? <Separator className="mt-1" /> : null}
        </div>
      ))}
    </div>
  );
}
