import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Button } from '../../../components/button';
import en from './en.json';
import de from './de.json';

interface SettingsSaveBarProps {
  isDirty: boolean;
  isSaving?: boolean;
  onSave: () => void;
  onDiscard: () => void;
}

/**
 * The commit affordance for a section: absent while the form is clean, a slim sticky strip once
 * something has been edited. Nothing to save means nothing on screen — no permanently greyed-out
 * Save button whose disabled state the operator has to interpret.
 */
export function SettingsSaveBar({ isDirty, isSaving, onSave, onDiscard }: SettingsSaveBarProps) {
  const { t } = useTranslations({ en, de });

  if (!isDirty) {
    return null;
  }

  return (
    <div
      data-slot="settings-save-bar"
      className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3"
    >
      <span className="mr-auto text-sm text-muted">{t('saveBar.unsaved')}</span>
      <Button variant="ghost" size="sm" onPress={onDiscard} isDisabled={isSaving}>
        {t('saveBar.discard')}
      </Button>
      <Button variant="primary" size="sm" onPress={onSave} isPending={isSaving}>
        {t('saveBar.save')}
      </Button>
    </div>
  );
}
