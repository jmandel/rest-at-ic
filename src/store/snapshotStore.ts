/**
 * Snapshot Store - manages snapshot list and loading
 */

import { create } from 'zustand';
import type { SnapshotWithId } from '../lib/types';
import { useConnectionStore } from './connectionStore';

interface SnapshotState {
  snapshots: SnapshotWithId[];
  isLoading: boolean;
  error: string | null;

  loadSnapshots: () => Promise<void>;
  clear: () => void;
}

export const useSnapshotStore = create<SnapshotState>((set) => ({
  snapshots: [],
  isLoading: false,
  error: null,

  loadSnapshots: async () => {
    const repo = useConnectionStore.getState().repo;
    if (!repo) {
      set({ error: 'Not connected to repository' });
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const snapshots = await repo.listSnapshots();
      set({ snapshots, isLoading: false });
    } catch (err) {
      const error = err as Error;
      set({ error: error.message, isLoading: false });
    }
  },

  clear: () => {
    set({ snapshots: [], error: null });
  },
}));
