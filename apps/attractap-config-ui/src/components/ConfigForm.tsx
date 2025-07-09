import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Settings, Save, Eye, EyeOff, Shield } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import { Form } from '@heroui/react';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { useConfig, useSaveConfig } from '../services/queries';

export const ConfigForm: React.FC = () => {
  const [showPassword, setShowPassword] = useState(false);

  const saveConfig = useSaveConfig();
  const { data: config, isLoading, refetch, isSuccess } = useConfig();

  useEffect(() => {
    refetch();
  }, [refetch]);

  const [password, setPassword] = useState('');
  const [apiHostname, setApiHostname] = useState('');
  const [apiPort, setApiPort] = useState('');

  useEffect(() => {
    if (isSuccess && config) {
      setPassword(config.configPagePassword);
      setApiHostname(config.apiHostname);
      setApiPort(config.apiPort);
    }
  }, [isSuccess, config]);

  const onSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      saveConfig.mutate({
        configPagePassword: password,
        apiHostname,
        apiPort,
      });
    },
    [saveConfig, password, apiHostname, apiPort]
  );

  return (
    <Form onSubmit={onSubmit} className="space-y-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" /> API Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <motion.div
            className="space-y-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <Input
              label="API Hostname"
              placeholder="e.g., api.example.com"
              fullWidth
              value={apiHostname}
              onChange={(e) => setApiHostname(e.target.value)}
            />

            <Input
              label="API Port"
              placeholder="e.g., 8080"
              fullWidth
              value={apiPort}
              onChange={(e) => setApiPort(e.target.value)}
            />
          </motion.div>
        </CardContent>
      </Card>

      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" /> Security Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <motion.div
            className="space-y-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="relative">
              <Input
                label="Admin Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter new admin password"
                fullWidth
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="absolute right-3 top-9 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </motion.div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-4 mt-6">
        {saveConfig.isSuccess && (
          <motion.div
            className="text-green-600 dark:text-green-400 font-medium"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            Settings saved successfully!
          </motion.div>
        )}
        <Button type="submit" isLoading={isLoading} disabled={isLoading} size="lg">
          <Save className="h-4 w-4 mr-2" />
          Save All Settings
        </Button>
      </div>
    </Form>
  );
};
