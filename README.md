# Restic Browser

A browser-based viewer for [restic](https://restic.net/) backup repositories stored on S3-compatible storage.

Browse your restic backups directly in the browser without needing to install restic locally.

## Features

- **S3-compatible backend support** - Works with AWS S3, Backblaze B2, MinIO, and other S3-compatible storage
- **Full encryption support** - AES-256-CTR encryption with Poly1305-AES MAC
- **Repository v1 and v2 support** - Including zstd compression
- **Browse snapshots** - List all snapshots with metadata (time, hostname, tags, paths)
- **Navigate file trees** - Browse directory structures within any snapshot
- **View file metadata** - See file sizes, permissions, timestamps, ownership
- **Download files** - Download individual files from backups
- **Save configurations** - Store connection settings locally or share via encrypted links

## Supported Backends

This browser app works with restic repositories stored on **S3-compatible storage**:

| Provider | Endpoint Format | Notes |
|----------|----------------|-------|
| AWS S3 | `https://s3.amazonaws.com` or `https://s3.REGION.amazonaws.com` | Use region-specific endpoint for best performance |
| Backblaze B2 | `https://s3.REGION.backblazeb2.com` | e.g., `https://s3.us-east-005.backblazeb2.com` |
| MinIO | `http://localhost:9000` or your MinIO server URL | Great for self-hosted |
| Cloudflare R2 | `https://ACCOUNT_ID.r2.cloudflarestorage.com` | |
| Wasabi | `https://s3.REGION.wasabisys.com` | |

**Not supported:** Local filesystem, SFTP, REST server, or other non-S3 backends.

## CORS Configuration (Required)

Since this app runs in the browser, your S3 bucket must be configured to allow cross-origin requests (CORS). Without this, the browser will block all requests to your bucket.

### Required CORS Settings

- **Allowed Origins**: The URL where you're hosting the app (e.g., `https://your-app.example.com`)
- **Allowed Methods**: `GET`, `HEAD`
- **Allowed Headers**: `authorization`, `x-amz-date`, `x-amz-content-sha256`, `content-type`, `range`
- **Expose Headers**: `content-length`, `content-range`, `etag`

---

### Backblaze B2

The B2 web UI doesn't expose all CORS options. You must use the `b2` CLI:

```bash
# Install the CLI
pip install b2  # or: pipx install b2, or: uvx b2

# Authorize (you'll need your B2 application key)
b2 authorize-account

# Set CORS rules (replace YOUR_BUCKET and YOUR_ORIGIN)
b2 bucket update YOUR_BUCKET allPrivate --cors-rules '[{
  "corsRuleName": "resticBrowser",
  "allowedOrigins": ["YOUR_ORIGIN"],
  "allowedOperations": ["s3_head", "s3_get"],
  "allowedHeaders": ["authorization", "x-amz-*", "content-type", "range"],
  "exposeHeaders": ["content-length", "content-range", "etag"],
  "maxAgeSeconds": 3600
}]'
```

**Example** for a bucket named `my-backups` accessed from `https://restic.example.com`:

```bash
b2 bucket update my-backups allPrivate --cors-rules '[{"corsRuleName":"resticBrowser","allowedOrigins":["https://restic.example.com"],"allowedOperations":["s3_head","s3_get"],"allowedHeaders":["authorization","x-amz-*","content-type","range"],"exposeHeaders":["content-length","content-range","etag"],"maxAgeSeconds":3600}]'
```

---

### AWS S3

1. Go to your S3 bucket in the AWS Console
2. Click **Permissions** tab
3. Scroll to **Cross-origin resource sharing (CORS)**
4. Click **Edit** and paste:

```json
[
  {
    "AllowedOrigins": ["https://your-app.example.com"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["authorization", "x-amz-date", "x-amz-content-sha256", "content-type", "range"],
    "ExposeHeaders": ["content-length", "content-range", "etag"],
    "MaxAgeSeconds": 3600
  }
]
```

Or via AWS CLI:

```bash
aws s3api put-bucket-cors --bucket YOUR_BUCKET --cors-configuration '{
  "CORSRules": [{
    "AllowedOrigins": ["https://your-app.example.com"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["authorization", "x-amz-date", "x-amz-content-sha256", "content-type", "range"],
    "ExposeHeaders": ["content-length", "content-range", "etag"],
    "MaxAgeSeconds": 3600
  }]
}'
```

---

### MinIO

Using the MinIO client (`mc`):

```bash
# Add your MinIO server (if not already configured)
mc alias set myminio http://localhost:9000 YOUR_ACCESS_KEY YOUR_SECRET_KEY

# Set CORS configuration
mc admin config set myminio api cors_allow_origin="https://your-app.example.com"
mc admin service restart myminio
```

Or create a `cors.json` file and apply it:

```json
{
  "CORSRules": [{
    "AllowedOrigins": ["https://your-app.example.com"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["content-length", "content-range", "etag"]
  }]
}
```

```bash
mc cors set myminio/YOUR_BUCKET cors.json
```

---

### Cloudflare R2

1. Go to R2 in the Cloudflare dashboard
2. Click your bucket → **Settings** → **CORS Policy**
3. Add a policy:

```json
[
  {
    "AllowedOrigins": ["https://your-app.example.com"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["authorization", "x-amz-date", "x-amz-content-sha256", "content-type", "range"],
    "ExposeHeaders": ["content-length", "content-range", "etag"],
    "MaxAgeSeconds": 3600
  }
]
```

---

## Usage

### Connecting to a Repository

1. Enter your S3 endpoint URL
2. Enter the bucket name containing your restic repository
3. (Optional) Enter a prefix if your repo is in a subdirectory
4. Enter your S3 access key and secret key
5. Enter your restic repository password
6. Click **Connect**

### Saving Configurations

- **Save**: Stores the current connection settings in your browser's localStorage
- **Load**: Loads a previously saved configuration
- **Copy Link**: Creates a shareable URL with your settings (optionally encrypted with a password)

## Development

```bash
# Install dependencies
bun install

# Start development server with hot reload
bun run dev
```

Open http://localhost:8000 in your browser.

### Production Build

```bash
bun run build
```

This creates a bundled JavaScript file in `dist/` that can be served as a static site.

## How It Works

This implementation follows the [restic repository format](https://restic.readthedocs.io/en/stable/100_references.html#repository-format) specification:

1. **Key derivation** - Uses scrypt to derive encryption keys from the repository password
2. **Key file decryption** - Decrypts a key file to obtain the master encryption keys
3. **Data decryption** - Uses AES-256-CTR for encryption and Poly1305-AES for authentication
4. **Index loading** - Loads and parses index files in parallel to locate blobs within pack files
5. **Tree navigation** - Loads tree blobs to navigate the directory structure
6. **File restoration** - Loads and concatenates data blobs to restore files

## Security Notes

- All decryption happens in the browser - encrypted data is fetched from S3 and decrypted locally
- The repository password never leaves your browser
- Credentials can be stored in localStorage (convenient) or kept only in memory
- Shareable links can be encrypted with a password using AES-256-GCM

## Limitations

- **Read-only** - Cannot create backups or modify the repository
- **S3 only** - Does not support local filesystem, SFTP, REST server, or other backends
- **No caching** - Data is re-fetched on each navigation (consider this for metered connections)
- **Large files** - Downloaded entirely into memory before saving

## Dependencies

- [react](https://react.dev/) - UI framework
- [zustand](https://zustand-demo.pmnd.rs/) - State management
- [@noble/hashes](https://github.com/paulmillr/noble-hashes) - scrypt and SHA-256 (audited)
- [aws4fetch](https://github.com/mhart/aws4fetch) - AWS v4 signature for S3 requests
- [fzstd](https://github.com/101arrowz/fzstd) - zstd decompression

## License

MIT
