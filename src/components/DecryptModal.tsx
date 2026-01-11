import React, { useState } from 'react';
import { Modal } from './Modal';
import { useUIStore, useConnectionStore } from '../store';
import { getEncryptedConfigFromHash, clearCapturedHash } from '../lib/config';

export function DecryptModal() {
  const { decryptModalOpen, closeDecryptModal, showToast } = useUIStore();
  const loadConfig = useConnectionStore((state) => state.loadConfig);

  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isDecrypting, setIsDecrypting] = useState(false);

  const handleClose = () => {
    setPassword('');
    setError('');
    closeDecryptModal();
    // Clear captured hash since user cancelled
    clearCapturedHash();
  };

  const handleSubmit = async () => {
    if (!password) {
      setError('Please enter the password');
      return;
    }

    setError('');
    setIsDecrypting(true);

    try {
      const config = await getEncryptedConfigFromHash(password);
      if (config.active && config.configs[config.active]) {
        // Clear captured hash after successful decryption
        clearCapturedHash();
        
        loadConfig(config.configs[config.active]);
        setPassword('');
        closeDecryptModal();
        showToast('Configuration decrypted!', 'success');
      } else {
        throw new Error('Invalid configuration data');
      }
    } catch (err) {
      setError('Incorrect password or corrupted data');
    } finally {
      setIsDecrypting(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <Modal isOpen={decryptModalOpen} onClose={handleClose}>
      <h3>🔐 Encrypted Configuration</h3>
      <p>This link contains an encrypted configuration. Enter the password to decrypt it.</p>
      
      <div className="form-group">
        <label htmlFor="decrypt-password">Link Password</label>
        <input
          type="password"
          id="decrypt-password"
          placeholder="Enter decryption password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyPress={handleKeyPress}
          autoFocus
        />
      </div>
      
      {error && <div className="error-text">{error}</div>}
      
      <div className="btn-row">
        <button className="secondary" onClick={handleClose}>Cancel</button>
        <button onClick={handleSubmit} disabled={isDecrypting}>
          {isDecrypting ? 'Decrypting...' : 'Decrypt'}
        </button>
      </div>
    </Modal>
  );
}
