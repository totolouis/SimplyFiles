import React, { useState } from 'react';
import { X, ChevronRight, ChevronDown, CheckCircle, AlertCircle } from 'lucide-react';
import './SyncReportModal.css';

export default function SyncReportModal({ report, onClose }) {
  const [expanded, setExpanded] = useState({});

  const toggle = (idx) => {
    setExpanded((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  if (!report) return null;

  const ops = report.operations || [];

  return (
    <div className="sync-report-backdrop" onClick={onClose}>
      <div className="sync-report-panel" onClick={(e) => e.stopPropagation()}>
        <div className="sync-report-header">
          <span className="sync-report-title">Sync Report</span>
          <button className="settings-close" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        <div className="sync-report-body">
          {ops.length === 0 && (
            <div className="sync-report-empty">Nothing to report.</div>
          )}

          {ops.map((op, idx) => {
            const count = op.items.length;
            const isOpen = !!expanded[idx];
            const isFailure = op.label.toLowerCase().includes('failed');

            return (
              <div key={idx} className="sync-op">
                <button
                  className={`sync-op-header ${count === 0 ? 'empty' : ''} ${isFailure && count > 0 ? 'failure' : ''}`}
                  onClick={() => count > 0 && toggle(idx)}
                  disabled={count === 0}
                >
                  <span className="sync-op-chevron">
                    {count > 0 ? (
                      isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                    ) : (
                      <CheckCircle size={14} />
                    )}
                  </span>
                  <span className="sync-op-label">{op.label}</span>
                  <span className={`sync-op-count ${count === 0 ? 'zero' : ''} ${isFailure && count > 0 ? 'failure' : ''}`}>
                    {count}
                  </span>
                </button>

                {isOpen && count > 0 && (
                  <ul className="sync-op-items">
                    {op.items.map((item, i) => (
                      <li key={i} className="sync-op-item">
                        {isFailure ? (
                          <AlertCircle size={11} className="sync-op-item-icon failure" />
                        ) : (
                          <CheckCircle size={11} className="sync-op-item-icon" />
                        )}
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
