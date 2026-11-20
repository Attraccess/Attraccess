import { Button, StandardDrawer } from '@attraccess/plugins-frontend-ui';
import { Drawer, Form } from '@heroui/react';
import type { ReactNode } from 'react';
import { useWagoTranslations } from '../../i18n';

export function SettingsDrawer({
  title,
  onClose,
  onSave,
  children,
  remove,
  isSaveDisabled = false,
}: {
  title: string;
  onClose: () => void;
  onSave: () => void;
  /** The settings cannot be saved as they are; the body explains why. */
  isSaveDisabled?: boolean;
  children: ReactNode;
  remove?: ReactNode;
}) {
  const { t } = useWagoTranslations();
  return (
    <StandardDrawer
      isOpen
      onOpenChange={(open) => !open && onClose()}
      contentProps={{ placement: 'right' }}
      dialogProps={{ 'aria-label': title, className: 'wg:w-full wg:max-w-full wg:sm:max-w-xl' }}
    >
      <Form
        className="wg:flex wg:h-full wg:min-h-0 wg:flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <Drawer.Header>
          <Drawer.Heading>{title}</Drawer.Heading>
          <Drawer.CloseTrigger aria-label={t('panel.closeSettings')} />
        </Drawer.Header>
        <Drawer.Body className="wg:flex wg:flex-col wg:gap-5">{children}</Drawer.Body>
        <Drawer.Footer className="wg:flex wg:flex-wrap wg:gap-2">
          {remove}
          <Button variant="secondary" onPress={onClose}>
            {t('panel.cancel')}
          </Button>
          <Button type="submit" isDisabled={isSaveDisabled}>
            {t('panel.done')}
          </Button>
        </Drawer.Footer>
      </Form>
    </StandardDrawer>
  );
}
