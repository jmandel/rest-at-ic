/**
 * Browser Store - manages file browsing state
 */

import { create } from 'zustand';
import type { SnapshotWithId, Tree, Node } from '../lib/types';
import { useConnectionStore } from './connectionStore';

interface BrowserState {
  currentSnapshot: SnapshotWithId | null;
  currentPath: string;
  currentTree: Tree | null;
  selectedNode: Node | null;
  isLoading: boolean;
  isDownloading: boolean;
  error: string | null;

  selectSnapshot: (snapshot: SnapshotWithId) => Promise<void>;
  navigateTo: (path: string) => Promise<void>;
  selectNode: (node: Node | null) => void;
  downloadFile: () => Promise<void>;
  clear: () => void;
}

export const useBrowserStore = create<BrowserState>((set, get) => ({
  currentSnapshot: null,
  currentPath: '/',
  currentTree: null,
  selectedNode: null,
  isLoading: false,
  isDownloading: false,
  error: null,

  selectSnapshot: async (snapshot) => {
    const repo = useConnectionStore.getState().repo;
    if (!repo) return;

    set({
      currentSnapshot: snapshot,
      currentPath: '/',
      currentTree: null,
      selectedNode: null,
      isLoading: true,
      error: null,
    });

    try {
      const result = await repo.browsePath(snapshot, '/');
      set({ currentTree: result.tree, isLoading: false });
    } catch (err) {
      const error = err as Error;
      set({ error: error.message, isLoading: false });
    }
  },

  navigateTo: async (path) => {
    const repo = useConnectionStore.getState().repo;
    const { currentSnapshot } = get();
    if (!repo || !currentSnapshot) return;

    set({
      currentPath: path,
      selectedNode: null,
      isLoading: true,
      error: null,
    });

    try {
      const result = await repo.browsePath(currentSnapshot, path);
      set({ currentTree: result.tree, isLoading: false });
    } catch (err) {
      const error = err as Error;
      set({ error: error.message, isLoading: false });
    }
  },

  selectNode: (node) => {
    set({ selectedNode: node });
  },

  downloadFile: async () => {
    const repo = useConnectionStore.getState().repo;
    const { selectedNode } = get();
    
    if (!repo || !selectedNode || selectedNode.type !== 'file') return;

    set({ isDownloading: true });

    try {
      const data = await repo.downloadFile(selectedNode);
      
      // Create download link
      const blob = new Blob([data.buffer]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = selectedNode.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      set({ isDownloading: false });
    } catch (err) {
      const error = err as Error;
      set({ isDownloading: false, error: error.message });
      throw error; // Re-throw for UI to handle
    }
  },

  clear: () => {
    set({
      currentSnapshot: null,
      currentPath: '/',
      currentTree: null,
      selectedNode: null,
      error: null,
    });
  },
}));
