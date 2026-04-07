import React, { useState, useEffect, useRef } from 'react';
import { X, Link, Folder, File, Search, Loader } from 'lucide-react';
import { api } from '../api';
import './MoveFileModal.css';
import './CreateSymlinkModal.css';

export default function CreateSymlinkModal({ destinationFolderId, onClose, onSuccess, isMobile }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const term = searchQuery.trim();
    if (term.length < 2) {
      setResults([]);
      setSelectedItem(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.searchSymlinkTargets(term);
        setResults(data || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchQuery]);

  const handleCreate = async () => {
    if (!selectedItem || creating) return;
    setCreating(true);
    setError(null);
    try {
      await api.createSymlink({
        targetId: selectedItem.id,
        targetType: selectedItem.type,
        destinationFolderId,
      });
      onSuccess();
      onClose();
    } catch {
      setError('Failed to create symlink. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={`move-modal-backdrop ${isMobile ? 'mobile' : ''}`} onClick={onClose}>
      <div className={`move-modal ${isMobile ? 'mobile' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="move-modal-header">
          <div className="move-modal-title">
            <Link size={14} />
            Create Symlink
          </div>
          <button className="move-modal-close" onClick={onClose}><X size={14} /></button>
        </div>

        <div className="move-search-wrap">
          <Search size={14} className="move-search-icon" />
          <input
            ref={inputRef}
            className="move-search-input"
            placeholder="Search files and folders..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="move-modal-content">
          {searchQuery.trim().length < 2 ? (
            <div className="symlink-search-prompt">Type at least 2 characters to search</div>
          ) : loading ? (
            <div className="symlink-search-prompt"><Loader size={16} className="spin" /></div>
          ) : results.length === 0 ? (
            <div className="symlink-search-prompt">No items found</div>
          ) : (
            <div className="symlink-results-list">
              {results.map(item => (
                <div
                  key={`${item.type}-${item.id}`}
                  className={`symlink-result-row ${selectedItem?.id === item.id ? 'selected' : ''}`}
                  onClick={() => setSelectedItem(item)}
                >
                  <div className="symlink-result-icon">
                    {item.type === 'folder' ? <Folder size={16} /> : <File size={16} />}
                  </div>
                  <div className="symlink-result-info">
                    <div className="symlink-result-name">{item.name}</div>
                    <div className="symlink-result-path">{item.path}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="move-modal-footer">
          {error && <div className="move-error">{error}</div>}
          <div className="move-actions">
            <button className="move-btn-cancel" onClick={onClose}>Cancel</button>
            <button
              className="move-btn-confirm"
              disabled={!selectedItem || creating}
              onClick={handleCreate}
            >
              {creating ? <Loader size={14} className="spin" /> : <Link size={14} />}
              Create
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
