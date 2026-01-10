import React from 'react';
import { useBrowserStore } from '../store';
import { BreadcrumbPath } from './BreadcrumbPath';
import { FileList } from './FileList';
import { PreviewPanel } from './PreviewPanel';

export function FileBrowser() {
  const currentSnapshot = useBrowserStore((state) => state.currentSnapshot);

  if (!currentSnapshot) {
    return null;
  }

  return (
    <div className="card">
      <h2>Browse Snapshot</h2>
      <BreadcrumbPath />
      <div className="browser">
        <div>
          <FileList />
        </div>
        <PreviewPanel />
      </div>
    </div>
  );
}
