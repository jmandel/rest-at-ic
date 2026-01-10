/**
 * Restic Crypto Implementation
 * 
 * Implements:
 * - scrypt KDF for password derivation
 * - AES-256-CTR for encryption
 * - Poly1305-AES for MAC
 */

import { scrypt } from '@noble/hashes/scrypt.js';
import type { MasterKey, KeyFile } from './types';

// Constants
const AES_KEY_SIZE = 32; // AES-256
const MAC_KEY_K_SIZE = 16; // AES-128 key for Poly1305
const MAC_KEY_R_SIZE = 16; // Poly1305 r key
const IV_SIZE = 16; // AES block size
const MAC_SIZE = 16; // Poly1305 tag size
export const EXTENSION = IV_SIZE + MAC_SIZE; // Encryption overhead

export interface CryptoKey {
  encryptionKey: Uint8Array; // 32 bytes for AES-256
  macKeyK: Uint8Array; // 16 bytes for Poly1305-AES
  macKeyR: Uint8Array; // 16 bytes for Poly1305
}

/**
 * Derive encryption keys from password using scrypt
 */
export async function deriveKey(
  password: string,
  salt: Uint8Array,
  N: number,
  r: number,
  p: number
): Promise<CryptoKey> {
  const keyBytes = AES_KEY_SIZE + MAC_KEY_K_SIZE + MAC_KEY_R_SIZE; // 64 bytes
  
  const derived = scrypt(new TextEncoder().encode(password), salt, {
    N,
    r,
    p,
    dkLen: keyBytes,
  });

  return {
    encryptionKey: derived.slice(0, AES_KEY_SIZE),
    macKeyK: derived.slice(AES_KEY_SIZE, AES_KEY_SIZE + MAC_KEY_K_SIZE),
    macKeyR: derived.slice(AES_KEY_SIZE + MAC_KEY_K_SIZE),
  };
}

/**
 * Create a CryptoKey from MasterKey JSON
 */
export function masterKeyToCryptoKey(master: MasterKey): CryptoKey {
  return {
    encryptionKey: base64ToBytes(master.encrypt),
    macKeyK: base64ToBytes(master.mac.k),
    macKeyR: base64ToBytes(master.mac.r),
  };
}

/**
 * AES-CTR encryption/decryption
 */
async function aesCtr(
  key: Uint8Array,
  iv: Uint8Array,
  data: Uint8Array
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength),
    { name: 'AES-CTR' },
    false,
    ['encrypt', 'decrypt']
  );

  // AES-CTR works the same for encrypt and decrypt
  const result = await crypto.subtle.encrypt(
    {
      name: 'AES-CTR',
      counter: iv,
      length: 128, // Counter block size in bits
    },
    cryptoKey,
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  );

  return new Uint8Array(result);
}

/**
 * Simple Poly1305 implementation
 * Based on the original paper by D. J. Bernstein
 */
function clamp(r: Uint8Array): void {
  r[3] &= 15;
  r[7] &= 15;
  r[11] &= 15;
  r[15] &= 15;
  r[4] &= 252;
  r[8] &= 252;
  r[12] &= 252;
}

