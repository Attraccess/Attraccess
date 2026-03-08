import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { DonationPrompt } from '../../components/DonationPrompt';
import { useLiveTransactionUpdates } from '../billing/dashboard/summary/live-updates';
import { useQueryClient } from '@tanstack/react-query';
import {
  UseBillingServiceGetBillingBalanceKeyFn,
  useBillingServiceGetBillingTransactionsKey,
} from '@attraccess/react-query-client';
import { useAuth } from '../../hooks/useAuth';

interface LayoutProps {
  children: React.ReactNode;
  noLayout?: boolean;
}

export function Layout({ children, noLayout }: LayoutProps) {
  // Initialize with closed sidebar on mobile, open on desktop
  const [isOpen, setIsOpen] = useState(false);

  // Set the initial sidebar state based on screen size
  useEffect(() => {
    const handleResize = () => {
      setIsOpen(window.innerWidth >= 768); // 768px is the md breakpoint in Tailwind
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

  if (noLayout) {
    return <div className="bg-gray-100 dark:bg-gray-900">{children}</div>;
  }

  return (
    <div className="flex h-screen bg-white dark:bg-gray-800">
      {/* Sidebar */}
      <Sidebar isOpen={isOpen} toggleSidebar={toggleSidebar} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile Header */}
        <Header toggleSidebar={toggleSidebar} />

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-4">{children}</main>

        {/* Global donation prompt for eligible users */}
        <DonationPrompt />
      </div>
    </div>
  );
}
