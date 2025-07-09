import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';

interface StatusIndicatorProps {
  status: boolean;
  label: string;
  className?: string;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  label,
  className
}) => {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <motion.div 
        className={cn(
          "h-3 w-3 rounded-full",
          status ? "bg-green-500" : "bg-red-500"
        )}
        initial={{ scale: 0.8 }}
        animate={{ 
          scale: [0.8, 1.1, 0.9],
          opacity: status ? [0.7, 1, 0.9] : 1
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          repeatType: "reverse",
          ease: "easeInOut"
        }}
      />
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      <span 
        className={cn(
          "text-sm font-medium ml-1",
          status 
            ? "text-green-600 dark:text-green-400" 
            : "text-red-600 dark:text-red-400"
        )}
      >
        {status ? 'Connected' : 'Disconnected'}
      </span>
    </div>
  );
};