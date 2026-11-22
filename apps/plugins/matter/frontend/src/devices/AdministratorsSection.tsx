import { Chip } from '@heroui/react';
import { useMatterTranslations } from '../i18n';
import type { NodeAdministrator } from './api';

/**
 * The other administrators of the device (the fabrics it is joined to), read-only. Attraccess cannot see or attribute what
 * they do: nothing an external fabric does is shown as an action of an Attraccess user.
 */
export function AdministratorsSection({ administrators }: Readonly<{ administrators: readonly NodeAdministrator[] }>) {
  const { t } = useMatterTranslations();
  const others = administrators.filter((entry) => !entry.isOwn);
  if (administrators.length === 0) return null;
  return (
    <section
      className="mt:flex mt:flex-col mt:gap-3 mt:rounded-xl mt:border mt:border-separator mt:p-4"
      data-cy="matter-administrators"
    >
      <h3 className="mt:font-semibold">{t('devices.administrators.title')}</h3>
      <p className="mt:text-sm mt:text-muted">{t('devices.administrators.text')}</p>
      {others.length === 0 ? (
        <p className="mt:text-sm" data-cy="matter-administrators-none">
          {t('devices.administrators.none')}
        </p>
      ) : (
        <ul className="mt:flex mt:flex-col mt:gap-2 mt:text-sm">
          {others.map((entry) => (
            <li
              key={entry.fabricIndex}
              className="mt:flex mt:flex-wrap mt:items-center mt:gap-2"
              data-cy="matter-administrator"
            >
              <Chip variant="soft">{t('devices.administrators.fabric', { index: entry.fabricIndex })}</Chip>
              <span>{entry.fabricLabel ?? t('devices.administrators.unlabeled')}</span>
              <span className="mt:text-muted">
                {entry.vendorId === null
                  ? t('devices.unknown')
                  : t('devices.administrators.vendor', { vendorId: entry.vendorId })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
