import React from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BookOpen, Lock } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { LoginForm } from '../components/LoginForm';

export const LoginPage: React.FC = () => {
  const { isAuthenticated } = useAuth();

  // If authenticated, navigate to dashboard
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center">
      <motion.div
        className="w-full max-w-md p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="mb-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-blue-100 dark:bg-blue-900 p-3 rounded-full">
              <BookOpen className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Welcome to Attractap</h2>
          <p className="text-gray-600 dark:text-gray-400">Please enter your admin password to continue</p>
        </div>

        <div className="flex justify-center mb-6">
          <div className="bg-blue-50 dark:bg-gray-700 rounded-lg px-4 py-2 flex items-center text-sm text-gray-700 dark:text-gray-300">
            <Lock className="h-4 w-4 mr-2 text-blue-500 dark:text-blue-400" />
            Secure configuration interface
          </div>
        </div>

        <LoginForm />
      </motion.div>
    </div>
  );
};
