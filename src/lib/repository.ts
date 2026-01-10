/**
 * Restic Repository
 * 
 * Main interface for reading from a restic repository.
 */

import type {
  S3Config,
  Config,
  KeyFile,
  Snapshot,
  SnapshotWithId,
  Index,
  IndexPack,
  Tree,
  Node,
  PackedBlob,
  BlobType,
  ID,
} from './types';
import { idFromHex, idToHex, shortId } from './types';
import { S3Backend, type FileType } from './s3';
import { type CryptoKey, decrypt, openKeyFile, EXTENSION } from './crypto';
// sha256 from noble-hashes
import { sha256 } from '@noble/hashes/sha2.js';

// Pack header constants
const HEADER_LENGTH_SIZE = 4; // uint32 at end of pack
const PLAIN_ENTRY_SIZE = 1 + 4 + 32; // type(1) + length(4) + id(32) = 37
const COMPRESSED_ENTRY_SIZE = 1 + 4 + 4 + 32; // type(1) + length(4) + uncompressed(4) + id(32) = 41
const EAGER_ENTRIES = 15;
const EAGER_READ_SIZE = EAGER_ENTRIES * COMPRESSED_ENTRY_SIZE + EXTENSION + HEADER_LENGTH_SIZE;

export class Repository {
  private backend: S3Backend;
  private masterKey: CryptoKey | null = null;
  private config: Config | null = null;
  
  // Index cache: maps blob ID (hex) -> PackedBlob
  private blobIndex: Map<string, PackedBlob> = new Map();
  private indexLoaded = false;

  constructor(s3Config: S3Config) {
    this.backend = new S3Backend(s3Config);
  }

  /**
   * Open the repository with a password
   */
  async open(password: string): Promise<void> {
    // Load and decrypt config (config file is just called 'config' with no extra name)
    const configData = await this.backend.load('config', '');
    
    // First, find a key and unlock
    const keyFiles = await this.backend.list('keys');
    if (keyFiles.length === 0) {
      throw new Error('No key files found in repository');
    }

    let masterKey: CryptoKey | null = null;
    let lastError: Error | null = null;

    for (const keyFileName of keyFiles) {
      try {
        const keyData = await this.backend.load('keys', keyFileName);
        const keyFile: KeyFile = JSON.parse(new TextDecoder().decode(keyData));
        masterKey = await openKeyFile(keyFile, password);
        break; // Success!
      } catch (err) {
        lastError = err as Error;
        // Try next key
      }
    }

    if (!masterKey) {
      throw lastError || new Error('Failed to open any key file');
    }

    this.masterKey = masterKey;

    // Decrypt config
    const configPlaintext = await decrypt(masterKey, configData);
    const configJson = await this.decompressUnpacked(configPlaintext);
    this.config = JSON.parse(new TextDecoder().decode(configJson));

    if (!this.config || this.config.version < 1 || this.config.version > 2) {
      throw new Error(`Unsupported repository version: ${this.config?.version}`);
    }
  }

  /**
   * Decompress unpacked data (for snapshots, indexes, etc.)
   */
  private async decompressUnpacked(data: Uint8Array): Promise<Uint8Array> {
    if (!this.config || this.config.version < 2) {
      return data;
    }

    if (data.length === 0) {
      return data;
    }

    // Check for raw JSON (legacy format)
    if (data[0] === 0x5b /* '[' */ || data[0] === 0x7b /* '{' */) {
      return data;
    }

    // Check version byte
    if (data[0] !== 2) {
      throw new Error(`Unsupported encoding version: ${data[0]}`);
    }

    // Import fzstd for decompression
    const { decompress } = await import('fzstd');
    return decompress(data.slice(1));
  }

  /**
   * Load and decrypt an unpacked file (snapshot, index, etc.)
   */
  private async loadUnpacked(fileType: FileType, name: string): Promise<Uint8Array> {
    if (!this.masterKey) {
      throw new Error('Repository not opened');
    }

    const data = await this.backend.load(fileType, name);
    const plaintext = await decrypt(this.masterKey, data);
    return this.decompressUnpacked(plaintext);
  }

  /**
   * List all snapshots
   */
  async listSnapshots(): Promise<SnapshotWithId[]> {
    const snapshotFiles = await this.backend.list('snapshots');
    const snapshots: SnapshotWithId[] = [];

    for (const snapshotId of snapshotFiles) {
      try {
        const data = await this.loadUnpacked('snapshots', snapshotId);
        const snapshot: Snapshot = JSON.parse(new TextDecoder().decode(data));
        snapshots.push({ ...snapshot, id: snapshotId });
      } catch (err) {
        console.error(`Failed to load snapshot ${snapshotId}:`, err);
      }
    }

    // Sort by time, newest first
    snapshots.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    return snapshots;
  }

