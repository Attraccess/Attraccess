import { Button } from '@heroui/react';
import { ChevronRight } from 'lucide-react';
import { ResourceImage } from './ResourceImage';
import { StatusChip } from '../app/resourceOverview/resourceGroupCard/statusChip';

interface ResourceListItemProps {
  resource: { id: number; name: string; description?: string; imageFilename?: string | null };
  onPress: () => void;
}

export function ResourceListItem({ resource, onPress }: ResourceListItemProps) {
  return (
    <Button
      variant="ghost"
      className="w-full h-auto justify-start p-4 gap-4"
      onPress={onPress}
    >
      <ResourceImage
        imageFilename={resource.imageFilename}
        name={resource.name}
        className="w-12 h-12 rounded-lg shrink-0"
      />
      <div className="flex-1 min-w-0 text-left">
        <p className="font-semibold truncate">{resource.name}</p>
        {resource.description && (
          <p className="text-sm text-default-500 truncate">{resource.description}</p>
        )}
      </div>
      <StatusChip resourceId={resource.id} />
      <ChevronRight className="w-4 h-4 text-default-400 shrink-0" />
    </Button>
  );
}
