import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Folder, Search, Loader, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../api';
import './MoveFileModal.css';

export default function GotoFolderModal({ onClose, onNavigate, isMobile }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef(null);

  const LIMIT = 20;

  const searchFolders = useCallback(async (searchQuery, pageNum = 0) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setTotalPages(0);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.searchGotoFolders(searchQuery, pageNum, LIMIT);
      setResults(response.results || []);
      setTotalPages(response.totalPages || 0);
      setPage(response.page || 0);
      setSelectedIndex(0);
    } catch (e) {
      console.error('Search failed:', e);
      setError('Failed to search folders');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchFolders(query, 0);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query, searchFolders]);

  // Focus input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  const handleNavigate = useCallback((folderId) => {
    onNavigate(folderId);
    onClose();
  }, [onNavigate, onClose]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }

    if (results.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % results.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + results.length) % results.length);
        break;
      case 'Enter':
        e.preventDefault();
        if (results[selectedIndex]) {
          handleNavigate(results[selectedIndex].id);
        }
        break;
      case 'PageDown':
        e.preventDefault();
        if (page < totalPages - 1) {
          searchFolders(query, page + 1);
        }
        break;
      case 'PageUp':
        e.preventDefault();
        if (page > 0) {
          searchFolders(query, page - 1);
        }
        break;
    }
  }, [results, selectedIndex, page, totalPages, query, handleNavigate, onClose, searchFolders]);

  const handlePrevPage = () => {
    if (page > 0) {
      searchFolders(query, page - 1);
    }
  };

  const handleNextPage = () => {
    if (page < totalPages - 1) {
      searchFolders(query, page + 1);
    }
  };

  return (
    <div className={`move-modal-backdrop ${isMobile ? 'mobile' : ''}`} onClick={onClose}>
      <div
        className={`move-modal ${isMobile ? 'mobile' : ''}`}
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="move-modal-header">
          <div className="move-modal-title">
            <Search size={16} />
            <span>Goto Folder</span>
          </div>
          <button className="move-modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="move-search-wrap">
          <Search size={14} className="move-search-icon" />
          <input
            ref={searchInputRef}
            type="text"
            className="move-search-input"
            placeholder="Search folders... (use comma for sequence: 20,louis,01)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="move-search-clear" onClick={() => setQuery('')}>
              <X size={12} />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="move-modal-content">
          {loading ? (
            <div className="move-empty">
              <Loader size={24} className="spin" />
              <span>Searching...</span>
            </div>
          ) : error ? (
            <div className="move-empty">{error}</div>
          ) : results.length === 0 ? (
            <div className="move-empty">
              {query.trim() ? 'No folders found' : 'Type to search for folders'}
            </div>
          ) : (
            <div className="move-search-results">
              {results.map((folder, index) => (
                <div
                  key={folder.id}
                  className={`move-search-result ${selectedIndex === index ? 'selected' : ''}`}
                  onClick={() => handleNavigate(folder.id)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <Folder size={14} className="move-result-icon" />
                  <div className="move-result-info">
                    <span className="move-result-name">{folder.name}</span>
                    <span className="move-result-path">{folder.fullPath}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="move-modal-footer">
          <div className="goto-footer-content">
            <div className="goto-pagination-info">
              {totalPages > 1 && (
                <span className="goto-page-info">
                  Page {page + 1} of {totalPages}
                </span>
              )}
              {results.length > 0 && (
                <span className="goto-result-count">
                  {results.length} result{results.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {totalPages > 1 && (
              <div className="goto-pagination">
                <button
                  className="goto-page-btn"
                  onClick={handlePrevPage}
                  disabled={page === 0}
                  title="Previous page (Page Up)"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  className="goto-page-btn"
                  onClick={handleNextPage}
                  disabled={page >= totalPages - 1}
                  title="Next page (Page Down)"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
          <div className="goto-hints">
            <span className="goto-hint">↑↓ Navigate</span>
            <span className="goto-hint">Enter Select</span>
            <span className="goto-hint">Esc Close</span>
            {totalPages > 1 && (
              <>
                <span className="goto-hint">PgUp/PgDn Pages</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
