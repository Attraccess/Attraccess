import { Button } from '@heroui/react';
import { ChevronRight } from 'lucide-react';
import { ResourceImage } from './ResourceImage';
import { StatusChip } from '../app/resourceOverview/resourceGroupCard/statusChip';
import { PluginSlot } from '../app/plugins/PluginSlot';
import { RESOURCE_LIST_ROW_SLOT, ResourceSlotContext } from '@attraccess/plugins-frontend-sdk';

interface ResourceListItemProps {
  resource: { id: number; name: string; description?: string; imageFilename?: string | null };
  onPress: () => void;
}

export function ResourceListItem({ resource, onPress }: ResourceListItemProps) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Button
        variant="ghost"
        className="flex-1 min-w-0 h-auto justify-start p-3 gap-3 flex-wrap sm:flex-nowrap"
        onPress={onPress}
      >
        <ResourceImage
          imageFilename={resource.imageFilename}
          name={resource.name}
          className="w-12 h-12 rounded-lg shrink-0 border border-separator"
        />
        <div className="flex-1 min-w-24 text-left">
          <p className="font-semibold truncate">{resource.name}</p>
          {resource.description && <p className="text-sm text-muted truncate">{resource.description}</p>}
        </div>
        <StatusChip resourceId={resource.id} />
        <ChevronRight className="w-4 h-4 text-accent shrink-0" />
      </Button>
      <PluginSlot<ResourceSlotContext> slotId={RESOURCE_LIST_ROW_SLOT} context={{ resourceId: resource.id }} />
    </div>
  );
}
