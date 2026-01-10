import React, { useEffect } from 'react';
import {
  Header,
  ConnectionForm,
  SnapshotList,
  FileBrowser,
  EncryptModal,
  DecryptModal,
  ToastContainer,
} from './components';
import { useConnectionStore, useUIStore } from './store';
import {
  getHashInfo,
  getConfigFromHash,
  getActiveConfig,
} from './lib/config';

export function App() {
  const { isConnected, loadConfig } = useConnectionStore();
  const { openDecryptModal, showToast } = useUIStore();

  // Initialize from URL hash or localStorage on mount
  useEffect(() => {
    const hashInfo = getHashInfo();

    // Check if we have an encrypted config in URL
    if (hashInfo.hasConfig && hashInfo.isEncrypted) {
      openDecryptModal();
      return;
    }

    // Check for unencrypted config in URL
    if (hashInfo.hasConfig) {
      const hashConfig = getConfigFromHash();
      if (hashConfig && hashConfig.active && hashConfig.configs[hashConfig.active]) {
        const config = hashConfig.configs[hashConfig.active];
        loadConfig(config);
        showToast(`Loaded config from URL: ${config.name}`, 'success');
        return;
      }
    }

    // Then check localStorage for active config
    const activeConfig = getActiveConfig();
    if (activeConfig) {
      loadConfig(activeConfig);
    }
  }, []);

  return (
    <div className="container">
      <Header />

      {!isConnected && <ConnectionForm />}

      {isConnected && (
        <>
          <SnapshotList />
          <FileBrowser />
        </>
      )}

      <EncryptModal />
      <DecryptModal />
      <ToastContainer />
    </div>
  );
}
