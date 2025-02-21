// src/utils/errorHandler.ts
import type { ToastId, UseToastOptions } from '@chakra-ui/react';

interface ErrorWithMessage {
  message?: string;
}


export function handleError(
  error: unknown,
  toast: (options: UseToastOptions) => ToastId,
  defaultMessage: string,
): void {
  const message = (error as ErrorWithMessage)?.message || defaultMessage;
  console.error(message, error);
  toast({
    title: 'Error',
    description: message,
    status: 'error',
    duration: 3000,
    isClosable: true,
  });
}
