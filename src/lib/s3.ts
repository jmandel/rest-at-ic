/**
 * S3 Backend for Restic
 * 
 * Handles communication with S3-compatible storage.
 */

import type { S3Config } from './types';
import { AwsClient } from 'aws4fetch';

export type FileType = 
  | 'data'      // Pack files in data/XX/
  | 'keys'      // Key files in keys/
  | 'locks'     // Lock files in locks/
  | 'snapshots' // Snapshot files in snapshots/
  | 'index'     // Index files in index/
  | 'config';   // Config file

function getSubdir(fileType: FileType): string {
  switch (fileType) {
    case 'data': return 'data';
    case 'keys': return 'keys';
    case 'locks': return 'locks';
    case 'snapshots': return 'snapshots';
    case 'index': return 'index';
    case 'config': return '';
  }
}

export class S3Backend {
  private client: AwsClient;
  private bucket: string;
  private prefix: string;
  private endpoint: string;
  private usePathStyle: boolean;

  constructor(config: S3Config) {
    this.client = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: config.region || 'auto', // 'auto' works for most S3-compatible services
      service: 's3', // Explicitly set service for non-AWS endpoints
    });
    this.bucket = config.bucket;
    this.prefix = config.prefix || '';
    this.endpoint = config.endpoint;
    this.usePathStyle = config.usePathStyle ?? true;
  }

  private getUrl(path: string): string {
    const fullPath = this.prefix ? `${this.prefix}/${path}` : path;
    
    if (this.usePathStyle) {
      // Path-style: https://endpoint/bucket/path
      return `${this.endpoint}/${this.bucket}/${fullPath}`;
    } else {
      // Virtual-hosted style: https://bucket.endpoint/path
      const url = new URL(this.endpoint);
      url.hostname = `${this.bucket}.${url.hostname}`;
      url.pathname = `/${fullPath}`;
      return url.toString();
    }
  }

  private getFilePath(fileType: FileType, name: string): string {
    if (fileType === 'config') {
      // Config file is just 'config' at the root
      return 'config';
    }
    
    const subdir = getSubdir(fileType);
    
    // Pack files use subdirectory based on first 2 chars of the name
    if (fileType === 'data') {
      const prefix = name.substring(0, 2);
      return `${subdir}/${prefix}/${name}`;
    }
    
    // Other files (keys, snapshots, index, locks) are in their subdir
    return `${subdir}/${name}`;
  }

  /**
   * Load a file from the repository
   */
  async load(fileType: FileType, name: string): Promise<Uint8Array> {
    const path = this.getFilePath(fileType, name);
    const url = this.getUrl(path);
    
    let response: Response;
    try {
      response = await this.client.fetch(url);
    } catch (err) {
      const error = err as Error;
      // Provide helpful context for common network errors
      let hint = '';
      if (error.message.includes('Failed to fetch')) {
        hint = '\n\nPossible causes:\n' +
          '• The endpoint URL is incorrect or unreachable\n' +
          '• CORS is not configured on the S3 server\n' +
          '• The server is not running or blocked by firewall\n' +
          '• SSL/TLS certificate issues (try http:// instead of https://)';  
      }
      throw new Error(`Network error loading ${fileType}/${name}\nURL: ${url}\nError: ${error.message}${hint}`);
    }
    
    if (!response.ok) {
      let body = '';
      try {
        body = await response.text();
      } catch {
        // ignore
      }
      throw new Error(`Failed to load ${path}\nHTTP ${response.status} ${response.statusText}\nURL: ${url}${body ? `\nResponse: ${body.substring(0, 500)}` : ''}`);
    }
    
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }

  /**
   * Load partial content from a file (for pack headers)
   */
  async loadPartial(
    fileType: FileType,
    name: string,
    offset: number,
    length: number
  ): Promise<Uint8Array> {
    const path = this.getFilePath(fileType, name);
    const url = this.getUrl(path);
    
    const end = offset + length - 1;
    let response: Response;
    try {
      response = await this.client.fetch(url, {
        headers: {
          Range: `bytes=${offset}-${end}`,
        },
      });
    } catch (err) {
      const error = err as Error;
      throw new Error(`Network error loading ${path} (range ${offset}-${end}): ${error.message}`);
    }
    
    if (!response.ok && response.status !== 206) {
      let body = '';
      try {
        body = await response.text();
      } catch {
        // ignore
      }
      throw new Error(`Failed to load ${path} (range ${offset}-${end})\nHTTP ${response.status} ${response.statusText}\nURL: ${url}${body ? `\nResponse: ${body.substring(0, 500)}` : ''}`);
    }
    
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }

  /**
   * Load the end of a file (for reading pack headers)
   */
  async loadTail(fileType: FileType, name: string, tailSize: number): Promise<{ data: Uint8Array; totalSize: number }> {
    const path = this.getFilePath(fileType, name);
    const url = this.getUrl(path);
    
    // First, do a HEAD request to get the file size
    const headResponse = await this.client.fetch(url, { method: 'HEAD' });
    if (!headResponse.ok) {
      throw new Error(`Failed to HEAD ${fileType}/${name}: ${headResponse.status}`);
    }
    
    const contentLength = parseInt(headResponse.headers.get('Content-Length') || '0', 10);
    const start = Math.max(0, contentLength - tailSize);
    
    const response = await this.client.fetch(url, {
      headers: {
        Range: `bytes=${start}-${contentLength - 1}`,
      },
    });
    
    if (!response.ok && response.status !== 206) {
      throw new Error(`Failed to load tail ${fileType}/${name}: ${response.status}`);
    }
    
    const buffer = await response.arrayBuffer();
    return {
      data: new Uint8Array(buffer),
      totalSize: contentLength,
    };
  }

  /**
   * List files of a specific type
   */
  async list(fileType: FileType): Promise<string[]> {
    const subdir = getSubdir(fileType);
    const prefix = this.prefix ? `${this.prefix}/${subdir}/` : `${subdir}/`;
    
    const files: string[] = [];
    let continuationToken: string | undefined;
    
    do {
      const params = new URLSearchParams({
        'list-type': '2',
        prefix,
        ...(continuationToken ? { 'continuation-token': continuationToken } : {}),
      });
      
      let url: string;
      if (this.usePathStyle) {
        url = `${this.endpoint}/${this.bucket}?${params}`;
      } else {
        const baseUrl = new URL(this.endpoint);
        baseUrl.hostname = `${this.bucket}.${baseUrl.hostname}`;
        url = `${baseUrl.origin}?${params}`;
      }
      
      let response: Response;
      try {
        response = await this.client.fetch(url);
      } catch (err) {
        const error = err as Error;
        let hint = '';
        if (error.message.includes('Failed to fetch')) {
          hint = '\n\nPossible causes:\n' +
            '• The endpoint URL is incorrect or unreachable\n' +
            '• CORS is not configured on the S3 server\n' +
            '• The server is not running or blocked by firewall\n' +
            '• SSL/TLS certificate issues (try http:// instead of https://)';  
        }
        throw new Error(`Network error listing ${fileType}\nURL: ${url}\nError: ${error.message}${hint}`);
      }
      
      if (!response.ok) {
        let body = '';
        try {
          body = await response.text();
        } catch {
          // ignore
        }
        throw new Error(`Failed to list ${fileType}\nHTTP ${response.status} ${response.statusText}\nURL: ${url}${body ? `\nResponse: ${body.substring(0, 500)}` : ''}`);
      }
      
      const text = await response.text();
      const parser = new DOMParser();
      const xml = parser.parseFromString(text, 'text/xml');
      
      const contents = xml.getElementsByTagName('Contents');
      for (let i = 0; i < contents.length; i++) {
        const key = contents[i].getElementsByTagName('Key')[0]?.textContent;
        if (key) {
          // Extract just the filename from the full path
          const parts = key.split('/');
          const filename = parts[parts.length - 1];
          if (filename) {
            files.push(filename);
          }
        }
      }
      
      const isTruncated = xml.getElementsByTagName('IsTruncated')[0]?.textContent === 'true';
      if (isTruncated) {
        continuationToken = xml.getElementsByTagName('NextContinuationToken')[0]?.textContent || undefined;
      } else {
        continuationToken = undefined;
      }
    } while (continuationToken);
    
    return files;
  }

  /**
   * Check if a file exists
   */
  async exists(fileType: FileType, name: string): Promise<boolean> {
    const path = this.getFilePath(fileType, name);
    const url = this.getUrl(path);
    
    try {
      const response = await this.client.fetch(url, { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get file size
   */
  async getSize(fileType: FileType, name: string): Promise<number> {
    const path = this.getFilePath(fileType, name);
    const url = this.getUrl(path);
    
    const response = await this.client.fetch(url, { method: 'HEAD' });
    if (!response.ok) {
      throw new Error(`Failed to get size of ${fileType}/${name}: ${response.status}`);
    }
    
    return parseInt(response.headers.get('Content-Length') || '0', 10);
  }
}
