import React, { useCallback, useMemo } from 'react';
import { Toaster, toast } from 'sonner';
import { AlertCircle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { getTranslationKeyForApiError, Props as ApiErrorToastProps } from '../utils/apiError';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastOptions {
  title: string;
  description?: string;
  type?: ToastType;
  duration?: number;
  action?: ToastAction;
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
      action: action ? { label: action.label, onClick: action.onClick } : undefined,
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
    [showToast, showApiErrorToast]
  );
}
