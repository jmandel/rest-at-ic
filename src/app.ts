/**
 * Restic Browser Web Application
 */

import { Repository } from './lib/repository';
import type { S3Config, SnapshotWithId, Node, Tree } from './lib/types';
import {
  type RepoConfig,
  getActiveConfig,
  getConfigFromHash,
  getHashInfo,
  getEncryptedConfigFromHash,
  generateShareableUrl,
  generateShareableUrlEncrypted,
  saveConfigToStorage,
  loadConfigsFromStorage,
  deleteConfigFromStorage,
} from './lib/config';

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
const copyLinkBtn = document.getElementById('copy-link-btn')!;
const saveConfigBtn = document.getElementById('save-config-btn')!;
const configNameInput = document.getElementById('config-name') as HTMLInputElement;
const savedConfigsSelect = document.getElementById('saved-configs') as HTMLSelectElement;
const loadConfigBtn = document.getElementById('load-config-btn')!;
const deleteConfigBtn = document.getElementById('delete-config-btn')!;

// Encryption modal elements
const encryptModal = document.getElementById('encrypt-modal')!;
const encryptPassword = document.getElementById('encrypt-password') as HTMLInputElement;
const encryptPasswordConfirm = document.getElementById('encrypt-password-confirm') as HTMLInputElement;
const encryptCheckbox = document.getElementById('encrypt-link-checkbox') as HTMLInputElement;
const encryptError = document.getElementById('encrypt-error')!;
const encryptCancelBtn = document.getElementById('encrypt-cancel-btn')!;
const encryptConfirmBtn = document.getElementById('encrypt-confirm-btn')!;

// Decryption modal elements
const decryptModal = document.getElementById('decrypt-modal')!;
const decryptPassword = document.getElementById('decrypt-password') as HTMLInputElement;
const decryptError = document.getElementById('decrypt-error')!;
const decryptCancelBtn = document.getElementById('decrypt-cancel-btn')!;
const decryptConfirmBtn = document.getElementById('decrypt-confirm-btn')!;

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

function showError(el: HTMLElement, message: string, details?: string) {
  if (details) {
    el.innerHTML = `${escapeHtml(message)}<div class="error-details">${escapeHtml(details)}</div>`;
  } else {
    el.textContent = message;
  }
  el.classList.remove('hidden');
}

function hideError(el: HTMLElement) {
  el.classList.add('hidden');
}

// Password visibility toggle
document.querySelectorAll('.show-password-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.getAttribute('data-target');
    if (targetId) {
      const input = document.getElementById(targetId) as HTMLInputElement;
      if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '🙈';
      } else {
        input.type = 'password';
        btn.textContent = '👁️';
      }
    }
  });
});

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
  const region = (document.getElementById('region') as HTMLInputElement).value.trim();
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
      region: region || undefined,
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
    const error = err as Error;
    showError(connectError, 'Connection failed', error.message);
    console.error('Connection error:', err);
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

// Toast notification
function showToast(message: string, type: 'success' | 'info' = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => toast.remove(), 3000);
}

// Get current form values as RepoConfig
function getFormConfig(): RepoConfig {
  return {
    name: configNameInput.value.trim() || 'default',
    endpoint: (document.getElementById('endpoint') as HTMLInputElement).value.trim(),
    bucket: (document.getElementById('bucket') as HTMLInputElement).value.trim(),
    prefix: (document.getElementById('prefix') as HTMLInputElement).value.trim() || undefined,
    region: (document.getElementById('region') as HTMLInputElement).value.trim() || undefined,
    accessKeyId: (document.getElementById('accessKeyId') as HTMLInputElement).value.trim(),
    secretAccessKey: (document.getElementById('secretAccessKey') as HTMLInputElement).value.trim(),
    password: (document.getElementById('password') as HTMLInputElement).value,
  } as RepoConfig;
}

// Populate form from RepoConfig
function setFormConfig(config: RepoConfig) {
  configNameInput.value = config.name || 'default';
  (document.getElementById('endpoint') as HTMLInputElement).value = config.endpoint || '';
  (document.getElementById('bucket') as HTMLInputElement).value = config.bucket || '';
  (document.getElementById('prefix') as HTMLInputElement).value = config.prefix || '';
  (document.getElementById('region') as HTMLInputElement).value = config.region || '';
  (document.getElementById('accessKeyId') as HTMLInputElement).value = config.accessKeyId || '';
  (document.getElementById('secretAccessKey') as HTMLInputElement).value = config.secretAccessKey || '';
  (document.getElementById('password') as HTMLInputElement).value = config.password || '';
}

// Update saved configs dropdown
function updateSavedConfigsDropdown() {
  const configs = loadConfigsFromStorage();
  savedConfigsSelect.innerHTML = '<option value="">-- Saved Configs --</option>';
  
  for (const name of Object.keys(configs.configs)) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    savedConfigsSelect.appendChild(option);
  }
}

// Copy link button - show encryption modal
copyLinkBtn.addEventListener('click', () => {
  const config = getFormConfig();
  
  if (!config.endpoint || !config.bucket) {
    showToast('Please fill in endpoint and bucket first', 'info');
    return;
  }
  
  // Reset modal state
  encryptPassword.value = '';
  encryptPasswordConfirm.value = '';
  encryptCheckbox.checked = true;
  encryptError.classList.add('hidden');
  encryptModal.classList.remove('hidden');
  encryptPassword.focus();
});

// Encrypt modal - cancel
encryptCancelBtn.addEventListener('click', () => {
  encryptModal.classList.add('hidden');
});

