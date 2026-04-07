import React, { useState, useEffect, useCallback } from 'react';
import { X, RefreshCw, CheckCircle, AlertCircle, FileText, File, Loader, Database, ClipboardList } from 'lucide-react';
import { indexApi } from '../api';
import SyncReportModal from './SyncReportModal';
import './SettingsPanel.css';

function StatBadge({ value, label, color }) {
  return (
    <div className="stat-badge" style={{ '--badge-color': color }}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

export default function SettingsPanel({ onClose, currentFolderId, displayMode, setDisplayMode, onSyncComplete }) {
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncReport, setSyncReport] = useState(null);
  const [showReport, setShowReport] = useState(false);
  const [error, setError] = useState(null);

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    setError(null);
    try {
      const s = await indexApi.getStats();
      setStats(s);
    } catch (e) {
      setError('Could not load index stats.');
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncReport(null);
    setError(null);
    try {
      const r = await indexApi.sync(currentFolderId || null);
      setSyncReport(r);
      await loadStats();
      onSyncComplete?.();
    } catch (e) {
      setError('Sync failed. Check API logs.');
    } finally {
      setSyncing(false);
    }
  };

  const pct = stats ? Math.round((stats.indexed / Math.max(stats.total, 1)) * 100) : 0;

  // Compute a one-line summary from the sync report
  const syncSummary = syncReport ? (() => {
    const ops = syncReport.operations || [];
    const totalChanges = ops.reduce((sum, op) => sum + op.items.length, 0);
    if (totalChanges === 0) return 'Everything is in sync';
    const parts = ops
      .filter(op => op.items.length > 0)
      .map(op => `${op.items.length} ${op.label.toLowerCase()}`);
    return parts.join(', ');
  })() : null;

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-panel" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="settings-header">
          <Database size={15} className="settings-header-icon" />
          <span className="settings-title">Settings</span>
          <button className="settings-close" onClick={onClose}><X size={15} /></button>
        </div>

        <div className="settings-body">

          {/* ── Search Index section ── */}
          <section className="settings-section">
            <div className="section-label">SEARCH INDEX</div>

            {loadingStats ? (
              <div className="stats-loading"><Loader size={16} className="spin" /> Loading stats...</div>
            ) : error && !stats ? (
              <div className="stats-error"><AlertCircle size={14} /> {error}</div>
            ) : stats && (
              <>
                {/* Progress bar */}
                <div className="index-progress-wrap">
                  <div className="index-progress-bar">
                    <div className="index-progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="index-progress-label">{pct}% indexed</span>
                </div>

                {/* Stats row */}
                <div className="stats-row">
                  <StatBadge value={stats.total}    label="total files"   color="var(--text-2)" />
                  <StatBadge value={stats.indexed}  label="indexed"       color="var(--green)" />
                  <StatBadge value={stats.unindexed} label="not indexed"  color={stats.unindexed > 0 ? 'var(--accent)' : 'var(--text-3)'} />
                </div>

                {/* Type breakdown if anything is missing */}
                {stats.unindexed > 0 && (
                  <div className="type-breakdown">
                    {stats.byType.pdf > 0 && (
                      <div className="type-row">
                        <FileText size={12} style={{ color: '#ff6b47' }} />
                        <span>{stats.byType.pdf} PDF{stats.byType.pdf !== 1 ? 's' : ''} not indexed</span>
                      </div>
                    )}
                    {stats.byType.text > 0 && (
                      <div className="type-row">
                        <File size={12} style={{ color: 'var(--text-2)' }} />
                        <span>{stats.byType.text} text file{stats.byType.text !== 1 ? 's' : ''} not indexed</span>
                      </div>
                    )}
                    {stats.byType.other > 0 && (
                      <div className="type-row">
                        <File size={12} style={{ color: 'var(--text-3)' }} />
                        <span>{stats.byType.other} file{stats.byType.other !== 1 ? 's' : ''} not indexable</span>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </section>

          {/* ── Sync section ── */}
          <section className="settings-section">
            <div className="section-label">SYNC</div>
            <p className="section-desc">
              Synchronize the {currentFolderId ? 'current folder' : 'root data folder'}: import new files from disk, remove stale database entries, fix broken symlinks, and reindex unindexed files.
            </p>

            <button
              className={`reindex-btn ${syncing ? 'running' : ''}`}
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing
                ? <><Loader size={13} className="spin" /> Syncing...</>
                : <><RefreshCw size={13} /> Sync</>
              }
            </button>

            {/* Sync result summary */}
            {syncSummary && !syncing && (
              <div className={`reindex-result ${syncSummary === 'Everything is in sync' ? 'neutral' : 'success'}`}>
                <CheckCircle size={13} />
                <span>{syncSummary}</span>
              </div>
            )}

            {/* View report button */}
            {syncReport && !syncing && (
              <button
                className="view-report-btn"
                onClick={() => setShowReport(true)}
              >
                <ClipboardList size={13} />
                View sync report
              </button>
            )}

            {error && (
              <div className="reindex-result error">
                <AlertCircle size={13} /><span>{error}</span>
              </div>
            )}
          </section>

          {/* ── Display Settings section ── */}
          <section className="settings-section">
            <div className="section-label">DISPLAY</div>
            <p className="section-desc">Choose how file and folder names are displayed.</p>
            <div className="display-mode-toggle">
              <button
                className={`display-mode-btn ${displayMode === 'truncate' ? 'active' : ''}`}
                onClick={() => setDisplayMode('truncate')}
              >
                <span className="btn-label">Truncate</span>
                <span className="btn-desc">Show single line with ellipsis</span>
              </button>
              <button
                className={`display-mode-btn ${displayMode === 'wrap' ? 'active' : ''}`}
                onClick={() => setDisplayMode('wrap')}
              >
                <span className="btn-label">Wrap</span>
                <span className="btn-desc">Show up to 2 lines</span>
              </button>
            </div>
          </section>

          {/* ── About section ── */}
          <section className="settings-section">
            <div className="section-label">ABOUT</div>
            <div className="about-rows">
              <div className="about-row"><span>Version</span><span className="mono">1.0.0</span></div>
              <div className="about-row"><span>Search engine</span><span className="mono">PostgreSQL FTS</span></div>
              <div className="about-row"><span>PDF extraction</span><span className="mono">pdf-parse</span></div>
            </div>
          </section>

        </div>
      </div>

      {/* Sync report modal */}
      {showReport && (
        <SyncReportModal report={syncReport} onClose={() => setShowReport(false)} />
      )}
    </div>
  );
}
