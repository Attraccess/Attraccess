import React, { useCallback, useMemo } from 'react';
import { Toaster, toast } from 'sonner';
import { AlertCircle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { getTranslationKeyForApiError, Props as ApiErrorToastProps } from '../utils/apiError';
import { useAppTheme } from '@attraccess/ui';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastOptions {
  title: string;
  description?: string;
  type?: ToastType;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

const toastIcons = {
  success: <CheckCircle2 className="h-5 w-5 text-success" />,
  error: <XCircle className="h-5 w-5 text-danger" />,
  warning: <AlertCircle className="h-5 w-5 text-warning" />,
  info: <Info className="h-5 w-5 text-accent" />,
};

interface ToastProviderProps {
  children: React.ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const { resolvedTheme } = useAppTheme();
  return (
    <>
      {children}
      <Toaster
        position="bottom-right"
        theme={resolvedTheme}
        closeButton
        toastOptions={{
          style: {
            background: 'var(--overlay)',
            color: 'var(--foreground)',
            borderColor: 'var(--border)',
            borderRadius: 'var(--field-radius)',
          },
          actionButtonStyle: { background: 'var(--accent)', color: 'var(--accent-foreground)' },
        }}
      />
    </>
  );
}

export function useToastMessage() {
  const showToast = useCallback(({ title, description, type = 'info', duration = 5000, action }: ToastOptions) => {
    const toastFn =
      type === 'error'
        ? toast.error
        : type === 'success'
          ? toast.success
          : type === 'warning'
            ? toast.warning
            : toast.info;

    toastFn(title, {
      description,
      icon: toastIcons[type],
      duration,
      action,
    });
  }, []);

  const showApiErrorToast = useCallback(
    (props: ApiErrorToastProps) => {
      const { key, errorMessage } = getTranslationKeyForApiError(props);

      showToast({
        type: 'error',
        title: props.t(key + '.title'),
        description: props.t(key + '.description', {
          error: errorMessage,
        }),
      });
    },
    [showToast],
  );

  return useMemo(
    () => ({
      showToast,
      success: (options: Omit<ToastOptions, 'type'>) => showToast({ ...options, type: 'success' }),
      error: (options: Omit<ToastOptions, 'type'>) => showToast({ ...options, type: 'error' }),
      warning: (options: Omit<ToastOptions, 'type'>) => showToast({ ...options, type: 'warning' }),
      info: (options: Omit<ToastOptions, 'type'>) => showToast({ ...options, type: 'info' }),
      apiError: showApiErrorToast,
    }),
    [showToast, showApiErrorToast],
  );
}
