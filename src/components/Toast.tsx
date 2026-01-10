import React from 'react';
import { useUIStore } from '../store';

export function ToastContainer() {
  const toasts = useUIStore((state) => state.toasts);

  if (toasts.length === 0) return null;

  // Only show the latest toast
  const toast = toasts[toasts.length - 1];

  return (
    <div className={`toast ${toast.type}`}>
      {toast.message}
    </div>
  );
}
