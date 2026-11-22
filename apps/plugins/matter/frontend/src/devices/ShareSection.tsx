import { Button, ConfirmableButton, StatusAlert } from '@attraccess/plugins-frontend-ui';
import { useEffect, useState } from 'react';
import { useMatterTranslations } from '../i18n';
import { useMatterErrorText } from '../useMatterErrorText';
import { closeShareWindow, openShareWindow, type ShareWindow } from './api';
import { QrImage } from './QrImage';

/** Seconds left until `expiresAt`, never below 0. */
const secondsLeft = (expiresAt: string) => Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));

/**
 * Shares a claimed device with another controller (Apple, Google, Home Assistant, …): opens a commissioning window and
 * shows its one-time manual code and QR code with a countdown. The codes live only in this component's state: they are
 * dropped when the window closes or expires, and when the page is left. Render it only with the share permission.
 */
export function ShareSection({ nodeRecordId, name }: Readonly<{ nodeRecordId: string; name: string }>) {
  const { t } = useMatterTranslations();
  const errorText = useMatterErrorText();
  const [window, setWindow] = useState<ShareWindow | null>(null);
  const [left, setLeft] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [expired, setExpired] = useState(false);
  const [closing, setClosing] = useState(false);

  const expiresAt = window?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const remaining = secondsLeft(expiresAt);
      setLeft(remaining);
      if (remaining === 0) {
        setWindow(null);
        setExpired(true);
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  const open = async () => {
    setError(null);
    setExpired(false);
    try {
      setWindow(await openShareWindow(nodeRecordId));
    } catch (failure) {
      setError(failure);
    }
  };

  const close = async () => {
    setClosing(true);
    try {
      await closeShareWindow(nodeRecordId);
      setWindow(null);
    } catch (failure) {
      setError(failure);
    } finally {
      setClosing(false);
    }
  };

  return (
    <section
      className="mt:flex mt:flex-col mt:gap-3 mt:rounded-xl mt:border mt:border-separator mt:p-4"
      data-cy="matter-share"
    >
      <h3 className="mt:font-semibold">{t('devices.share.title')}</h3>
      <p className="mt:text-sm mt:text-muted">{t('devices.share.text')}</p>
      {error !== null && (
        <StatusAlert status="danger" title={t('devices.share.failed')} data-cy="matter-share-error">
          {errorText(error)}
        </StatusAlert>
      )}
      {expired && (
        <StatusAlert status="accent" title={t('devices.share.expired')} data-cy="matter-share-expired">
          {t('devices.share.expiredText')}
        </StatusAlert>
      )}
      {window ? (
        <div className="mt:flex mt:flex-col mt:gap-3" data-cy="matter-share-window">
          <QrImage text={window.qrCode} label={t('devices.share.qrLabel', { name })} />
          <dl className="mt:grid mt:gap-1 mt:text-sm">
            <dt className="mt:text-muted">{t('devices.share.manualCode')}</dt>
            <dd className="mt:font-mono mt:text-lg" data-cy="matter-share-manual">
              {window.manualCode}
            </dd>
            <dt className="mt:text-muted">{t('devices.share.qrText')}</dt>
            <dd className="mt:break-all mt:font-mono mt:text-sm" data-cy="matter-share-payload">
              {window.qrCode}
            </dd>
          </dl>
          <p aria-live="off" data-cy="matter-share-countdown">
            {t('devices.share.countdown', {
              minutes: Math.floor(left / 60),
              seconds: String(left % 60).padStart(2, '0'),
            })}
          </p>
          <p className="mt:text-sm mt:text-muted">{t('devices.share.once')}</p>
          <div>
            <Button variant="secondary" isPending={closing} onPress={() => void close()} data-cy="matter-share-close">
              {t('devices.share.close')}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <ConfirmableButton
            label={t('devices.share.open')}
            status="warning"
            onConfirm={open}
            confirm={{
              title: t('devices.share.confirmTitle', { name }),
              message: t('devices.share.confirmText'),
              confirmLabel: t('devices.share.open'),
              'data-cy': 'matter-share-confirm-dialog',
              confirmDataCy: 'matter-share-confirm',
            }}
            data-cy="matter-share-open"
          />
        </div>
      )}
    </section>
  );
}
