/**
 * Connection Store - manages S3 connection form state and connection status
 */

import { create } from 'zustand';
import type { S3Config } from '../lib/types';
import type { RepoConfig } from '../lib/config';
import { Repository } from '../lib/repository';

interface ConnectionState {
  // Form fields
  endpoint: string;
  bucket: string;
  prefix: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  password: string;
  configName: string;

  // Connection state
  isConnecting: boolean;
  isConnected: boolean;
  error: string | null;
  repo: Repository | null;

  // Actions
  setField: (field: keyof Pick<ConnectionState, 'endpoint' | 'bucket' | 'prefix' | 'region' | 'accessKeyId' | 'secretAccessKey' | 'password' | 'configName'>, value: string) => void;
  setError: (error: string | null) => void;
  connect: () => Promise<Repository | null>;
  disconnect: () => void;
  loadConfig: (config: RepoConfig) => void;
  getFormConfig: () => RepoConfig;
  getS3Config: () => S3Config;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  // Initial form values
  endpoint: '',
  bucket: '',
  prefix: '',
  region: '',
  accessKeyId: '',
  secretAccessKey: '',
  password: '',
  configName: 'default',

  // Initial connection state
  isConnecting: false,
  isConnected: false,
  error: null,
  repo: null,

  setField: (field, value) => set({ [field]: value }),

  setError: (error) => set({ error }),

  connect: async () => {
    const state = get();
    const { endpoint, bucket, accessKeyId, secretAccessKey, password } = state;

    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey || !password) {
      set({ error: 'Please fill in all required fields' });
      return null;
    }

    set({ isConnecting: true, error: null });

    try {
      const s3Config = state.getS3Config();
      const repo = new Repository(s3Config);
      await repo.open(password);

      set({
        isConnecting: false,
        isConnected: true,
        repo,
        error: null,
      });

      return repo;
    } catch (err) {
      const error = err as Error;
      set({
        isConnecting: false,
        error: error.message,
      });
      return null;
    }
  },

  disconnect: () => {
    set({
      isConnected: false,
      repo: null,
      error: null,
    });
  },

  loadConfig: (config) => {
    set({
      configName: config.name || 'default',
      endpoint: config.endpoint || '',
      bucket: config.bucket || '',
      prefix: config.prefix || '',
      region: config.region || '',
      accessKeyId: config.accessKeyId || '',
      secretAccessKey: config.secretAccessKey || '',
      password: config.password || '',
    });
  },

  getFormConfig: () => {
    const state = get();
    return {
      name: state.configName || 'default',
      endpoint: state.endpoint,
      bucket: state.bucket,
      prefix: state.prefix || undefined,
      region: state.region || undefined,
      accessKeyId: state.accessKeyId,
      secretAccessKey: state.secretAccessKey,
      password: state.password,
    } as RepoConfig;
  },

  getS3Config: () => {
    const state = get();
    return {
      endpoint: state.endpoint,
      bucket: state.bucket,
      prefix: state.prefix || undefined,
      region: state.region || undefined,
      accessKeyId: state.accessKeyId,
      secretAccessKey: state.secretAccessKey,
      usePathStyle: true,
    };
  },
}));
