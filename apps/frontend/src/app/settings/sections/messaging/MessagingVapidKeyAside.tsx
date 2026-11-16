import { InputGroup, TextField, Tooltip, TooltipContent } from '@heroui/react';
import { ClipboardCopyIcon } from 'lucide-react';
import { Button, useTranslations } from '@attraccess/plugins-frontend-ui';
import { usePushServicePushGetVapidConfig } from '@attraccess/react-query-client';
import { useToastMessage } from '../../../../components/toastProvider';
import en from './en.json';
import de from './de.json';

export function MessagingVapidKeyAside() {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const { data: vapidConfig } = usePushServicePushGetVapidConfig();

  const copyPublicKey = async () => {
    if (!vapidConfig?.publicKey || !navigator?.clipboard?.writeText) {
      toast.error({ title: t('copyFailed.title'), description: t('copyFailed.description') });
      return;
    }
    try {
      await navigator.clipboard.writeText(vapidConfig.publicKey);
      toast.success({ title: t('copied.title'), description: t('copied.description') });
    } catch {
      toast.error({ title: t('copyFailed.title'), description: t('copyFailed.description') });
    }
  };

  return (
    <>
      <TextField value={vapidConfig?.publicKey ?? ''} isReadOnly>
        <span className="text-sm font-semibold text-foreground">{t('publicKeyLabel')}</span>
        <InputGroup>
          <InputGroup.Input className="font-mono text-sm" />
          <InputGroup.Suffix>
            <Tooltip>
              <Button variant="ghost" isIconOnly aria-label={t('copyButton')} onPress={copyPublicKey}>
                <ClipboardCopyIcon size={16} />
              </Button>
              <TooltipContent>{t('copyButton')}</TooltipContent>
            </Tooltip>
          </InputGroup.Suffix>
        </InputGroup>
      </TextField>
      <p className="text-xs text-muted">{t('aside.publicKeyHint', { count: vapidConfig?.subscriptionCount ?? 0 })}</p>
    </>
  );
}
