import React from 'react';
import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { StatusIndicator } from './StatusIndicator';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { useStatus } from '../services/queries';

export const StatusCard: React.FC = () => {
  const status = useStatus({
    refetchInterval: 1000,
  });

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Device Status</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => status.refetch()} disabled={status.isLoading} className="p-2">
          <RefreshCw className={`h-4 w-4 ${status.isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="space-y-3">
              <div className="flex flex-col">
                <span className="text-sm text-gray-500 dark:text-gray-400">IP Address</span>
                <span className="font-mono text-gray-800 dark:text-gray-200">{status.data?.ipAddress}</span>
              </div>

              <div className="flex flex-col">
                <span className="text-sm text-gray-500 dark:text-gray-400">Reader ID</span>
                <span className="font-mono text-gray-800 dark:text-gray-200">{status.data?.readerId}</span>
              </div>
            </div>

            <div className="space-y-3">
              <StatusIndicator status={status.isSuccess} label="Config Connection:" />

              <StatusIndicator status={status.data?.apiConnected ?? false} label="API Connection:" />
            </div>
          </motion.div>

          <div className="text-xs text-gray-500 dark:text-gray-400 mt-4 text-right">
            Last updated: {status.dataUpdatedAt ? new Date(status.dataUpdatedAt).toLocaleTimeString() : 'Unknown'}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
