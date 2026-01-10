/**
 * UI Store - manages modal states and toasts
 */

import { create } from 'zustand';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'info' | 'error';
}

interface UIState {
  // Modal states
  encryptModalOpen: boolean;
  decryptModalOpen: boolean;
  
  // Toasts
  toasts: Toast[];
  nextToastId: number;

  // Actions
  openEncryptModal: () => void;
  closeEncryptModal: () => void;
  openDecryptModal: () => void;
  closeDecryptModal: () => void;
  showToast: (message: string, type?: Toast['type']) => void;
  removeToast: (id: number) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  encryptModalOpen: false,
  decryptModalOpen: false,
  toasts: [],
  nextToastId: 1,

  openEncryptModal: () => set({ encryptModalOpen: true }),
  closeEncryptModal: () => set({ encryptModalOpen: false }),
  openDecryptModal: () => set({ decryptModalOpen: true }),
  closeDecryptModal: () => set({ decryptModalOpen: false }),

  showToast: (message, type = 'info') => {
    const id = get().nextToastId;
    set((state) => ({
      toasts: [...state.toasts, { id, message, type }],
      nextToastId: state.nextToastId + 1,
    }));

    // Auto-remove after 3 seconds
    setTimeout(() => {
      get().removeToast(id);
    }, 3000);
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));