  /**
   * Load and build the blob index from all index files
   */
  async loadIndex(): Promise<void> {
    if (this.indexLoaded) return;

    const indexFiles = await this.backend.list('index');
    const superseded = new Set<string>();

    // First pass: collect all superseded indexes
    for (const indexId of indexFiles) {
      try {
        const data = await this.loadUnpacked('index', indexId);
        const index: Index = JSON.parse(new TextDecoder().decode(data));
        if (index.supersedes) {
          for (const id of index.supersedes) {
            superseded.add(id);
          }
        }
      } catch (err) {
        console.error(`Failed to load index ${indexId}:`, err);
      }
    }

    // Second pass: load all non-superseded indexes
    for (const indexId of indexFiles) {
      if (superseded.has(indexId)) continue;

      try {
        const data = await this.loadUnpacked('index', indexId);
        const index: Index = JSON.parse(new TextDecoder().decode(data));

        for (const pack of index.packs) {
          const packId = idFromHex(pack.id);
          
          for (const blob of pack.blobs) {
            const blobId = idFromHex(blob.id);
            this.blobIndex.set(blob.id, {
              id: blobId,
              type: blob.type,
              offset: blob.offset,
              length: blob.length,
              uncompressedLength: blob.uncompressed_length,
              packId,
            });
          }
        }
      } catch (err) {
        console.error(`Failed to process index ${indexId}:`, err);
      }
    }

    this.indexLoaded = true;
  }

  /**
   * Load a blob by ID
   */
  async loadBlob(type: BlobType, id: ID): Promise<Uint8Array> {
    if (!this.masterKey) {
      throw new Error('Repository not opened');
    }

    await this.loadIndex();

    const idHex = idToHex(id);
    const blob = this.blobIndex.get(idHex);
    
    if (!blob) {
      throw new Error(`Blob not found: ${shortId(id)}`);
    }

    if (blob.type !== type) {
      throw new Error(`Blob type mismatch: expected ${type}, got ${blob.type}`);
    }

    // Load the blob data from the pack
    const packIdHex = idToHex(blob.packId);
    const ciphertext = await this.backend.loadPartial(
      'data',
      packIdHex,
      blob.offset,
      blob.length
    );

    // Decrypt the blob
    const plaintext = await decrypt(this.masterKey, ciphertext);

    // Decompress if needed
    if (blob.uncompressedLength && blob.uncompressedLength > 0) {
      const { decompress } = await import('fzstd');
      return decompress(plaintext);
    }

    return plaintext;
  }

  /**
   * Load a tree blob
   */
  async loadTree(id: ID): Promise<Tree> {
    const data = await this.loadBlob('tree', id);
    return JSON.parse(new TextDecoder().decode(data));
  }

  /**
   * Load the root tree for a snapshot
   */
  async loadSnapshotTree(snapshot: SnapshotWithId): Promise<Tree> {
    const treeId = idFromHex(snapshot.tree);
    return this.loadTree(treeId);
  }

  /**
   * Browse a path in a snapshot
   */
  async browsePath(snapshot: SnapshotWithId, path: string): Promise<{ tree: Tree; node?: Node }> {
    let currentTreeId = idFromHex(snapshot.tree);
    let currentTree = await this.loadTree(currentTreeId);
    
    // Clean and split path
    const parts = path.split('/').filter(p => p && p !== '.');
    
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const node = currentTree.nodes.find(n => n.name === name);
      
      if (!node) {
        throw new Error(`Path not found: ${parts.slice(0, i + 1).join('/')}`);
      }

      if (i === parts.length - 1) {
        // This is the target
        if (node.type === 'dir' && node.subtree) {
          const subtreeId = idFromHex(node.subtree);
          const subtree = await this.loadTree(subtreeId);
          return { tree: subtree, node };
        }
        return { tree: currentTree, node };
      }

      // Navigate into directory
      if (node.type !== 'dir' || !node.subtree) {
        throw new Error(`Not a directory: ${parts.slice(0, i + 1).join('/')}`);
      }

      currentTreeId = idFromHex(node.subtree);
      currentTree = await this.loadTree(currentTreeId);
    }

    return { tree: currentTree };
  }

  /**
   * Download a file's content
   */
  async downloadFile(node: Node): Promise<Uint8Array> {
    if (node.type !== 'file') {
      throw new Error('Not a file');
    }

    if (!node.content || node.content.length === 0) {
      return new Uint8Array(0);
    }

    // Load all content blobs and concatenate
    const chunks: Uint8Array[] = [];
    
    for (const blobIdHex of node.content) {
      const blobId = idFromHex(blobIdHex);
      const chunk = await this.loadBlob('data', blobId);
      chunks.push(chunk);
    }

    // Concatenate all chunks
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }

  /**
   * Get repository config
   */
  getConfig(): Config | null {
    return this.config;
  }

  /**
   * Check if repository is opened
   */
  isOpen(): boolean {
    return this.masterKey !== null;
  }
}
