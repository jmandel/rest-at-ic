// Restic Types

// ID is a 32-byte SHA-256 hash
export type ID = Uint8Array;

export function idFromHex(hex: string): ID {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function idToHex(id: ID): string {
  return Array.from(id)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function idEqual(a: ID, b: ID): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function shortId(id: ID): string {
  return idToHex(id).substring(0, 8);
}

// Repository config
export interface Config {
  version: number;
  id: string;
  chunker_polynomial: string;
}

// Master key structure
export interface MasterKey {
  mac: {
    k: string; // base64
    r: string; // base64
  };
  encrypt: string; // base64
}

// Key file structure  
export interface KeyFile {
  created: string;
  username: string;
  hostname: string;
  kdf: string;
  N: number;
  r: number;
  p: number;
  salt: string; // base64
  data: string; // base64 encrypted master key
}

// Blob types
export type BlobType = 'data' | 'tree';

export interface Blob {
  id: ID;
  type: BlobType;
  offset: number;
  length: number;
  uncompressedLength?: number;
}

export interface PackedBlob extends Blob {
  packId: ID;
}

// Index file structure
export interface IndexBlob {
  id: string;
  type: BlobType;
  offset: number;
  length: number;
  uncompressed_length?: number;
}

export interface IndexPack {
  id: string;
  blobs: IndexBlob[];
}

export interface Index {
  supersedes?: string[];
  packs: IndexPack[];
}

// Snapshot structure
export interface Snapshot {
  time: string;
  parent?: string;
  tree: string;
  paths: string[];
  hostname?: string;
  username?: string;
  uid?: number;
  gid?: number;
  excludes?: string[];
  tags?: string[];
  original?: string;
  program_version?: string;
  summary?: SnapshotSummary;
}

export interface SnapshotWithId extends Snapshot {
  id: string;
}

export interface SnapshotSummary {
  backup_start: string;
  backup_end: string;
  files_new: number;
  files_changed: number;
  files_unmodified: number;
  dirs_new: number;
  dirs_changed: number;
  dirs_unmodified: number;
  data_blobs: number;
  tree_blobs: number;
  data_added: number;
  data_added_packed: number;
  total_files_processed: number;
  total_bytes_processed: number;
}

// Tree/Node structures
export type NodeType = 'file' | 'dir' | 'symlink' | 'dev' | 'chardev' | 'fifo' | 'socket' | 'irregular';

export interface Node {
  name: string;
  type: NodeType;
  mode?: number;
  mtime?: string;
  atime?: string;
  ctime?: string;
  uid?: number;
  gid?: number;
  user?: string;
  group?: string;
  inode?: number;
  device_id?: number;
  size?: number;
  links?: number;
  linktarget?: string;
  linktarget_raw?: string; // base64
  content?: string[]; // array of blob IDs as hex strings
  subtree?: string; // tree blob ID as hex string
  error?: string;
}

export interface Tree {
  nodes: Node[];
}

// S3 backend config
export interface S3Config {
  endpoint: string;
  bucket: string;
  prefix?: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;  // Optional - defaults to 'auto' which works for most S3-compatible services
  usePathStyle?: boolean;
}