function poly1305Core(msg: Uint8Array, key: Uint8Array): Uint8Array {
  // key is 32 bytes: r (16 bytes) || s (16 bytes)
  const r = new Uint8Array(key.slice(0, 16));
  const s = key.slice(16, 32);
  
  clamp(r);
  
  // Convert r to number array for big integer math
  let h0 = 0, h1 = 0, h2 = 0, h3 = 0, h4 = 0;
  
  const r0 = (r[0] | (r[1] << 8) | (r[2] << 16) | (r[3] << 24)) >>> 0;
  const r1 = (r[4] | (r[5] << 8) | (r[6] << 16) | (r[7] << 24)) >>> 0;
  const r2 = (r[8] | (r[9] << 8) | (r[10] << 16) | (r[11] << 24)) >>> 0;
  const r3 = (r[12] | (r[13] << 8) | (r[14] << 16) | (r[15] << 24)) >>> 0;
  
  const s0 = (s[0] | (s[1] << 8) | (s[2] << 16) | (s[3] << 24)) >>> 0;
  const s1 = (s[4] | (s[5] << 8) | (s[6] << 16) | (s[7] << 24)) >>> 0;
  const s2 = (s[8] | (s[9] << 8) | (s[10] << 16) | (s[11] << 24)) >>> 0;
  const s3 = (s[12] | (s[13] << 8) | (s[14] << 16) | (s[15] << 24)) >>> 0;
  
  // Process message in 16-byte blocks
  for (let i = 0; i < msg.length; i += 16) {
    const remaining = Math.min(16, msg.length - i);
    
    // Read block with padding
    let m0 = 0, m1 = 0, m2 = 0, m3 = 0;
    for (let j = 0; j < remaining && j < 4; j++) m0 |= msg[i + j] << (j * 8);
    for (let j = 4; j < remaining && j < 8; j++) m1 |= msg[i + j] << ((j - 4) * 8);
    for (let j = 8; j < remaining && j < 12; j++) m2 |= msg[i + j] << ((j - 8) * 8);
    for (let j = 12; j < remaining && j < 16; j++) m3 |= msg[i + j] << ((j - 12) * 8);
    
    // Add high bit
    const hibit = remaining < 16 ? 0 : 1;
    if (remaining <= 4) m1 |= hibit << ((remaining - 4 >= 0 ? remaining - 4 : remaining) * 8);
    else if (remaining <= 8) m2 |= hibit << ((remaining - 8) * 8);
    else if (remaining <= 12) m3 |= hibit << ((remaining - 12) * 8);
    else m3 |= hibit << ((remaining - 12) * 8);
    
    if (remaining < 16) {
      // Add 1 byte at position remaining
      if (remaining < 4) m0 |= 1 << (remaining * 8);
      else if (remaining < 8) m1 |= 1 << ((remaining - 4) * 8);
      else if (remaining < 12) m2 |= 1 << ((remaining - 8) * 8);
      else m3 |= 1 << ((remaining - 12) * 8);
    }
    
    h0 += m0 >>> 0;
    h1 += m1 >>> 0;
    h2 += m2 >>> 0;
    h3 += m3 >>> 0;
    h4 += hibit;
    
    // This is getting too complex - let's use BigInt for the actual calculation
  }
  
  // For simplicity, use BigInt implementation
  return poly1305BigInt(msg, key);
}

/**
 * Poly1305 using BigInt for correctness
 */
function poly1305BigInt(msg: Uint8Array, key: Uint8Array): Uint8Array {
  const r = key.slice(0, 16);
  const s = key.slice(16, 32);
  
  // Clamp r
  const rClamped = new Uint8Array(r);
  rClamped[3] &= 15;
  rClamped[7] &= 15;
  rClamped[11] &= 15;
  rClamped[15] &= 15;
  rClamped[4] &= 252;
  rClamped[8] &= 252;
  rClamped[12] &= 252;
  
  // Convert to BigInt (little-endian)
  let rBig = 0n;
  for (let i = 15; i >= 0; i--) {
    rBig = (rBig << 8n) | BigInt(rClamped[i]);
  }
  
  let sBig = 0n;
  for (let i = 15; i >= 0; i--) {
    sBig = (sBig << 8n) | BigInt(s[i]);
  }
  
  const p = (1n << 130n) - 5n;
  let h = 0n;
  
  // Process message in 16-byte blocks
  for (let i = 0; i < msg.length; i += 16) {
    const blockLen = Math.min(16, msg.length - i);
    
    // Read block as little-endian
    let n = 0n;
    for (let j = blockLen - 1; j >= 0; j--) {
      n = (n << 8n) | BigInt(msg[i + j]);
    }
    
    // Add high bit
    n |= 1n << BigInt(blockLen * 8);
    
    h = ((h + n) * rBig) % p;
  }
  
  // Final addition of s
  h = (h + sBig) & ((1n << 128n) - 1n);
  
  // Convert back to bytes
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    out[i] = Number((h >> BigInt(i * 8)) & 0xffn);
  }
  
  return out;
}

