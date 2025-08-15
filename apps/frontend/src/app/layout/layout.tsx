import React, { useState, useEffect } from 'react';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { DonationPrompt } from '../../components/DonationPrompt';

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

  if (noLayout) {
    return <div className="bg-gray-100 dark:bg-gray-900">{children}</div>;
  }

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
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
