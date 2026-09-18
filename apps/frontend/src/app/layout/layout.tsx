import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { DonationPrompt } from '../../components/DonationPrompt';
import { UpdateNotificationBanner } from '../../components/UpdateNotificationBanner';
import { ServerNotAvailable } from '../serverNotAvailable';
import { useLiveTransactionUpdates } from '../billing/dashboard/summary/live-updates';
import { useQueryClient } from '@tanstack/react-query';
import {
  UseBillingServiceGetBillingBalanceKeyFn,
  useBillingServiceGetBillingTransactionsKey,
} from '@attraccess/react-query-client';
import { useAuth } from '../../hooks/useAuth';
import { GlobalMessagingLive } from '../messaging/GlobalMessagingLive';
import { GlobalSystemNotificationsLive } from '../notifications/GlobalSystemNotificationsLive';
import { GlobalPushNotifications } from '../notifications/GlobalPushNotifications';

interface LayoutProps {
  children: React.ReactNode;
}

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'attraccess.sidebar-collapsed';

export function Layout({ children }: LayoutProps) {
  // Initialize synchronously from the viewport so the first paint is correct —
  // a false initial value would animate the sidebar open/collapsed on every load.
  const [isOpen, setIsOpen] = useState(() => window.innerWidth >= 768);
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 768);

  // Set the initial sidebar state based on screen size
  useEffect(() => {
    const handleResize = () => {
      const desktop = window.innerWidth >= 768; // 768px is the md breakpoint in Tailwind
      setIsOpen(desktop);
      setIsDesktop(desktop);
    };

    // Set initial state
    handleResize();

    // Update on window resize
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleSidebar = () => {
    setIsOpen(!isOpen);
  };

  // Desktop-only: collapse the sidebar to an icon rail for more content space
  const [isCollapsed, setIsCollapsed] = useState(() => localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true');
  const toggleCollapsed = useCallback(() => {
    setIsCollapsed((prev) => {
      localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(!prev));
      return !prev;
    });
  }, []);

  const location = useLocation();
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    setIsOpen(false);
  }, [location.pathname]);

  const { user: currentUser, isAuthenticated, needsTwoFactorSetup } = useAuth();
  const queryClient = useQueryClient();

  const onLiveTransactionUpdate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [useBillingServiceGetBillingTransactionsKey] });
    queryClient.invalidateQueries({
      queryKey: UseBillingServiceGetBillingBalanceKeyFn({ userId: currentUser?.id ?? 0 }),
    });
  }, [currentUser, queryClient]);

  // Only connect to SSE when authenticated to avoid 401 errors on unauthenticated pages
  useLiveTransactionUpdates({
    onUpdate: onLiveTransactionUpdate,
    enabled: isAuthenticated && !needsTwoFactorSetup,
  });

  if (!isAuthenticated) {
    return (
      <div className="bg-background h-[var(--vvh,100dvh)] min-h-0 flex flex-col overflow-y-auto app-scroll-container">
        <ServerNotAvailable />
        {children}
      </div>
    );
  }

  // --vvh tracks the visually-visible height, so the shell shrinks when the mobile
  // keyboard opens instead of leaving bottom-anchored UI underneath it.
  return (
    <div className="flex h-[var(--vvh,100dvh)] min-h-0 bg-background">
      {/* Sidebar */}
      <Sidebar
        isOpen={isOpen}
        toggleSidebar={toggleSidebar}
        isCollapsed={isDesktop && isCollapsed}
        toggleCollapsed={toggleCollapsed}
      />

      {/* Main Content */}
      {/* min-w-0: without it this flex item keeps min-width:auto and wide content
          (e.g. the resource detail tab bar) pushes the column past the viewport
          instead of scrolling inside it. */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
        {/* Mobile Header */}
        <Header toggleSidebar={toggleSidebar} />

        {/* Update notification banner (admins only) */}
        <UpdateNotificationBanner />

        {/* Server unavailable inline notice */}
        <ServerNotAvailable />

        <GlobalMessagingLive enabled={isAuthenticated && !needsTwoFactorSetup} />
        <GlobalSystemNotificationsLive enabled={isAuthenticated && !needsTwoFactorSetup} />
        <GlobalPushNotifications enabled={isAuthenticated && !needsTwoFactorSetup} />

        {/* Page Content */}
        <main className="flex-1 min-h-0 overflow-auto p-4 md:p-6 lg:p-8 bg-background app-scroll-container">
          {children}
        </main>

        {/* Global donation prompt for eligible users */}
        <DonationPrompt />
      </div>
    </div>
  );
}
