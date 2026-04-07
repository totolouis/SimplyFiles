import React, { useState, useEffect, useCallback } from 'react';
import { Trash2, RotateCcw, AlertTriangle, File, Folder, Loader, X } from 'lucide-react';
import { api } from '../api';
import { formatSize } from '../utils';
import './TrashView.css';

function formatTimeLeft(expiresAt) {
  const now = new Date();
  const expires = new Date(expiresAt);
  const diff = expires.getTime() - now.getTime();
  if (diff <= 0) return 'Expiring soon';
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return `${days}d left`;
}

export default function TrashView({ onClose, onRestored }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  const loadTrash = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getTrash();
      setItems(data);
    } catch (e) {
      console.error('Failed to load trash:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTrash(); }, [loadTrash]);

  const handleRestore = async (item) => {
    setActionInProgress(item.id);
    try {
      if (item.type === 'file') {
        await api.restoreFile(item.id);
      } else {
        await api.restoreFolder(item.id);
      }
      await loadTrash();
      onRestored?.();
    } catch (e) {
      console.error('Failed to restore:', e);
    } finally {
      setActionInProgress(null);
    }
  };

  const handlePermanentDelete = async (item) => {
    if (!window.confirm(`Permanently delete "${item.name}"? This cannot be undone.`)) return;
    setActionInProgress(item.id);
    try {
      if (item.type === 'file') {
        await api.permanentDeleteFile(item.id);
      } else {
        await api.permanentDeleteFolder(item.id);
      }
      await loadTrash();
    } catch (e) {
      console.error('Failed to permanently delete:', e);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleEmptyTrash = async () => {
    if (!confirmEmpty) {
      setConfirmEmpty(true);
      return;
    }
    setConfirmEmpty(false);
    setActionInProgress('empty');
    try {
      await api.emptyTrash();
      await loadTrash();
    } catch (e) {
      console.error('Failed to empty trash:', e);
    } finally {
      setActionInProgress(null);
    }
  };

  return (
    <div className="trash-overlay">
      <div className="trash-panel">
        <div className="trash-header">
          <div className="trash-title">
            <Trash2 size={16} />
            <span>Trash</span>
            {items.length > 0 && <span className="trash-count">{items.length}</span>}
          </div>
          <div className="trash-header-actions">
            {items.length > 0 && (
              <button
                className={`trash-empty-btn ${confirmEmpty ? 'confirm' : ''}`}
                onClick={handleEmptyTrash}
                onBlur={() => setConfirmEmpty(false)}
                disabled={actionInProgress == 'empty'}
              >
                {actionInProgress == 'empty' ? (
                  <Loader size={12} className="spin" />
                ) : (
                  <AlertTriangle size={12} />
                )}
                <span>{confirmEmpty ? 'Confirm empty?' : 'Empty trash'}</span>
              </button>
            )}
            <button className="trash-close-btn" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="trash-info">
          Items are permanently deleted after 30 days.
        </div>

        <div className="trash-list">
          {loading ? (
            <div className="trash-loading">
              <Loader size={20} className="spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="trash-empty">
              <Trash2 size={40} />
              <p>Trash is empty</p>
            </div>
          ) : (
            items.map(item => (
              <div key={`${item.type}-${item.id}`} className="trash-item">
                <div className="trash-item-icon">
                  {item.type === 'folder' ? <Folder size={18} /> : <File size={18} />}
                </div>
                <div className="trash-item-info">
                  <div className="trash-item-name truncate">{item.name}</div>
                  <div className="trash-item-meta">
                    {item.type === 'folder' ? 'Folder' : formatSize(item.size)}
                    {' \u00B7 '}
                    {formatTimeLeft(item.expiresAt)}
                  </div>
                </div>
                <div className="trash-item-actions">
                  <button
                    className="trash-action-btn restore-btn"
                    onClick={() => handleRestore(item)}
                    disabled={actionInProgress === item.id}
                    title="Restore"
                  >
                    {actionInProgress === item.id ? (
                      <Loader size={13} className="spin" />
                    ) : (
                      <RotateCcw size={13} />
                    )}
                  </button>
                  <button
                    className="trash-action-btn delete-forever-btn"
                    onClick={() => handlePermanentDelete(item)}
                    disabled={actionInProgress === item.id}
                    title="Delete permanently"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
