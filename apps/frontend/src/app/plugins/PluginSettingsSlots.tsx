import {
  ADMIN_SETTINGS_SLOT,
  AdminSettingsSlotContext,
  RESOURCE_SETTINGS_SLOT,
  ResourceSlotContext,
  USER_ACCOUNT_SLOT,
  UserSlotContext,
} from '@attraccess/plugins-frontend-sdk';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAuth } from '../../hooks/useAuth';
import { useSettingsSections } from '../settings/layout/useSettingsSections';
import { PluginSlot } from './PluginSlot';
import en from './PluginSettingsSlots.en.json';
import de from './PluginSettingsSlots.de.json';

// Permission-gated hosts for the plugin sections on settings-like pages. Without
// permission nothing is rendered, so no plugin code runs and no empty section shows.

export function ResourceSettingsPluginSlot({ resourceId }: { resourceId: number }) {
  const { t } = useTranslations({ en, de });
  const { hasPermission } = useAuth();
  if (!hasPermission('resources.update')) return null;
  return (
    <PluginSlot<ResourceSlotContext>
      slotId={RESOURCE_SETTINGS_SLOT}
      context={{ resourceId }}
      sectionTitle={t('resourceSettings')}
    />
  );
}

export function UserAccountPluginSlot({ userId }: { userId: number }) {
  const { t } = useTranslations({ en, de });
  return (
    <PluginSlot<UserSlotContext> slotId={USER_ACCOUNT_SLOT} context={{ userId }} sectionTitle={t('userAccount')} />
  );
}

export function AdminSettingsPluginSlot() {
  const { t } = useTranslations({ en, de });
  const { sections } = useSettingsSections();
  if (sections.length === 0) return null;
  return (
    <PluginSlot<AdminSettingsSlotContext> slotId={ADMIN_SETTINGS_SLOT} context={{}} sectionTitle={t('adminSettings')} />
  );
}
