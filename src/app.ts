/**
 * Restic Browser Web Application
 */

import { Repository } from './lib/repository';
import type { S3Config, SnapshotWithId, Node, Tree } from './lib/types';

// UI Elements
const statusEl = document.getElementById('status')!;
const connectFormEl = document.getElementById('connect-form')!;
const connectBtn = document.getElementById('connect-btn') as HTMLButtonElement;
const connectError = document.getElementById('connect-error')!;
const mainContent = document.getElementById('main-content')!;
const snapshotsCard = document.getElementById('snapshots-card')!;
const snapshotsList = document.getElementById('snapshots-list')!;
const browserCard = document.getElementById('browser-card')!;
const browserPath = document.getElementById('browser-path')!;
const fileList = document.getElementById('file-list')!;
const previewPanel = document.getElementById('preview-panel')!;
const previewName = document.getElementById('preview-name')!;
const previewInfo = document.getElementById('preview-info')!;
const downloadBtn = document.getElementById('download-btn')!;

// App State
let repo: Repository | null = null;
let snapshots: SnapshotWithId[] = [];
let currentSnapshot: SnapshotWithId | null = null;
let currentPath: string = '/';
let currentTree: Tree | null = null;
let selectedNode: Node | null = null;

// Utility functions
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString();
}

function getFileIcon(node: Node): string {
  switch (node.type) {
    case 'dir': return '📁';
    case 'file': return '📄';
    case 'symlink': return '🔗';
    default: return '📄';
  }
}

function showError(el: HTMLElement, message: string) {
  el.textContent = message;
  el.classList.remove('hidden');
}

function hideError(el: HTMLElement) {
  el.classList.add('hidden');
}

function setLoading(el: HTMLElement, loading: boolean, message = 'Loading...') {
  if (loading) {
    el.innerHTML = `<div class="loading">${message}</div>`;
  }
}

// Connect to repository
connectBtn.addEventListener('click', async () => {
  const endpoint = (document.getElementById('endpoint') as HTMLInputElement).value.trim();
  const bucket = (document.getElementById('bucket') as HTMLInputElement).value.trim();
  const prefix = (document.getElementById('prefix') as HTMLInputElement).value.trim();
  const region = (document.getElementById('region') as HTMLInputElement).value.trim() || 'us-east-1';
  const accessKeyId = (document.getElementById('accessKeyId') as HTMLInputElement).value.trim();
  const secretAccessKey = (document.getElementById('secretAccessKey') as HTMLInputElement).value.trim();
  const password = (document.getElementById('password') as HTMLInputElement).value;

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey || !password) {
    showError(connectError, 'Please fill in all required fields');
    return;
  }

  hideError(connectError);
  connectBtn.disabled = true;
  connectBtn.textContent = 'Connecting...';

  try {
    const config: S3Config = {
      endpoint,
      bucket,
      prefix: prefix || undefined,
      region,
      accessKeyId,
      secretAccessKey,
      usePathStyle: true,
    };

    repo = new Repository(config);
    await repo.open(password);

    // Connected!
    statusEl.textContent = `Connected to ${bucket}`;
    statusEl.classList.add('connected');
    connectFormEl.classList.add('hidden');
    mainContent.classList.remove('hidden');

    // Load snapshots
    await loadSnapshots();
  } catch (err) {
    showError(connectError, `Connection failed: ${(err as Error).message}`);
    console.error(err);
  } finally {
    connectBtn.disabled = false;
    connectBtn.textContent = 'Connect';
  }
});

// Load and display snapshots
async function loadSnapshots() {
  if (!repo) return;

  setLoading(snapshotsList, true, 'Loading snapshots...');

  try {
    snapshots = await repo.listSnapshots();
    renderSnapshots();
  } catch (err) {
    snapshotsList.innerHTML = `<div class="error">Failed to load snapshots: ${(err as Error).message}</div>`;
  }
}

function renderSnapshots() {
  if (snapshots.length === 0) {
    snapshotsList.innerHTML = '<div class="loading">No snapshots found</div>';
    return;
  }

  snapshotsList.innerHTML = snapshots.map(snapshot => {
    const isActive = currentSnapshot?.id === snapshot.id;
    return `
      <div class="snapshot-item ${isActive ? 'active' : ''}" data-id="${snapshot.id}">
        <span class="snapshot-id">${snapshot.id.substring(0, 8)}</span>
        <span class="snapshot-time">${formatDate(snapshot.time)}</span>
        <span class="snapshot-meta">${snapshot.hostname || 'unknown'}</span>
        <span class="snapshot-paths">${snapshot.paths.join(', ')}</span>
        <span class="snapshot-tags">
          ${(snapshot.tags || []).map(tag => `<span class="tag">${tag}</span>`).join('')}
        </span>
      </div>
    `;
  }).join('');

  // Add click handlers
  snapshotsList.querySelectorAll('.snapshot-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-id');
      const snapshot = snapshots.find(s => s.id === id);
      if (snapshot) {
        selectSnapshot(snapshot);
      }
    });
  });
}

async function selectSnapshot(snapshot: SnapshotWithId) {
  currentSnapshot = snapshot;
  currentPath = '/';
  renderSnapshots(); // Update active state
  
  browserCard.classList.remove('hidden');
  setLoading(fileList, true, 'Loading files...');
  previewPanel.classList.add('hidden');
  selectedNode = null;

  try {
    const result = await repo!.browsePath(snapshot, '/');
    currentTree = result.tree;
    renderFileList();
  } catch (err) {
    fileList.innerHTML = `<div class="error">Failed to load: ${(err as Error).message}</div>`;
  }
}

