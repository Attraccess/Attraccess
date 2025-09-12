import { useTranslations } from '@attraccess/plugins-frontend-ui';
import React from 'react';
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
    <div className="flex min-h-screen">
      {/* Left side with background image */}
      <div className="hidden lg:flex lg:w-1/2 relative">
        <img
          className="absolute inset-0 w-full h-full object-cover object-left"
          src="login-wallpaper-blue.jpg"
          alt="Login Wallpaper"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 to-black/20" />
        <div className="relative z-10 p-12 text-white">
          <h2 className="text-4xl font-bold mb-4">{t('title')}</h2>
          <p className="text-lg text-gray-200">{t('subtitle')}</p>
        </div>
      </div>

      {/* Right side with form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12 lg:p-16">
        <div className="w-full max-w-md space-y-8">{children}</div>
      </div>
    </div>
  );
}
