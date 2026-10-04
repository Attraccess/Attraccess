import { Alert, Button, DrawerBody, DrawerFooter, DrawerHeader, DrawerHeading } from '@heroui/react';
import type { WagoController } from './api';
import { StandardDrawer } from './drawer';
import { useRemoveControllerMutation } from './queries';
import { useWagoTranslations } from './i18n';

export function RemoveControllerDrawer({
  controller,
  onOpenChange,
}: {
  controller: WagoController | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useWagoTranslations();
  const removeMutation = useRemoveControllerMutation();
  const close = () => onOpenChange(false);

  return (
    <StandardDrawer ariaLabel={t('remove.title')} isOpen={controller !== null} onOpenChange={onOpenChange}>
      <DrawerHeader>
        <DrawerHeading className="wg:text-xl wg:font-semibold">{t('remove.title')}</DrawerHeading>
      </DrawerHeader>
      <DrawerBody>
        <div className="wg:space-y-4">
          <p>{t('remove.question', { name: controller?.name ?? controller?.hardwareId })}</p>
          <Alert status="warning">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{t('remove.description')}</Alert.Description>
            </Alert.Content>
          </Alert>
          {removeMutation.isError && (
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>
                  {removeMutation.error instanceof Error ? removeMutation.error.message : t('remove.error')}
                </Alert.Description>
              </Alert.Content>
            </Alert>
          )}
        </div>
      </DrawerBody>
      <DrawerFooter>
        <Button variant="secondary" onPress={close}>
          {t('remove.keep')}
        </Button>
        <Button
          variant="danger"
          isPending={removeMutation.isPending}
          onPress={() => controller && removeMutation.mutate(controller.id, { onSuccess: close })}
        >
          {t('remove.title')}
        </Button>
      </DrawerFooter>
    </StandardDrawer>
  );
}
