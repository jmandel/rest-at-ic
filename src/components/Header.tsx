import React from 'react';
import { useConnectionStore, useSnapshotStore, useBrowserStore } from '../store';

export function Header() {
  const { isConnected, bucket, disconnect } = useConnectionStore();
  const clearSnapshots = useSnapshotStore((state) => state.clear);
  const clearBrowser = useBrowserStore((state) => state.clear);

  const handleDisconnect = () => {
    clearSnapshots();
    clearBrowser();
    disconnect();
  };

  return (
    <header>
      <h1>🗄️ Restic Browser</h1>
      <div className="header-right">
        <span className={`status ${isConnected ? 'connected' : ''}`}>
          {isConnected ? `Connected to ${bucket}` : 'Not connected'}
        </span>
        {isConnected && (
          <button className="disconnect-btn" onClick={handleDisconnect}>
            Disconnect
          </button>
        )}
      </div>
    </header>
  );
}
