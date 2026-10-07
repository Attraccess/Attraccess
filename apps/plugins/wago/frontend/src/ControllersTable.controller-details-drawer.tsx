import { Alert, Button, Drawer } from '@heroui/react';
import type { CommissioningSession, WagoController } from './api';
import { RuntimeUpdateDetails } from './RuntimeUpdateDetails';
import { useWagoTranslations } from './i18n';
import { NetworkChangeDetails } from './NetworkChangeDetails';
import type { TableRowData } from './ControllersTable.contracts';
import { CommissioningStatus } from './ControllersTable.commissioning-label.helpers';
import { SessionProgressAction } from './ControllersTable.controller-status.helpers';

export function ControllerDetailsDrawer({
  row,
  onClose,
  onConfigure,
  onRemove,
  onResume,
}: {
  row: TableRowData;
  onClose: () => void;
  onConfigure: (id: number) => void;
  onRemove: (controller: WagoController) => void;
  onResume: (session: CommissioningSession) => void;
}) {
  const { t, language, tBackendMessage } = useWagoTranslations();
  const controller = row.kind === 'controller' ? row.controller : null;
  const session = row.session;
  const name = controller?.name ?? session?.controllerName ?? controller?.hardwareId ?? t('controllers.enrollment');
  const target =
    controller?.trustState === 'claimed' ? { controller } : session?.managedAccessAvailable ? { session } : null;
  const configure = () => {
    if (controller) {
      onClose();
      onConfigure(controller.id);
    }
  };
  return (
    <Drawer.Backdrop
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Drawer.Content placement="right">
        <Drawer.Dialog aria-label={t('controllers.detailsFor', { name })} className="wg:w-full wg:max-w-xl">
          <Drawer.Header>
            <Drawer.Heading>{name}</Drawer.Heading>
            <Drawer.CloseTrigger aria-label={t('common.close')} />
          </Drawer.Header>
          <Drawer.Body className="wg:space-y-4">
            <dl className="wg:space-y-2">
              <div>
                <dt className="wg:text-sm wg:text-muted">{t('controllers.hardwareId')}</dt>
                <dd className="wg:break-all">{controller?.hardwareId ?? session?.hardwareId}</dd>
              </div>
              {controller && (
                <div>
                  <dt className="wg:text-sm wg:text-muted">{t('controllers.registration')}</dt>
                  <dd>{t(`trust.${controller.trustState}`)}</dd>
                </div>
              )}
              {session?.targetHost && (
                <div>
                  <dt className="wg:text-sm wg:text-muted">{t('controllers.address')}</dt>
                  <dd>{session.targetHost}</dd>
                </div>
              )}
              {controller && (
                <div>
                  <dt className="wg:text-sm wg:text-muted">{t('controllers.heartbeat')}</dt>
                  <dd>
                    {controller.lastHeartbeatAt
                      ? new Date(controller.lastHeartbeatAt).toLocaleString(language)
                      : t('controllers.never')}
                  </dd>
                </div>
              )}
              {session?.firmwareBaseline && (
                <div>
                  <dt className="wg:text-sm wg:text-muted">{t('controllers.systemFirmware')}</dt>
                  <dd>{session.firmwareBaseline}</dd>
                </div>
              )}
            </dl>
            {session && (
              <CommissioningStatus session={session} runtimeUpdate={controller?.connectivity === 'runtime_update'} />
            )}
            {controller?.compatibilityError && (
              <Alert status="warning">
                <Alert.Content>
                  <Alert.Description>{tBackendMessage(controller.compatibilityError)}</Alert.Description>
                </Alert.Content>
              </Alert>
            )}
            {target && <RuntimeUpdateDetails target={target} />}
            {controller?.trustState === 'claimed' && <NetworkChangeDetails controllerId={controller.id} />}
            {session?.failureReason && <p role="alert">{tBackendMessage(session.failureReason)}</p>}
          </Drawer.Body>
          <Drawer.Footer className="wg:flex wg:flex-wrap wg:gap-2">
            {controller?.trustState === 'claimed' && <Button onPress={configure}>{t('controllers.configure')}</Button>}
            {session && (
              <SessionProgressAction
                session={session}
                onResume={(value) => {
                  onClose();
                  onResume(value);
                }}
              />
            )}
            {controller && (
              <Button
                variant="danger"
                onPress={() => {
                  onClose();
                  onRemove(controller);
                }}
              >
                {t('common.remove')}
              </Button>
            )}
          </Drawer.Footer>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}
