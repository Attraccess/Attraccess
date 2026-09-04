import { Alert, Button, DrawerBody, DrawerFooter, DrawerHeader } from '@heroui/react';
import type { WagoController } from './api';
import { StandardDrawer } from './drawer';
import { useRemoveControllerMutation } from './queries';

export function RemoveControllerDrawer({
  controller,
  onOpenChange,
}: {
  controller: WagoController | null;
  onOpenChange: (open: boolean) => void;
}) {
  const removeMutation = useRemoveControllerMutation();
  const close = () => onOpenChange(false);

  return (
    <StandardDrawer isOpen={controller !== null} onOpenChange={onOpenChange}>
      <DrawerHeader><h2 className="wg:text-xl wg:font-semibold">Remove controller</h2></DrawerHeader>
      <DrawerBody>
        <div className="wg:space-y-4">
          <p>Remove <strong>{controller?.name ?? controller?.hardwareId}</strong> from Attraccess?</p>
          <Alert status="warning"><Alert.Indicator /><Alert.Content><Alert.Description>This revokes the controller&apos;s MQTT access and permanently deletes its local configuration, enrollment, commissioning history, and controller record. The runtime remains installed on the CC100.</Alert.Description></Alert.Content></Alert>
          {removeMutation.isError && <Alert status="danger"><Alert.Indicator /><Alert.Content><Alert.Description>{removeMutation.error instanceof Error ? removeMutation.error.message : 'Could not remove the controller.'}</Alert.Description></Alert.Content></Alert>}
        </div>
      </DrawerBody>
      <DrawerFooter>
        <Button variant="secondary" onPress={close}>Keep controller</Button>
        <Button color="danger" isPending={removeMutation.isPending} onPress={() => controller && removeMutation.mutate(controller.id, { onSuccess: close })}>Remove controller</Button>
      </DrawerFooter>
    </StandardDrawer>
  );
}
