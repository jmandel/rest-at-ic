/**
 * Configuration management for Restic Browser
 * 
 * Handles saving/loading configs to URL hash and localStorage
 */

export interface RepoConfig {
  name: string;
  endpoint: string;
  bucket: string;
  prefix?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  password: string;
}

export interface ConfigState {
  configs: Record<string, RepoConfig>;
  active?: string;
}

/**
 * Encode config state to a URL-safe base64 string
 */
export function encodeConfig(state: ConfigState): string {
  const json = JSON.stringify(state);
  // Use base64url encoding (URL-safe)
  const base64 = btoa(json)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return base64;
}

/**
 * Decode config state from a URL-safe base64 string
 */
export function decodeConfig(encoded: string): ConfigState | null {
  try {
    // Restore standard base64
    let base64 = encoded
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    // Add padding if needed
    while (base64.length % 4) {
      base64 += '=';
    }
    const json = atob(base64);
    return JSON.parse(json) as ConfigState;
  } catch (e) {
    console.error('Failed to decode config:', e);
    return null;
  }
}

/**
 * Get config from URL hash
 */
export function getConfigFromHash(): ConfigState | null {
  const hash = window.location.hash;
  if (!hash || !hash.startsWith('#c=')) {
    return null;
  }
  const encoded = hash.substring(3); // Remove '#c='
  return decodeConfig(encoded);
}

/**
 * Set config to URL hash (without triggering navigation)
 */
export function setConfigToHash(state: ConfigState): void {
  const encoded = encodeConfig(state);
  const newHash = `#c=${encoded}`;
  // Use replaceState to avoid adding to browser history
  window.history.replaceState(null, '', newHash);
}

/**
 * Generate a shareable URL with the current config
 */
export function generateShareableUrl(config: RepoConfig): string {
  const state: ConfigState = {
    configs: {
      [config.name]: config
    },
    active: config.name
  };
  const encoded = encodeConfig(state);
  const baseUrl = window.location.origin + window.location.pathname;
  return `${baseUrl}#c=${encoded}`;
}

/**
 * Save config to localStorage
 */
export function saveConfigToStorage(config: RepoConfig): void {
  const existing = loadConfigsFromStorage();
  existing.configs[config.name] = config;
  existing.active = config.name;
  localStorage.setItem('restic-browser-configs', JSON.stringify(existing));
}

/**
 * Load all configs from localStorage
 */
export function loadConfigsFromStorage(): ConfigState {
  const stored = localStorage.getItem('restic-browser-configs');
  if (stored) {
    try {
      return JSON.parse(stored) as ConfigState;
    } catch {
      // Invalid stored data
    }
  }
  return { configs: {} };
}

/**
 * Delete a config from localStorage
 */
export function deleteConfigFromStorage(name: string): void {
  const existing = loadConfigsFromStorage();
  delete existing.configs[name];
  if (existing.active === name) {
    existing.active = Object.keys(existing.configs)[0];
  }
  localStorage.setItem('restic-browser-configs', JSON.stringify(existing));
}

/**
 * Get the active config (from URL hash first, then localStorage)
 */
export function getActiveConfig(): RepoConfig | null {
  // First check URL hash
  const hashConfig = getConfigFromHash();
  if (hashConfig && hashConfig.active && hashConfig.configs[hashConfig.active]) {
    return hashConfig.configs[hashConfig.active];
  }
  
  // Then check localStorage
  const stored = loadConfigsFromStorage();
  if (stored.active && stored.configs[stored.active]) {
    return stored.configs[stored.active];
  }
  
  // Return first available config
  const names = Object.keys(stored.configs);
  if (names.length > 0) {
    return stored.configs[names[0]];
  }
  
  return null;
}
