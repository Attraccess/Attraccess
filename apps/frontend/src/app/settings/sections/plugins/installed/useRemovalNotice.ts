import { useEffect, useEffectEvent } from 'react';
import { useToastMessage } from '../../../../../components/toastProvider';
import { usePluginsTranslations } from '../usePluginsTranslations';
import { takePluginRemoval } from './removalNotice';

/** Shows the success toast of a removal that reloaded the page (see {@link takePluginRemoval}). */
export function useRemovalNotice() {
  const { t } = usePluginsTranslations();
  const toast = useToastMessage();
  const reportRemoval = useEffectEvent(() =>
    toast.success({ title: t('success.delete.title'), description: t('success.delete.description') }),
  );
  // Once per page load: reading the note clears it.
  useEffect(() => {
    if (takePluginRemoval()) reportRemoval();
  }, []);
}
