/**
 * Development server with live reload
 */

import { existsSync } from 'fs';
import { join } from 'path';

const PORT = 8000;

const mimeTypes: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.ts': 'application/javascript',
  '.tsx': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    let pathname = url.pathname;
    
    // Default to index.html
    if (pathname === '/') {
      pathname = '/index.html';
    }
    
    const filePath = join(import.meta.dir, 'src', pathname);
    
    // Handle TypeScript/TSX files - transpile on the fly
    if (pathname.endsWith('.ts') || pathname.endsWith('.tsx')) {
      try {
        const result = await Bun.build({
          entrypoints: [filePath],
          target: 'browser',
          format: 'esm',
          minify: false,
          sourcemap: 'inline',
        });
        
        if (result.success && result.outputs.length > 0) {
          const text = await result.outputs[0].text();
          return new Response(text, {
            headers: {
              'Content-Type': 'application/javascript',
              'Cache-Control': 'no-cache',
            },
          });
        } else {
          console.error('Build errors:', result.logs);
          return new Response('Build failed: ' + result.logs.map(l => l.message).join('\n'), { status: 500 });
        }
      } catch (err) {
        console.error('Build error:', err);
        return new Response(`Build error: ${err}`, { status: 500 });
      }
    }
    
    // Serve static files
    if (existsSync(filePath)) {
      const ext = pathname.substring(pathname.lastIndexOf('.'));
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      
      const file = Bun.file(filePath);
      return new Response(file, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache',
        },
      });
    }
    
    return new Response('Not found', { status: 404 });
  },
});

console.log(`🚀 Dev server running at http://localhost:${PORT}`);
console.log(`   Also accessible at https://rest-at-ic.exe.xyz:${PORT}/`);
