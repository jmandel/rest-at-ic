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

// Wait for service worker to be ready before rendering
// This ensures SW can intercept requests for demo mode
async function init() {
  // Wait for SW registration (defined in index.html)
  if ((window as any).swReady) {
    await (window as any).swReady;
  }

  const container = document.getElementById('root');
  if (!container) {
    throw new Error('Root element not found');
  }

  const root = createRoot(container);
  root.render(<App />);
}

init();
