import React, { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronDown, CheckCircle, AlertCircle, Loader, Clock } from 'lucide-react';
import { indexApi } from '../api';
import './SyncReportsHistory.css';

function ReportRow({ report }) {
  const [open, setOpen] = useState(false);
  const [expandedOps, setExpandedOps] = useState({});

  const ops = report.operations || [];
  const totalChanges = ops.reduce((sum, op) => sum + op.items.length, 0);
  const date = new Date(report.createdAt);
  const timeStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    + ' ' + date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  const toggleOp = (idx) => {
    setExpandedOps(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div className={`report-row ${open ? 'open' : ''}`}>
      <button className="report-row-header" onClick={() => setOpen(prev => !prev)}>
        <span className="report-chevron">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <Clock size={12} className="report-time-icon" />
        <span className="report-time">{timeStr}</span>
        <span className={`report-badge ${totalChanges === 0 ? 'zero' : ''}`}>
          {totalChanges === 0 ? 'No changes' : `${totalChanges} change${totalChanges !== 1 ? 's' : ''}`}
        </span>
      </button>

      {open && (
        <div className="report-details">
          {ops.map((op, idx) => {
            const count = op.items.length;
            const isOpen = !!expandedOps[idx];
            const isFailure = op.label.toLowerCase().includes('failed');

            return (
              <div key={idx} className="report-op">
                <button
                  className={`report-op-header ${count === 0 ? 'empty' : ''}`}
                  onClick={() => count > 0 && toggleOp(idx)}
                  disabled={count === 0}
                >
                  <span className="report-op-chevron">
                    {count > 0 ? (
                      isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />
                    ) : (
                      <CheckCircle size={12} />
                    )}
                  </span>
                  <span className="report-op-label">{op.label}</span>
                  <span className={`report-op-count ${count === 0 ? 'zero' : ''} ${isFailure && count > 0 ? 'failure' : ''}`}>
                    {count}
                  </span>
                </button>

                {isOpen && count > 0 && (
                  <ul className="report-op-items">
                    {op.items.map((item, i) => (
                      <li key={i} className="report-op-item">
                        {isFailure ? (
                          <AlertCircle size={10} className="report-item-icon failure" />
                        ) : (
                          <CheckCircle size={10} className="report-item-icon" />
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
      )}
    </div>
  );
}

export default function SyncReportsHistory({ onClose }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await indexApi.listSyncReports();
        setReports(data);
      } catch (e) {
        setError('Failed to load sync reports.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="sync-history-backdrop" onClick={onClose}>
      <div className="sync-history-panel" onClick={e => e.stopPropagation()}>
        <div className="sync-history-header">
          <span className="sync-history-title">Sync Reports</span>
          <button className="settings-close" onClick={onClose}><X size={15} /></button>
        </div>

        <div className="sync-history-body">
          {loading && (
            <div className="sync-history-loading"><Loader size={16} className="spin" /> Loading...</div>
          )}

          {error && (
            <div className="sync-history-error"><AlertCircle size={14} /> {error}</div>
          )}

          {!loading && !error && reports.length === 0 && (
            <div className="sync-history-empty">No sync reports yet. Run a sync from Settings.</div>
          )}

          {!loading && !error && reports.map(report => (
            <ReportRow key={report.id} report={report} />
          ))}
        </div>
      </div>
    </div>
  );
}
