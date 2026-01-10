import React, { useState } from 'react';
import { Modal } from './Modal';
import { useUIStore, useConnectionStore } from '../store';
import { generateShareableUrl, generateShareableUrlEncrypted } from '../lib/config';

export function EncryptModal() {
  const { encryptModalOpen, closeEncryptModal, showToast } = useUIStore();
  const getFormConfig = useConnectionStore((state) => state.getFormConfig);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [encrypt, setEncrypt] = useState(true);
  const [error, setError] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleClose = () => {
    setPassword('');
    setConfirmPassword('');
    setError('');
    closeEncryptModal();
  };

  const handleSubmit = async () => {
    const config = getFormConfig();

    if (encrypt) {
      if (!password) {
        setError('Please enter a password');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
      if (password.length < 4) {
        setError('Password must be at least 4 characters');
        return;
      }
    }

    setError('');
    setIsGenerating(true);

    try {
      let url: string;
      if (encrypt) {
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

      handleClose();
      showToast(encrypt ? 'Encrypted link copied!' : 'Link copied!', 'success');
    } catch (err) {
      setError(`Error: ${(err as Error).message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <Modal isOpen={encryptModalOpen} onClose={handleClose}>
      <h3>🔐 Create Encrypted Link</h3>
      <p>Enter a password to encrypt the shareable link. Anyone with the link will need this password to access the configuration.</p>
      
      <div className="form-group">
        <label htmlFor="encrypt-password">Link Password</label>
        <input
          type="password"
          id="encrypt-password"
          placeholder="Enter encryption password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={!encrypt}
        />
      </div>
      
      <div className="form-group">
        <label htmlFor="encrypt-password-confirm">Confirm Password</label>
        <input
          type="password"
          id="encrypt-password-confirm"
          placeholder="Confirm password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={!encrypt}
        />
      </div>
      
      <div className="checkbox-group">
        <input
          type="checkbox"
          id="encrypt-link-checkbox"
          checked={encrypt}
          onChange={(e) => setEncrypt(e.target.checked)}
        />
        <label htmlFor="encrypt-link-checkbox">Encrypt the link (uncheck for plain link)</label>
      </div>
      
      {error && <div className="error-text">{error}</div>}
      
      <div className="btn-row">
        <button className="secondary" onClick={handleClose}>Cancel</button>
        <button onClick={handleSubmit} disabled={isGenerating}>
          {isGenerating ? 'Generating...' : 'Copy Link'}
        </button>
      </div>
    </Modal>
  );
}
