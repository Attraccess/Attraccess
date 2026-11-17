import { InputGroup, TextField, Tooltip, TooltipContent } from '@heroui/react';
import { ClipboardCopyIcon } from 'lucide-react';
import { Button, useTranslations } from '@attraccess/plugins-frontend-ui';
import { VapidConfigDto } from '@attraccess/react-query-client';
import { useCopyToClipboard } from '../../../../hooks/useCopyToClipboard';
import en from './en.json';
import de from './de.json';

/** The current public key with a copy button; `vapidConfig` comes from the section. */
export function MessagingVapidKeyAside({ vapidConfig }: { vapidConfig: VapidConfigDto | undefined }) {
  const { t } = useTranslations({ en, de });
  const copyToClipboard = useCopyToClipboard({
    title: t('copyFailed.title'),
    description: t('copyFailed.description'),
  });

  const copyPublicKey = () =>
    copyToClipboard(vapidConfig?.publicKey, { title: t('copied.title'), description: t('copied.description') });

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
