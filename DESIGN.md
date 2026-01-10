# Restic Browser - Design Document

A TypeScript browser-based viewer for [restic](https://restic.net/) backup repositories.

## Overview

This project implements a read-only restic repository client that runs entirely in the browser. It can connect to S3-compatible storage backends, decrypt repository data, and allow users to browse snapshots and download files.

## Restic Repository Format

Full documentation: https://restic.readthedocs.io/en/stable/100_references.html

### Repository Structure

```
/config                    # Encrypted repository configuration
/data/XX/<packid>          # Pack files containing blobs (XX = first 2 chars of ID)
/index/<id>                # Index files mapping blob IDs to pack locations
/keys/<id>                 # Key files (encrypted master keys)
/snapshots/<id>            # Snapshot metadata files
/locks/<id>                # Lock files (not used by this read-only client)
```

### Key Concepts

1. **Blobs**: Chunks of data identified by SHA-256 hash. Two types:
   - `data` blobs: File content chunks
   - `tree` blobs: Directory structure (JSON)

2. **Packs**: Files containing multiple blobs. Format:
   ```
   EncryptedBlob1 || ... || EncryptedBlobN || EncryptedHeader || HeaderLength(4 bytes)
   ```

3. **Index**: Maps blob IDs to pack file locations (pack ID, offset, length)

4. **Snapshots**: JSON documents referencing a root tree blob

5. **Trees**: JSON documents listing directory contents with metadata

### Encryption

- **KDF**: scrypt (N, r, p parameters stored in key file)
- **Encryption**: AES-256-CTR
- **Authentication**: Poly1305-AES MAC
- **Format**: `IV (16 bytes) || Ciphertext || MAC (16 bytes)`

### Compression (Repository v2)

- Unpacked files may be zstd compressed
- First byte indicates format: `[` or `{` = raw JSON, `2` = zstd compressed
- Blob type flags: 0=data, 1=tree, 2=compressed data, 3=compressed tree

## Project Structure

```
src/
├── index.html           # Single-page app HTML and CSS
├── app.ts               # Main application logic and UI
└── lib/
    ├── types.ts         # TypeScript type definitions
    ├── crypto.ts        # Encryption/decryption (AES-CTR, Poly1305, scrypt)
    ├── s3.ts            # S3 backend for fetching repository data
    ├── repository.ts    # Repository operations (open, list, browse)
    └── config.ts        # URL/localStorage config management
```

## Design Decisions

### 1. Browser-Only Implementation

All cryptographic operations happen in the browser using Web Crypto API and noble-hashes. No server-side processing required - the app can be hosted as static files.

### 2. S3-Only Backend

We only support S3-compatible backends because:
- Most cloud restic repos use S3 (AWS, MinIO, Backblaze B2, etc.)
- Browser fetch API works well with S3's HTTP interface
- aws4fetch handles request signing

### 3. Poly1305-AES Implementation

Restic uses Poly1305-AES (not Poly1305-ChaCha20). We implemented this using:
- Web Crypto API for AES encryption of the nonce
- BigInt-based Poly1305 core for correctness over performance

### 4. Index-Based Blob Lookup

We load all index files into memory to build a blob lookup table. This trades memory for speed - necessary for responsive file browsing.

### 5. Shareable Encrypted URLs

Configuration can be encoded in the URL hash fragment:
- Unencrypted: `#c=<base64json>` - convenient but exposes credentials
- Encrypted: `#c=e<base64>` - AES-256-GCM with PBKDF2 key derivation

The hash fragment is never sent to the server, providing some privacy.

### 6. Vanilla TypeScript (No Framework)

The initial implementation uses vanilla TypeScript without React/Vue/etc. This keeps the bundle small (~100KB) but makes complex UI harder to maintain. Consider migrating to React if the UI grows more complex.

## Key Files Reference

### `src/lib/crypto.ts`
- `deriveKey()`: scrypt KDF for password → encryption keys
- `decrypt()`: AES-256-CTR decryption with Poly1305-AES verification
- `openKeyFile()`: Decrypt key file to get master keys
- `poly1305BigInt()`: Poly1305 MAC using BigInt arithmetic

### `src/lib/repository.ts`
- `Repository.open()`: Connect and decrypt repository
- `Repository.listSnapshots()`: List all snapshots
- `Repository.loadIndex()`: Build blob lookup from index files
- `Repository.loadTree()`: Load and parse tree blobs
- `Repository.browsePath()`: Navigate to a path within a snapshot
- `Repository.downloadFile()`: Reconstruct file from data blobs

### `src/lib/s3.ts`
- `S3Backend`: Handles S3 API calls with AWS v4 signing
- `load()`: Fetch complete files
- `loadPartial()`: Range requests for blob extraction
- `list()`: List objects in a prefix

### `src/lib/config.ts`
- `encodeConfigEncrypted()`: Encrypt config with AES-GCM
- `decodeConfigEncrypted()`: Decrypt config
- `generateShareableUrl()`: Create shareable URL with config

## Limitations

1. **Read-only**: Cannot create backups or modify repository
2. **No streaming**: Files are fully loaded into memory before download
3. **No caching**: Data is re-fetched on each navigation
4. **S3 only**: No support for local, SFTP, REST, or other backends
5. **No locks**: Doesn't check or create lock files

## Dependencies

- `@noble/hashes`: scrypt and SHA-256 (audited, minimal)
- `aws4fetch`: AWS v4 request signing for S3
- `fzstd`: zstd decompression for repository v2

## Running

```bash
# Development
bun install
bun run dev

# Production build
bun run build
# Serve dist/app.js and src/index.html as static files
```

## Testing with MinIO

```bash
# Start MinIO
minio server /data --address :9000

# Create test repo
export AWS_ACCESS_KEY_ID=minioadmin
export AWS_SECRET_ACCESS_KEY=minioadmin
export RESTIC_PASSWORD=testpassword
restic -r s3:http://localhost:9000/bucket init
restic -r s3:http://localhost:9000/bucket backup /path/to/data

# Make bucket public for browser access (or configure CORS)
mc anonymous set public local/bucket
```