/**
 * Compute Poly1305-AES MAC
 * 
 * The nonce is encrypted with AES to get the 's' value for Poly1305.
 * MAC = Poly1305(message, r || AES(K, nonce))
 */
async function poly1305Mac(
  message: Uint8Array,
  nonce: Uint8Array,
  macKeyK: Uint8Array,
  macKeyR: Uint8Array
): Promise<Uint8Array> {
  // Encrypt nonce with AES-ECB to get s
  // We use AES-CBC with zero IV to simulate ECB for a single block
  const aesKey = await crypto.subtle.importKey(
    'raw',
    macKeyK.buffer.slice(macKeyK.byteOffset, macKeyK.byteOffset + macKeyK.byteLength),
    { name: 'AES-CBC' },
    false,
    ['encrypt']
  );
  
  const zeroIv = new Uint8Array(16);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv: zeroIv },
    aesKey,
    nonce.buffer.slice(nonce.byteOffset, nonce.byteOffset + nonce.byteLength)
  );
  const s = new Uint8Array(encrypted).slice(0, 16);
  
  // Poly1305 key is r || s (32 bytes)
  const polyKey = new Uint8Array(32);
  polyKey.set(macKeyR, 0);
  polyKey.set(s, 16);
  
  return poly1305BigInt(message, polyKey);
}

/**
 * Verify Poly1305-AES MAC
 */
async function poly1305Verify(
  message: Uint8Array,
  nonce: Uint8Array,
  macKeyK: Uint8Array,
  macKeyR: Uint8Array,
  expectedMac: Uint8Array
): Promise<boolean> {
  const computed = await poly1305Mac(message, nonce, macKeyK, macKeyR);
  
  if (computed.length !== expectedMac.length) return false;
  
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed[i] ^ expectedMac[i];
  }
  return diff === 0;
}

/**
 * Decrypt data encrypted with AES-256-CTR and authenticated with Poly1305-AES
 * 
 * Format: IV (16 bytes) || Ciphertext || MAC (16 bytes)
 */
export async function decrypt(
  key: CryptoKey,
  ciphertext: Uint8Array
): Promise<Uint8Array> {
  if (ciphertext.length < EXTENSION) {
    throw new Error('Ciphertext too short');
  }

  const iv = ciphertext.slice(0, IV_SIZE);
  const mac = ciphertext.slice(ciphertext.length - MAC_SIZE);
  const encryptedData = ciphertext.slice(IV_SIZE, ciphertext.length - MAC_SIZE);

  // Verify MAC first
  const valid = await poly1305Verify(
    encryptedData,
    iv,
    key.macKeyK,
    key.macKeyR,
    mac
  );

  if (!valid) {
    throw new Error('MAC verification failed - wrong password or corrupted data');
  }

  // Decrypt
  return aesCtr(key.encryptionKey, iv, encryptedData);
}

/**
 * Open and decrypt a key file with password
 */
export async function openKeyFile(
  keyFile: KeyFile,
  password: string
): Promise<CryptoKey> {
  if (keyFile.kdf !== 'scrypt') {
    throw new Error(`Unsupported KDF: ${keyFile.kdf}`);
  }

  const salt = base64ToBytes(keyFile.salt);
  const userKey = await deriveKey(password, salt, keyFile.N, keyFile.r, keyFile.p);

  // Decrypt the master key
  const encryptedMasterKey = base64ToBytes(keyFile.data);
  const masterKeyJson = await decrypt(userKey, encryptedMasterKey);
  
  const masterKey: MasterKey = JSON.parse(new TextDecoder().decode(masterKeyJson));
  return masterKeyToCryptoKey(masterKey);
}

// Utility functions
export function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binaryString = '';
  for (let i = 0; i < bytes.length; i++) {
    binaryString += String.fromCharCode(bytes[i]);
  }
  return btoa(binaryString);
}

export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}
