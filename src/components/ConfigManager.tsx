import React, { useState, useEffect } from 'react';
import { useConnectionStore, useUIStore } from '../store';
import {
  saveConfigToStorage,
  loadConfigsFromStorage,
  deleteConfigFromStorage,
} from '../lib/config';

export function ConfigManager() {
  const { configName, setField, loadConfig, getFormConfig } = useConnectionStore();
  const showToast = useUIStore((state) => state.showToast);
  
  const [savedConfigs, setSavedConfigs] = useState<string[]>([]);
  const [selectedConfig, setSelectedConfig] = useState('');

  // Load saved configs on mount
  useEffect(() => {
    updateSavedConfigs();
  }, []);

  const updateSavedConfigs = () => {
    const configs = loadConfigsFromStorage();
    setSavedConfigs(Object.keys(configs.configs));
  };

  const handleSave = () => {
    const config = getFormConfig();
    if (!config.endpoint || !config.bucket) {
      showToast('Please fill in endpoint and bucket first', 'info');
      return;
    }
    saveConfigToStorage(config);
    updateSavedConfigs();
    showToast(`Config "${config.name}" saved!`, 'success');
  };

  const handleLoad = () => {
    if (!selectedConfig) {
      showToast('Please select a config to load', 'info');
      return;
    }
    const configs = loadConfigsFromStorage();
    const config = configs.configs[selectedConfig];
    if (config) {
      loadConfig(config);
      showToast(`Config "${selectedConfig}" loaded!`, 'success');
    }
  };

  const handleDelete = () => {
    if (!selectedConfig) {
      showToast('Please select a config to delete', 'info');
      return;
    }
    if (confirm(`Delete config "${selectedConfig}"?`)) {
      deleteConfigFromStorage(selectedConfig);
      updateSavedConfigs();
      setSelectedConfig('');
      showToast(`Config "${selectedConfig}" deleted!`, 'success');
    }
  };

  return (
    <div className="config-actions">
      <label htmlFor="config-name" style={{ fontSize: '0.85em', color: 'var(--text-secondary)' }}>
        Config:
      </label>
      <input
        type="text"
        id="config-name"
        placeholder="default"
        value={configName}
        onChange={(e) => setField('configName', e.target.value)}
        style={{ width: '120px', padding: '6px 10px', fontSize: '0.85em' }}
      />
      <select
        className="config-select"
        value={selectedConfig}
        onChange={(e) => setSelectedConfig(e.target.value)}
      >
        <option value="">-- Saved Configs --</option>
        {savedConfigs.map((name) => (
          <option key={name} value={name}>{name}</option>
        ))}
      </select>
      <button className="icon-btn" onClick={handleLoad} title="Load selected config">
        📂 Load
      </button>
      <button className="icon-btn danger" onClick={handleDelete} title="Delete selected config">
        🗑️
      </button>
    </div>
  );
}
