import React from 'react';
import { useSnapshotStore, useBrowserStore } from '../store';
import { formatDate } from '../utils/formatters';
import type { SnapshotWithId } from '../lib/types';

function SnapshotItem({ snapshot, isActive, onSelect }: {
  snapshot: SnapshotWithId;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={`snapshot-item ${isActive ? 'active' : ''}`}
      onClick={onSelect}
    >
      <span className="snapshot-id">{snapshot.id.substring(0, 8)}</span>
      <span className="snapshot-time">{formatDate(snapshot.time)}</span>
      <span className="snapshot-meta">{snapshot.hostname || 'unknown'}</span>
      <span className="snapshot-paths">{snapshot.paths.join(', ')}</span>
      <span className="snapshot-tags">
        {(snapshot.tags || []).map((tag) => (
          <span key={tag} className="tag">{tag}</span>
        ))}
      </span>
    </div>
  );
}

export function SnapshotList() {
  const { snapshots, isLoading, error } = useSnapshotStore();
  const { currentSnapshot, selectSnapshot } = useBrowserStore();

  if (isLoading) {
    return (
      <div className="card">
        <h2>Snapshots</h2>
        <div className="loading">Loading snapshots...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <h2>Snapshots</h2>
        <div className="error">Failed to load snapshots: {error}</div>
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="card">
        <h2>Snapshots</h2>
        <div className="loading">No snapshots found</div>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Snapshots</h2>
      <div className="snapshots-list">
        {snapshots.map((snapshot) => (
          <SnapshotItem
            key={snapshot.id}
            snapshot={snapshot}
            isActive={currentSnapshot?.id === snapshot.id}
            onSelect={() => selectSnapshot(snapshot)}
          />
        ))}
      </div>
    </div>
  );
}
