import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { AttraccessLogo } from '@attraccess/ui';
import React from 'react';
import { KeyRound, Users, Wrench } from 'lucide-react';
import en from './en.json';
import de from './de.json';

interface UnauthorizedLayoutProps {
  children: React.ReactNode;
}

export function UnauthorizedLayout({ children }: UnauthorizedLayoutProps) {
  const { t } = useTranslations({
    en,
    de,
  });

  return (
    <div className="h-[var(--vvh,100dvh)] overflow-y-auto bg-background border-t-4 border-accent">
      <div className="flex min-h-full">
        <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-surface-secondary border-r border-separator p-12 xl:p-16">
          <AttraccessLogo className="h-12 w-auto self-start" />
          <div className="py-12 max-w-lg">
            <p className="text-xs font-semibold uppercase tracking-widest text-accent mb-6">{t('eyebrow')}</p>
            <h2 className="text-5xl xl:text-6xl leading-tight font-semibold tracking-tight mb-6">{t('title')}</h2>
            <p className="text-lg leading-relaxed text-muted">{t('subtitle')}</p>
          </div>
          <div className="flex items-end justify-between gap-8">
            <div className="space-y-4 py-6 border-t border-separator flex-1 text-sm font-medium">
              <p className="flex items-center gap-3">
                <KeyRound className="size-5 text-accent" aria-hidden />
                {t('access')}
              </p>
              <p className="flex items-center gap-3">
                <Wrench className="size-5 text-accent" aria-hidden />
                {t('resources')}
              </p>
              <p className="flex items-center gap-3">
                <Users className="size-5 text-accent" aria-hidden />
                {t('community')}
              </p>
            </div>
            <img src="/logo.png" alt="" width={100} height={200} className="h-48 w-auto" />
          </div>
        </div>

        <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 lg:p-16">
          <div className="w-full max-w-md space-y-8">
            <div className="flex items-center lg:hidden">
              <AttraccessLogo className="h-12 w-auto" />
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
