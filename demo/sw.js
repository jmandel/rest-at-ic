/**
 * Service Worker for Demo Mode
 * 
 * Intercepts S3-style list requests and serves pre-generated manifest XML files.
 * All other requests pass through to static file hosting.
 */

self.addEventListener('install', (event) => {
  console.log('[SW] Installing demo service worker');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating demo service worker');
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Only intercept S3 list-type requests
  if (url.searchParams.has('list-type')) {
    const prefix = url.searchParams.get('prefix') || '';
    // prefix is like "keys/" or "snapshots/" or "index/"
    const type = prefix.replace(/\/$/, '');
    
    if (type) {
      // Construct path to manifest XML
      // url.pathname is like "/demo-repo" 
      const manifestUrl = `${url.origin}${url.pathname}/_manifest/${type}.xml`;
      console.log(`[SW] List request for ${prefix} -> ${manifestUrl}`);
      
      event.respondWith(
        fetch(manifestUrl).then(response => {
          if (!response.ok) {
            console.error(`[SW] Failed to fetch manifest: ${response.status}`);
          }
          return response;
        }).catch(err => {
          console.error(`[SW] Error fetching manifest:`, err);
          return new Response(`Manifest not found: ${type}`, { status: 404 });
        })
      );
      return;
    }
  }
  
  // All other requests pass through normally
  // This includes file fetches, range requests, etc.
});