// Encrypt modal - confirm
encryptConfirmBtn.addEventListener('click', async () => {
  const config = getFormConfig();
  const shouldEncrypt = encryptCheckbox.checked;
  const password = encryptPassword.value;
  const passwordConfirm = encryptPasswordConfirm.value;
  
  // Validation
  if (shouldEncrypt) {
    if (!password) {
      encryptError.textContent = 'Please enter a password';
      encryptError.classList.remove('hidden');
      return;
    }
    if (password !== passwordConfirm) {
      encryptError.textContent = 'Passwords do not match';
      encryptError.classList.remove('hidden');
      return;
    }
    if (password.length < 4) {
      encryptError.textContent = 'Password must be at least 4 characters';
      encryptError.classList.remove('hidden');
      return;
    }
  }
  
  encryptError.classList.add('hidden');
  encryptConfirmBtn.textContent = 'Generating...';
  (encryptConfirmBtn as HTMLButtonElement).disabled = true;
  
  try {
    let url: string;
    if (shouldEncrypt) {
      url = await generateShareableUrlEncrypted(config, password);
    } else {
      url = generateShareableUrl(config);
    }
    
    // Copy to clipboard
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback
      const textArea = document.createElement('textarea');
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
    
    encryptModal.classList.add('hidden');
    showToast(shouldEncrypt ? 'Encrypted link copied!' : 'Link copied!', 'success');
  } catch (err) {
    encryptError.textContent = `Error: ${(err as Error).message}`;
    encryptError.classList.remove('hidden');
  } finally {
    encryptConfirmBtn.textContent = 'Copy Link';
    (encryptConfirmBtn as HTMLButtonElement).disabled = false;
  }
});

// Close modal on overlay click
encryptModal.addEventListener('click', (e) => {
  if (e.target === encryptModal) {
    encryptModal.classList.add('hidden');
  }
});

// Decrypt modal handlers
decryptCancelBtn.addEventListener('click', () => {
  decryptModal.classList.add('hidden');
  // Clear the hash since user cancelled
  window.history.replaceState(null, '', window.location.pathname);
});

decryptConfirmBtn.addEventListener('click', async () => {
  const password = decryptPassword.value;
  
  if (!password) {
    decryptError.textContent = 'Please enter the password';
    decryptError.classList.remove('hidden');
    return;
  }
  
  decryptError.classList.add('hidden');
  decryptConfirmBtn.textContent = 'Decrypting...';
  (decryptConfirmBtn as HTMLButtonElement).disabled = true;
  
  try {
    const config = await getEncryptedConfigFromHash(password);
    if (config.active && config.configs[config.active]) {
      setFormConfig(config.configs[config.active]);
      decryptModal.classList.add('hidden');
      showToast('Configuration decrypted!', 'success');
    } else {
      throw new Error('Invalid configuration data');
    }
  } catch (err) {
    decryptError.textContent = 'Incorrect password or corrupted data';
    decryptError.classList.remove('hidden');
  } finally {
    decryptConfirmBtn.textContent = 'Decrypt';
    (decryptConfirmBtn as HTMLButtonElement).disabled = false;
  }
});

decryptModal.addEventListener('click', (e) => {
  if (e.target === decryptModal) {
    decryptModal.classList.add('hidden');
    window.history.replaceState(null, '', window.location.pathname);
  }
});

// Handle Enter key in decrypt modal
decryptPassword.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    decryptConfirmBtn.click();
  }
});

// Handle Enter key in encrypt modal
encryptPasswordConfirm.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    encryptConfirmBtn.click();
  }
});

// Save config button
saveConfigBtn.addEventListener('click', () => {
  const config = getFormConfig();
  
  if (!config.endpoint || !config.bucket) {
    showToast('Please fill in endpoint and bucket first', 'info');
    return;
  }
  
  saveConfigToStorage(config);
  updateSavedConfigsDropdown();
  showToast(`Config "${config.name}" saved!`, 'success');
});

// Load config button
loadConfigBtn.addEventListener('click', () => {
  const selectedName = savedConfigsSelect.value;
  if (!selectedName) {
    showToast('Please select a config to load', 'info');
    return;
  }
  
  const configs = loadConfigsFromStorage();
  const config = configs.configs[selectedName];
  
  if (config) {
    setFormConfig(config);
    showToast(`Config "${selectedName}" loaded!`, 'success');
  }
});

// Delete config button
deleteConfigBtn.addEventListener('click', () => {
  const selectedName = savedConfigsSelect.value;
  if (!selectedName) {
    showToast('Please select a config to delete', 'info');
    return;
  }
  
  if (confirm(`Delete config "${selectedName}"?`)) {
    deleteConfigFromStorage(selectedName);
    updateSavedConfigsDropdown();
    showToast(`Config "${selectedName}" deleted!`, 'success');
  }
});

// Initialize on page load
function initializeFromConfig() {
  const hashInfo = getHashInfo();
  
  // Check if we have an encrypted config in URL
  if (hashInfo.hasConfig && hashInfo.isEncrypted) {
    // Show decrypt modal
    decryptPassword.value = '';
    decryptError.classList.add('hidden');
    decryptModal.classList.remove('hidden');
    decryptPassword.focus();
    return;
  }
  
  // Check for unencrypted config in URL
  if (hashInfo.hasConfig) {
    const hashConfig = getConfigFromHash();
    if (hashConfig && hashConfig.active && hashConfig.configs[hashConfig.active]) {
      const config = hashConfig.configs[hashConfig.active];
      setFormConfig(config);
      showToast(`Loaded config from URL: ${config.name}`, 'success');
      return;
    }
  }
  
  // Then check localStorage for active config
  const activeConfig = getActiveConfig();
  if (activeConfig) {
    setFormConfig(activeConfig);
  }
}

// Update dropdown and load config on page load
updateSavedConfigsDropdown();
initializeFromConfig();
