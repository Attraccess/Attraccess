import React from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { StatusCard } from '../components/StatusCard';
import { ConfigForm } from '../components/ConfigForm';

export const DashboardPage: React.FC = () => {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login\" replace />;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <motion.h1
        className="text-2xl font-bold text-gray-900 dark:text-white"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        Device Dashboard
      </motion.h1>

      <motion.div
        className="grid grid-cols-1 gap-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <StatusCard />

        <ConfigForm />
      </motion.div>
    </div>
  );
};
