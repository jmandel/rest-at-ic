import React from 'react';
import { useBrowserStore } from '../store';
import { formatBytes, formatDate, getFileIcon } from '../utils/formatters';
import type { Node } from '../lib/types';

function FileItem({ node, onSelect }: { node: Node; onSelect: () => void }) {
  return (
    <div className="file-item" onClick={onSelect}>
      <span className="file-icon">{getFileIcon(node)}</span>
      <span className="file-name">{node.name}</span>
      <span className="file-size">
        {node.type === 'file' ? formatBytes(node.size || 0) : ''}
      </span>
      <span className="file-time">
        {node.mtime ? formatDate(node.mtime) : ''}
      </span>
    </div>
  );
}

export function FileList() {
  const { currentTree, currentPath, isLoading, error, navigateTo, selectNode } = useBrowserStore();

  if (isLoading) {
    return <div className="loading">Loading...</div>;
  }

  if (error) {
    return <div className="error">Failed to load: {error}</div>;
  }

  if (!currentTree || currentTree.nodes.length === 0) {
    return <div className="loading">Empty directory</div>;
  }

  // Sort: directories first, then alphabetically
  const sortedNodes = [...currentTree.nodes].sort((a, b) => {
    if (a.type === 'dir' && b.type !== 'dir') return -1;
    if (a.type !== 'dir' && b.type === 'dir') return 1;
    return a.name.localeCompare(b.name);
  });

  const handleNodeClick = (node: Node) => {
    if (node.type === 'dir') {
      const newPath = currentPath === '/' ? '/' + node.name : currentPath + '/' + node.name;
      navigateTo(newPath);
    } else {
      selectNode(node);
    }
  };

  return (
    <div className="file-list">
      {sortedNodes.map((node) => (
        <FileItem
          key={node.name}
          node={node}
          onSelect={() => handleNodeClick(node)}
        />
      ))}
    </div>
  );
}
