import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { setCapturedHash } from './lib/config';
// CSS is loaded via <link> in index.html

// Immediately capture and clear any config hash from URL
// to prevent browser from saving credentials in history
if (window.location.hash.startsWith('#c=')) {
  setCapturedHash(window.location.hash);
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

const root = createRoot(container);
root.render(<App />);
