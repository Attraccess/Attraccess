import React, { useCallback } from 'react';
import { Toaster, toast } from 'sonner';
import { AlertCircle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { ApiError } from '@attraccess/react-query-client';
import { TExists, TFunction } from '@attraccess/plugins-frontend-ui';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastOptions {
  title: string;
  description?: string;
  type?: ToastType;
  duration?: number;
}

const toastIcons = {
  success: <CheckCircle2 className="h-5 w-5 text-green-500" />,
  error: <XCircle className="h-5 w-5 text-red-500" />,
  warning: <AlertCircle className="h-5 w-5 text-yellow-500" />,
  info: <Info className="h-5 w-5 text-blue-500" />,
};

interface ToastProviderProps {
  children: React.ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  return (
    <>
      {children}
      <Toaster position="bottom-right" theme="system" closeButton richColors />
    </>
  );
}

export interface ApiErrorToastProps {
  error: ApiError | Error;
  t: TFunction;
  tExists: TExists;
  baseTranslationKey: string;
  fallbackKey?: string;
}

export function useToastMessage() {
  const showToast = useCallback(({ title, description, type = 'info', duration = 5000 }: ToastOptions) => {
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
    });
  }, []);

  const showApiErrorToast = useCallback(
    (props: ApiErrorToastProps) => {
      const errorMessage =
        ((props.error as ApiError).body as { message?: string | string[] } | undefined)?.message ?? props.error.message;

      const translationExists = props.tExists(props.baseTranslationKey + errorMessage);

      const fullBaseKey = translationExists
        ? props.baseTranslationKey + '.' + errorMessage
        : props.baseTranslationKey + '.' + (props.fallbackKey ?? 'generic');

      showToast({
        type: 'error',
        title: props.t(fullBaseKey + '.title'),
        description: props.t(fullBaseKey + '.description', {
          error: errorMessage,
        }),
      });
    },
    [showToast],
  );

  return {
    showToast,
    success: (options: Omit<ToastOptions, 'type'>) => showToast({ ...options, type: 'success' }),
    error: (options: Omit<ToastOptions, 'type'>) => showToast({ ...options, type: 'error' }),
    warning: (options: Omit<ToastOptions, 'type'>) => showToast({ ...options, type: 'warning' }),
    info: (options: Omit<ToastOptions, 'type'>) => showToast({ ...options, type: 'info' }),
    apiError: showApiErrorToast,
  };
}
