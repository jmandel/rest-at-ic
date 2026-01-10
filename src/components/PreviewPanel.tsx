import React from 'react';
import { useBrowserStore, useUIStore } from '../store';
import { formatBytes, formatDate } from '../utils/formatters';

export function PreviewPanel() {
  const { selectedNode, isDownloading, downloadFile } = useBrowserStore();
  const showToast = useUIStore((state) => state.showToast);

  if (!selectedNode) {
    return null;
  }

  const handleDownload = async () => {
    try {
      await downloadFile();
    } catch (err) {
      showToast(`Download failed: ${(err as Error).message}`, 'error');
    }
  };

  const info: Record<string, string> = {
    'Type': selectedNode.type,
    'Size': formatBytes(selectedNode.size || 0),
    'Modified': selectedNode.mtime ? formatDate(selectedNode.mtime) : 'Unknown',
    'Mode': selectedNode.mode ? '0' + selectedNode.mode.toString(8) : 'Unknown',
    'UID': String(selectedNode.uid ?? 'Unknown'),
    'GID': String(selectedNode.gid ?? 'Unknown'),
  };

  if (selectedNode.user) info['User'] = selectedNode.user;
  if (selectedNode.group) info['Group'] = selectedNode.group;
  if (selectedNode.linktarget) info['Link Target'] = selectedNode.linktarget;
  if (selectedNode.content) info['Chunks'] = String(selectedNode.content.length);

  return (
    <div className="preview-panel">
      <div className="preview-header">
        <strong>{selectedNode.name}</strong>
        {selectedNode.type === 'file' && (
          <button
            className="secondary"
            onClick={handleDownload}
            disabled={isDownloading}
          >
            {isDownloading ? 'Downloading...' : 'Download'}
          </button>
        )}
      </div>
      <dl className="preview-info">
        {Object.entries(info).map(([key, value]) => (
          <React.Fragment key={key}>
            <dt>{key}</dt>
            <dd>{value}</dd>
          </React.Fragment>
        ))}
      </dl>
    </div>
  );
}
