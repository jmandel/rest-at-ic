# Demo Mode Setup

This directory contains files for running a static demo of the Restic Browser without needing a real S3 backend.

## How It Works

1. **Service Worker (`sw.js`)**: Intercepts S3 list API requests and serves pre-generated XML manifests
2. **Demo Repository (`demo-repo/`)**: A real restic repository with sample data
3. **Manifests (`demo-repo/_manifest/`)**: Pre-generated S3 ListBucket XML responses

## Files

```
demo/
├── sw.js                    # Service worker for intercepting S3 list requests
├── demo-repo/               # Restic repository files
│   ├── _manifest/           # Pre-generated S3 list responses
│   │   ├── keys.xml
│   │   ├── snapshots.xml
│   │   └── index.xml
│   ├── config               # Encrypted repo config
│   ├── keys/                # Key files
│   ├── snapshots/           # Snapshot metadata
│   ├── index/               # Blob index files
│   └── data/                # Pack files with actual data
└── README.md                # This file
```

## Demo Credentials

- **S3 Endpoint**: The URL where the app is hosted (e.g., `https://username.github.io/restic-browser`)
- **Bucket**: `demo-repo`
- **Access Key / Secret Key**: Any value (ignored by service worker)
- **Repository Password**: `demo`

## Sample Data

The demo repository contains 4 snapshots with various tags and hosts:

| Snapshot | Host        | Tags              | Path                    |
|----------|-------------|-------------------|-------------------------|
| 34cb0293 | laptop      | initial, v0.1     | demo-data/project       |
| 4a93b4ba | laptop      | release, v0.2     | demo-data/project       |
| d7e5c797 | server      | docs              | demo-data/docs          |
| 210f74e7 | workstation | config, settings  | demo-data/config        |

## Regenerating the Demo Repo

To regenerate the demo repository with new data:

```bash
# Create sample data
mkdir -p demo-data/{project,docs,config}
echo "# Sample" > demo-data/project/README.md
# ... add more files ...

# Create restic repo
export RESTIC_PASSWORD=demo
restic init -r demo-restic-repo
restic backup -r demo-restic-repo --tag initial --host laptop demo-data/project
# ... more backups ...

# Copy to demo/demo-repo
cp -r demo-restic-repo/* demo/demo-repo/

# Generate manifests
./scripts/generate-manifests.sh demo/demo-repo
```

## Deployment

For GitHub Pages deployment, copy the `demo/` directory contents to your build output:

```bash
# In your build script
cp -r demo/* dist/
```

The service worker is registered in `index.html` and will intercept requests to `/demo-repo`.
