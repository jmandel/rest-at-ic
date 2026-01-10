import React from 'react';
import { useConnectionStore, useSnapshotStore, useBrowserStore, useUIStore } from '../store';
import { PasswordInput } from './PasswordInput';
import { ConfigManager } from './ConfigManager';

export function ConnectionForm() {
  const {
    endpoint, bucket, prefix, region, accessKeyId, secretAccessKey, password,
    isConnecting, error,
    setField, connect, getFormConfig,
  } = useConnectionStore();
  
  const loadSnapshots = useSnapshotStore((state) => state.loadSnapshots);
  const clearBrowser = useBrowserStore((state) => state.clear);
  const { openEncryptModal, showToast } = useUIStore();

  const handleConnect = async () => {
    clearBrowser();
    const repo = await connect();
    if (repo) {
      await loadSnapshots();
    }
  };

  const handleCopyLink = () => {
    const config = getFormConfig();
    if (!config.endpoint || !config.bucket) {
      showToast('Please fill in endpoint and bucket first', 'info');
      return;
    }
    openEncryptModal();
  };

  return (
    <div className="card">
      <h2>Connect to Repository</h2>
      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="endpoint">S3 Endpoint</label>
          <input
            type="text"
            id="endpoint"
            placeholder="https://s3.amazonaws.com"
            value={endpoint}
            onChange={(e) => setField('endpoint', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="bucket">Bucket</label>
          <input
            type="text"
            id="bucket"
            placeholder="my-restic-repo"
            value={bucket}
            onChange={(e) => setField('bucket', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="prefix">Prefix (optional)</label>
          <input
            type="text"
            id="prefix"
            placeholder="backups/"
            value={prefix}
            onChange={(e) => setField('prefix', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="region">Region (optional)</label>
          <input
            type="text"
            id="region"
            placeholder="auto"
            value={region}
            onChange={(e) => setField('region', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="accessKeyId">Access Key ID</label>
          <input
            type="text"
            id="accessKeyId"
            placeholder="AKIA..."
            value={accessKeyId}
            onChange={(e) => setField('accessKeyId', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="secretAccessKey">Secret Access Key</label>
          <PasswordInput
            id="secretAccessKey"
            placeholder="secret"
            value={secretAccessKey}
            onChange={(value) => setField('secretAccessKey', value)}
          />
        </div>
        <div className="form-group full-width">
          <label htmlFor="password">Repository Password</label>
          <PasswordInput
            id="password"
            placeholder="Enter repository password"
            value={password}
            onChange={(value) => setField('password', value)}
          />
        </div>
      </div>
      
      <div className="btn-row">
        <button onClick={handleConnect} disabled={isConnecting}>
          {isConnecting ? 'Connecting...' : 'Connect'}
        </button>
        <button className="secondary" onClick={handleCopyLink} title="Copy shareable link with credentials">
          📋 Copy Link
        </button>
      </div>
      
      <ConfigManager />
      
      {error && (
        <div className="error">
          Connection failed
          <div className="error-details">{error}</div>
        </div>
      )}
    </div>
  );
}
