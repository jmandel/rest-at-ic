# Restic Browser

A TypeScript/browser-based viewer for [restic](https://restic.net/) backup repositories.

Browse your restic backups directly in the browser without needing to install restic locally.

## Features

- **S3-compatible backend support** - Works with AWS S3, MinIO, and other S3-compatible storage
- **Full encryption support** - AES-256-CTR encryption with Poly1305-AES MAC
- **Repository v1 and v2 support** - Including zstd compression
- **Browse snapshots** - List all snapshots with metadata (time, hostname, tags, paths)
- **Navigate file trees** - Browse directory structures within any snapshot
- **View file metadata** - See file sizes, permissions, timestamps, ownership
- **Download files** - Download individual files from backups

## Usage

### Development

```bash
# Install dependencies
bun install

# Start development server
bun run dev
```

Open http://localhost:8000 in your browser.

### Production Build

```bash
bun run build
```

This creates a bundled JavaScript file in `dist/` that can be served as a static site.

## Configuration

To connect to a repository, you'll need:

1. **S3 Endpoint** - The URL of your S3-compatible storage (e.g., `https://s3.amazonaws.com` or `http://localhost:9000` for MinIO)
2. **Bucket** - The name of the S3 bucket containing your restic repository
3. **Prefix** (optional) - If your repo is in a subdirectory of the bucket
4. **Region** - The AWS region (default: `us-east-1`)
5. **Access Key ID** - Your S3 access key
6. **Secret Access Key** - Your S3 secret key
7. **Repository Password** - The password used when the restic repo was created

## How It Works

This implementation follows the [restic repository format](https://restic.readthedocs.io/en/stable/100_references.html#repository-format) specification:

1. **Key derivation** - Uses scrypt to derive encryption keys from the repository password
2. **Key file decryption** - Decrypts a key file to obtain the master encryption keys
3. **Data decryption** - Uses AES-256-CTR for encryption and Poly1305-AES for authentication
4. **Index loading** - Loads and parses index files to locate blobs within pack files
5. **Tree navigation** - Loads tree blobs to navigate the directory structure
6. **File restoration** - Loads and concatenates data blobs to restore files

## Security Notes

- Credentials are only stored in browser memory and localStorage (for convenience on reload)
- All decryption happens in the browser - encrypted data is fetched from S3 and decrypted locally
- The repository password never leaves your browser

## Limitations

This is an MVP implementation with some limitations:

- Read-only - cannot create backups or modify the repository
- Single-threaded blob loading - large files may be slow to download
- No local caching - data is re-fetched on each navigation
- S3 only - does not support other backends (local, SFTP, REST, etc.)

## Dependencies

- [@noble/hashes](https://github.com/paulmillr/noble-hashes) - scrypt and SHA-256
- [aws4fetch](https://github.com/mhart/aws4fetch) - AWS v4 signature for S3 requests  
- [fzstd](https://github.com/101arrowz/fzstd) - zstandard decompression

## License

MIT
