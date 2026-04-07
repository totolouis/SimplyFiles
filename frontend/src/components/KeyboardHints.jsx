import React from 'react';
import './KeyboardHints.css';

const HINTS_CONFIG = [
  { key: '\\', description: 'Show/hide hints', scope: 'global' },
  { key: '/', description: 'Focus search', scope: 'global' },
  { key: 'f', description: 'Goto folder', scope: 'global' },
  { key: 'g', description: 'Go to root', scope: 'global' },
  { key: 's', description: 'Toggle sidebar', scope: 'global' },
  { key: 'r', description: 'Refresh', scope: 'global' },
  { key: 'Esc', description: 'Close / Clear', scope: 'global' },
  { key: 'n', description: 'New folder', scope: 'explorer' },
  { key: 'u', description: 'Upload files', scope: 'explorer' },
  { key: 'l', description: 'Create symlink', scope: 'explorer' },
  { key: 'e', description: 'Rename folder', scope: 'explorer' },
  { key: 'd', description: 'Delete selected', scope: 'explorer' },
];

export default function KeyboardHints({ visible }) {
  if (!visible) return null;

  return (
    <div className="keyboard-hints-overlay">
      <div className="keyboard-hints-panel">
        <div className="keyboard-hints-header">
          <h3>Keyboard Shortcuts</h3>
          <span className="keyboard-hints-subtitle">Hold \ to see this overlay</span>
        </div>
        <div className="keyboard-hints-grid">
          {HINTS_CONFIG.map((hint) => (
            <div key={hint.key} className="keyboard-hint-row">
              <kbd className="keyboard-hint-key">{hint.key}</kbd>
              <span className="keyboard-hint-desc">{hint.description}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
