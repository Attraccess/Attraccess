import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Drawer, DrawerBody, DrawerContent, DrawerFooter, DrawerHeader } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { HeartHandshake, Share2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import en from './en.json';
import de from './de.json';
import { useLicenseServiceGetLicenseInformation, User } from '@attraccess/react-query-client';

const SNOOZE_KEY = 'donationPrompt:snoozedUntil';

function getSnoozedUntil(): number | null {
  try {
    const value = localStorage.getItem(SNOOZE_KEY);
    if (!value) return null;
    const ts = parseInt(value, 10);
    return Number.isFinite(ts) ? ts : null;
  } catch {
    return null;
  }
}

function setSnoozedForOneMonth() {
  const oneMonthMs = 30 * 24 * 60 * 60 * 1000;
  const until = Date.now() + oneMonthMs;
  try {
    localStorage.setItem(SNOOZE_KEY, String(until));
  } catch {
    console.error('Failed to persist snoozedUntil in localStorage for key: ', SNOOZE_KEY);
  }
}

function userHasAnyManagePermission(user: User | null): boolean {
  if (!user) return false;
  return Object.values(user.systemPermissions).some((enabled) => enabled === true);
}

export function DonationPrompt() {
  const { t } = useTranslations({ en, de });
  const { user } = useAuth();

  const isEligible = useMemo(() => userHasAnyManagePermission(user), [user]);
  const { data: license } = useLicenseServiceGetLicenseInformation();

  const [isVisible, setIsVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !isEligible) {
      setIsVisible(false);
      return;
    }
    const until = getSnoozedUntil();
    if (until && Date.now() < until) {
      setIsVisible(false);
      return;
    }
    // small delay to allow slide-in transition
    const id = setTimeout(() => setIsVisible(true), 300);
    return () => clearTimeout(id);
  }, [mounted, isEligible]);

  const onHideForMonth = useCallback(() => {
    setSnoozedForOneMonth();
    setIsVisible(false);
  }, []);

  const onDonate = useCallback(() => {
    window.open('https://github.com/sponsors/Attraccess', '_blank', 'noopener');
  }, []);

  const onShare = useCallback(() => {
    const text = t('share.tweetText');
    const hashtags = t('share.tweetHashtags');
    const url = 'https://attraccess.org';
    const intent = new URL('https://twitter.com/intent/tweet');
    intent.searchParams.set('text', text);
    intent.searchParams.set('hashtags', hashtags);
    intent.searchParams.set('url', url);
    window.open(intent.toString(), '_blank', 'noopener');
  }, [t]);

  if (!isEligible) {
    return null;
  }
  if (!license || !license.isNonProfit) {
    return null;
  }

  return (
    <Drawer
      isOpen={isVisible}
      onOpenChange={(open) => setIsVisible(open)}
      placement="bottom"
      size="xs"
      backdrop="blur"
      isDismissable={false}
    >
      <DrawerContent className="w-full max-w-[680px]" style={{ margin: '0 auto' }}>
        <DrawerHeader className="flex flex-col gap-1">
          <div className="text-base font-semibold">{t('title')}</div>
          <div className="text-sm text-default-500">{t('subtitle')}</div>
        </DrawerHeader>
        <DrawerBody>
          <div className="text-sm text-default-600 dark:text-default-400">{t('body')}</div>
        </DrawerBody>
        <DrawerFooter className="flex flex-wrap gap-2 justify-end">
          <Button color="primary" startContent={<HeartHandshake size={16} />} onPress={onDonate}>
            {t('actions.donate')}
          </Button>
          <Button variant="flat" startContent={<Share2 size={16} />} onPress={onShare}>
            {t('actions.share')}
          </Button>
          <Button variant="light" onPress={onHideForMonth}>
            {t('actions.hideForMonth')}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
