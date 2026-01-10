import React from 'react';
import { useBrowserStore } from '../store';

export function BreadcrumbPath() {
  const { currentPath, navigateTo } = useBrowserStore();

  const parts = currentPath.split('/').filter((p) => p);
  
  const pathElements: { path: string; name: string }[] = [
    { path: '/', name: '/' },
  ];
  
  let pathSoFar = '';
  for (const part of parts) {
    pathSoFar += '/' + part;
    pathElements.push({ path: pathSoFar, name: part });
  }

  return (
    <div className="browser-path">
      {pathElements.map((el, index) => (
        <React.Fragment key={el.path}>
          {index > 0 && <span className="separator">/</span>}
          <span onClick={() => navigateTo(el.path)}>{el.name}</span>
        </React.Fragment>
      ))}
    </div>
  );
}
