import { Button } from '@heroui/react';

export interface ServerListItemProps {
  id: string;
  name: string;
  host: string;
  port: number;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function ServerListItem({ id, name, host, port, onEdit, onDelete }: ServerListItemProps) {
  return (
    <div className="border rounded-md p-4 flex justify-between items-center">
      <div>
        <h3 className="font-medium">{name}</h3>
        <p className="text-sm text-gray-500">
          {host}:{port}
        </p>
      </div>
      <div className="space-x-2">
        <Button variant="secondary" onPress={() => onEdit(id)}>
          Edit
        </Button>
        <Button variant="danger-soft" onPress={() => onDelete(id)}>
          Delete
        </Button>
      </div>
    </div>
  );
}
