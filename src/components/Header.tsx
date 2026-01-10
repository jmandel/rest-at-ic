import React from 'react';
import { useConnectionStore } from '../store';

export function Header() {
  const { isConnected, bucket } = useConnectionStore();

  return (
    <header>
      <h1>🗄️ Restic Browser</h1>
      <span className={`status ${isConnected ? 'connected' : ''}`}>
        {isConnected ? `Connected to ${bucket}` : 'Not connected'}
      </span>
    </header>
  );
}
