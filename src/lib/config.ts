/**
 * Configuration management for Restic Browser
 * 
 * Handles saving/loading configs to URL hash and localStorage
 * URL configs can be optionally encrypted with a password
 */

export interface RepoConfig {
  name: string;
  endpoint: string;
  bucket: string;
  prefix?: string;
  region?: string;  // Optional - defaults to 'auto'
  accessKeyId: string;
  secretAccessKey: string;
  password: string;
}

export interface ConfigState {
  configs: Record<string, RepoConfig>;
  active?: string;
}

// Encrypted config has a version marker and salt
interface EncryptedPayload {
  v: 1; // version
  s: string; // salt (base64)
  d: string; // encrypted data (base64)
}

/**
 * Derive an AES-GCM key from a password using PBKDF2
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data with a password using AES-GCM
 */
async function encryptWithPassword(data: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);

  const encoder = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(data)
  );

  // Combine IV + ciphertext
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  const payload: EncryptedPayload = {
    v: 1,
    s: bytesToBase64(salt),
    d: bytesToBase64(combined),
  };

  return JSON.stringify(payload);
}

/**
 * Decrypt data with a password using AES-GCM
 */
async function decryptWithPassword(encryptedJson: string, password: string): Promise<string> {
  const payload: EncryptedPayload = JSON.parse(encryptedJson);
  
  if (payload.v !== 1) {
    throw new Error('Unsupported encryption version');
  }

  const salt = base64ToBytes(payload.s);
  const combined = base64ToBytes(payload.d);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const key = await deriveKey(password, salt);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

// Helper functions for base64 encoding
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encode config state to a URL-safe base64 string (unencrypted)
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
 * Decode config state from a URL-safe base64 string (unencrypted)
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

// Prefix for encrypted configs - using '1' since base64 of JSON never starts with '1'
// (JSON starts with '{' or '[' which encode to 'ey' or 'W' in base64)
const ENCRYPTED_PREFIX = '1';

/**
 * Encode config state with password encryption
 */
export async function encodeConfigEncrypted(state: ConfigState, password: string): Promise<string> {
  const json = JSON.stringify(state);
  const encrypted = await encryptWithPassword(json, password);
  // Use base64url encoding
  const base64 = btoa(encrypted)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  // Prefix with '1' to indicate encrypted
  return ENCRYPTED_PREFIX + base64;
}

/**
 * Decode config state with password decryption
 */
export async function decodeConfigEncrypted(encoded: string, password: string): Promise<ConfigState> {
  // Remove prefix
  const base64Part = encoded.substring(ENCRYPTED_PREFIX.length);
  // Restore standard base64
  let base64 = base64Part
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const encryptedJson = atob(base64);
  const json = await decryptWithPassword(encryptedJson, password);
  return JSON.parse(json) as ConfigState;
}

/**
 * Check if a hash value is encrypted (starts with '1')
 */
export function isEncryptedHash(hash: string): boolean {
  return hash.startsWith(ENCRYPTED_PREFIX);
}

// Captured hash from initial page load (cleared from URL immediately)
let capturedHash: string | null = null;

/**
 * Set the captured hash (called from frontend.tsx before URL is cleared)
 */
export function setCapturedHash(hash: string) {
  capturedHash = hash;
}

/**
 * Get config from URL hash (returns info about encryption status)
 * Uses captured hash if available, otherwise falls back to window.location.hash
 */
export function getHashInfo(): { hasConfig: boolean; isEncrypted: boolean; encoded: string } {
  const hash = capturedHash ?? window.location.hash;
  if (!hash || !hash.startsWith('#c=')) {
    return { hasConfig: false, isEncrypted: false, encoded: '' };
  }
  const encoded = hash.substring(3); // Remove '#c='
  return {
    hasConfig: true,
    isEncrypted: isEncryptedHash(encoded),
    encoded,
  };
}

/**
 * Clear the captured hash after it's been used
 */
export function clearCapturedHash() {
  capturedHash = null;
}

/**
 * Get unencrypted config from URL hash
 */
export function getConfigFromHash(): ConfigState | null {
  const { hasConfig, isEncrypted, encoded } = getHashInfo();
  if (!hasConfig || isEncrypted) {
    return null;
  }
  return decodeConfig(encoded);
}

/**
 * Get encrypted config from URL hash (requires password)
 */
export async function getEncryptedConfigFromHash(password: string): Promise<ConfigState> {
  const { hasConfig, isEncrypted, encoded } = getHashInfo();
  if (!hasConfig) {
    throw new Error('No config in URL');
  }
  if (!isEncrypted) {
    throw new Error('Config is not encrypted');
  }
  return decodeConfigEncrypted(encoded, password);
}

/**
 * Set config to URL hash (without triggering navigation)
 */
export function setConfigToHash(encoded: string): void {
  const newHash = `#c=${encoded}`;
  // Use replaceState to avoid adding to browser history
  window.history.replaceState(null, '', newHash);
}

/**
 * Generate a shareable URL with the current config (unencrypted)
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
 * Generate a shareable URL with the current config (encrypted)
 */
export async function generateShareableUrlEncrypted(config: RepoConfig, password: string): Promise<string> {
  const state: ConfigState = {
    configs: {
      [config.name]: config
    },
    active: config.name
  };
  const encoded = await encodeConfigEncrypted(state, password);
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
 * Note: This only returns unencrypted configs. Encrypted configs need
 * to be loaded separately with a password.
 */
export function getActiveConfig(): RepoConfig | null {
  // First check URL hash (only unencrypted)
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