function renderBrowserPath() {
  const parts = currentPath.split('/').filter(p => p);
  let html = '<span data-path="/">/</span>';
  
  let pathSoFar = '';
  for (const part of parts) {
    pathSoFar += '/' + part;
    html += `<span class="separator">/</span><span data-path="${pathSoFar}">${part}</span>`;
  }
  
  browserPath.innerHTML = html;
  
  // Add click handlers for breadcrumb navigation
  browserPath.querySelectorAll('span[data-path]').forEach(el => {
    el.addEventListener('click', async () => {
      const path = el.getAttribute('data-path');
      if (path) {
        await navigateTo(path);
      }
    });
  });
}

function renderFileList() {
  renderBrowserPath();
  
  if (!currentTree || currentTree.nodes.length === 0) {
    fileList.innerHTML = '<div class="loading">Empty directory</div>';
    return;
  }

  // Sort: directories first, then alphabetically
  const sortedNodes = [...currentTree.nodes].sort((a, b) => {
    if (a.type === 'dir' && b.type !== 'dir') return -1;
    if (a.type !== 'dir' && b.type === 'dir') return 1;
    return a.name.localeCompare(b.name);
  });

  fileList.innerHTML = sortedNodes.map(node => `
    <div class="file-item" data-name="${escapeHtml(node.name)}">
      <span class="file-icon">${getFileIcon(node)}</span>
      <span class="file-name">${escapeHtml(node.name)}</span>
      <span class="file-size">${node.type === 'file' ? formatBytes(node.size || 0) : ''}</span>
      <span class="file-time">${node.mtime ? formatDate(node.mtime) : ''}</span>
    </div>
  `).join('');

  // Add click handlers
  fileList.querySelectorAll('.file-item').forEach(el => {
    el.addEventListener('click', async () => {
      const name = el.getAttribute('data-name');
      const node = currentTree?.nodes.find(n => n.name === name);
      if (node) {
        if (node.type === 'dir') {
          await navigateTo(currentPath === '/' ? '/' + node.name : currentPath + '/' + node.name);
        } else {
          selectNode(node);
        }
      }
    });
  });
}

async function navigateTo(path: string) {
  if (!repo || !currentSnapshot) return;
  
  currentPath = path;
  setLoading(fileList, true, 'Loading...');
  previewPanel.classList.add('hidden');
  selectedNode = null;

  try {
    const result = await repo.browsePath(currentSnapshot, path);
    currentTree = result.tree;
    renderFileList();
  } catch (err) {
    fileList.innerHTML = `<div class="error">Failed to navigate: ${(err as Error).message}</div>`;
  }
}

function selectNode(node: Node) {
  selectedNode = node;
  previewPanel.classList.remove('hidden');
  previewName.textContent = node.name;
  
  const info: { [key: string]: string } = {
    'Type': node.type,
    'Size': formatBytes(node.size || 0),
    'Modified': node.mtime ? formatDate(node.mtime) : 'Unknown',
    'Mode': node.mode ? '0' + node.mode.toString(8) : 'Unknown',
    'UID': String(node.uid ?? 'Unknown'),
    'GID': String(node.gid ?? 'Unknown'),
  };
  
  if (node.user) info['User'] = node.user;
  if (node.group) info['Group'] = node.group;
  if (node.linktarget) info['Link Target'] = node.linktarget;
  if (node.content) info['Chunks'] = String(node.content.length);
  
  previewInfo.innerHTML = Object.entries(info)
    .map(([key, value]) => `<dt>${key}</dt><dd>${escapeHtml(value)}</dd>`)
    .join('');
  
  downloadBtn.classList.toggle('hidden', node.type !== 'file');
}

// Download handler
downloadBtn.addEventListener('click', async () => {
  if (!repo || !selectedNode || selectedNode.type !== 'file') return;
  
  (downloadBtn as HTMLButtonElement).disabled = true;
  downloadBtn.textContent = 'Downloading...';
  
  try {
    const data = await repo.downloadFile(selectedNode);
    
    // Create download link
    const blob = new Blob([data.buffer]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedNode.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    alert(`Download failed: ${(err as Error).message}`);
  } finally {
    (downloadBtn as HTMLButtonElement).disabled = false;
    downloadBtn.textContent = 'Download';
  }
});

// Utility: escape HTML
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Load saved connection settings from localStorage
function loadSavedSettings() {
  const saved = localStorage.getItem('restic-browser-settings');
  if (saved) {
    try {
      const settings = JSON.parse(saved);
      (document.getElementById('endpoint') as HTMLInputElement).value = settings.endpoint || '';
      (document.getElementById('bucket') as HTMLInputElement).value = settings.bucket || '';
      (document.getElementById('prefix') as HTMLInputElement).value = settings.prefix || '';
      (document.getElementById('region') as HTMLInputElement).value = settings.region || 'us-east-1';
      (document.getElementById('accessKeyId') as HTMLInputElement).value = settings.accessKeyId || '';
      // Don't save secrets
    } catch (e) {
      // Ignore
    }
  }
}

// Save settings (excluding secrets)
function saveSettings() {
  const settings = {
    endpoint: (document.getElementById('endpoint') as HTMLInputElement).value,
    bucket: (document.getElementById('bucket') as HTMLInputElement).value,
    prefix: (document.getElementById('prefix') as HTMLInputElement).value,
    region: (document.getElementById('region') as HTMLInputElement).value,
    accessKeyId: (document.getElementById('accessKeyId') as HTMLInputElement).value,
  };
  localStorage.setItem('restic-browser-settings', JSON.stringify(settings));
}

// Save on input change
['endpoint', 'bucket', 'prefix', 'region', 'accessKeyId'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', saveSettings);
});

// Load saved settings on page load
loadSavedSettings();
