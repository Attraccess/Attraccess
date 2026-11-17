import { useMemo } from 'react';
import { Chip, Separator } from '@heroui/react';
import { useRbacCatalogTranslations } from '../../hooks/useRbacCatalogTranslations';
import { CATEGORY_ORDER } from '../permissionPicker/groupPermissionsByCategory';

export interface PermissionListItem {
  key: string;
  label?: string | null;
  description?: string | null;
  category?: string | null;
}

interface PermissionChipGroupsProps {
  permissions: PermissionListItem[];
  /** Heading for permissions without a category. */
  uncategorizedLabel: string;
}

/**
 * Read-only list of permissions as translated chips, grouped by category in the app's usual category order. The
 * description is the chip's tooltip.
 */
export function PermissionChipGroups({ permissions, uncategorizedLabel }: PermissionChipGroupsProps) {
  const { permissionLabel, permissionDescription, permissionCategory } = useRbacCatalogTranslations();

  const groups = useMemo(() => {
    const byCategory = new Map<string, PermissionListItem[]>();
    for (const permission of permissions) {
      const category = permission.category || '';
      byCategory.set(category, [...(byCategory.get(category) ?? []), permission]);
    }
    const rank = (category: string) => {
      const index = CATEGORY_ORDER.indexOf(category);
      return index === -1 ? CATEGORY_ORDER.length + (category ? 0 : 1) : index;
    };
    return [...byCategory.entries()].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
  }, [permissions]);

  return (
    <div className="flex flex-col gap-3">
      {groups.map(([category, items], index) => (
        <div key={category} className="flex flex-col gap-1.5" data-cy="permission-chip-group">
          <p className="text-xs font-semibold uppercase tracking-wide text-default-500">
            {category ? permissionCategory(category) : uncategorizedLabel}
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
