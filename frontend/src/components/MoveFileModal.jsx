import React, { useState, useMemo, useCallback } from 'react';
import { X, Folder, ChevronRight, ChevronDown, Search, Move, Loader } from 'lucide-react';
import { api } from '../api';
import './MoveFileModal.css';

const MAX_DEPTH = Number(import.meta.env.VITE_MAX_FOLDER_DEPTH) || 5;

function FolderNode({ folder, allFolders, selectedFolderId, onSelect, depth = 0, searchQuery }) {
  const children = allFolders.filter(f => f.parentId === folder.id);
  const [open, setOpen] = useState(false);
  const isSelected = selectedFolderId === folder.id;
  const hasChildren = children.length > 0;

  // Get full path for this folder
  const getFolderPath = (folderId) => {
    const parts = [];
    let current = allFolders.find(f => f.id === folderId);
    while (current) {
      parts.unshift(current.name);
      current = allFolders.find(f => f.id === current.parentId);
    }
    return parts.join(' / ') || 'All Files';
  };

  const folderPath = getFolderPath(folder.id);
  const matchesSearch = searchQuery && folder.name.toLowerCase().includes(searchQuery.toLowerCase());

  const handleSelect = () => {
    onSelect(folder.id);
  };

  const toggleOpen = (e) => {
    e.stopPropagation();
    setOpen(!open);
  };

  return (
    <div className="move-folder-node">
      <div
        className={`move-folder-row ${isSelected ? 'selected' : ''} ${matchesSearch ? 'highlight' : ''}`}
        style={{ paddingLeft: `${12 + Math.min(depth, MAX_DEPTH) * 16}px` }}
        onClick={handleSelect}
      >
        <button className="move-chevron-btn" onClick={toggleOpen}>
          {hasChildren ? (open ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : <span style={{ width: 12 }} />}
        </button>
        <Folder size={14} className={`move-folder-icon ${isSelected ? 'selected' : ''}`} />
        <span className="move-folder-name truncate" title={folder.name}>{folder.name}</span>
      </div>
      {open && hasChildren && children.map(child => (
        <FolderNode
          key={child.id}
          folder={child}
          allFolders={allFolders}
          selectedFolderId={selectedFolderId}
          onSelect={onSelect}
          depth={depth + 1}
          searchQuery={searchQuery}
        />
      ))}
    </div>
  );
}

export default function MoveFileModal({ file, folders, currentFolderId, onClose, onMove, isMobile }) {
  const [selectedFolderId, setSelectedFolderId] = useState(currentFolderId);
  const [searchQuery, setSearchQuery] = useState('');
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState(null);

  const rootFolders = useMemo(() => folders.filter(f => f.parentId === null), [folders]);

  // Build folder path map for display
  const getFolderPath = useCallback((folderId) => {
    if (folderId === null) return 'All Files';
    const parts = [];
    let current = folders.find(f => f.id === folderId);
    while (current) {
      parts.unshift(current.name);
      current = folders.find(f => f.id === current.parentId);
    }
    return parts.join(' / ');
  }, [folders]);

  // Filter folders based on search
  const filteredFolders = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return folders.filter(f => f.name.toLowerCase().includes(query));
  }, [folders, searchQuery]);

  const handleSelect = (folderId) => {
    setSelectedFolderId(folderId);
  };

  const handleMove = async () => {
    if (!file || moving) return;
    
    // Don't move if destination is same as current
    if (selectedFolderId === currentFolderId) {
      onClose();
      return;
    }

    setMoving(true);
    setError(null);
    
    try {
      await api.moveFile(file.id, selectedFolderId);
      onMove?.();
      onClose();
    } catch (e) {
      console.error('Move failed:', e);
      setError('Failed to move file. Please try again.');
    } finally {
      setMoving(false);
    }
  };

  const selectedPath = getFolderPath(selectedFolderId);

  return (
    <div className={`move-modal-backdrop ${isMobile ? 'mobile' : ''}`} onClick={onClose}>
      <div className={`move-modal ${isMobile ? 'mobile' : ''}`} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="move-modal-header">
          <div className="move-modal-title">
            <Move size={16} />
            <span>Move "{file.filename}"</span>
          </div>
          <button className="move-modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="move-search-wrap">
          <Search size={14} className="move-search-icon" />
          <input
            type="text"
            className="move-search-input"
            placeholder="Search folders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="move-search-clear" onClick={() => setSearchQuery('')}>
              <X size={12} />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="move-modal-content">
          {searchQuery.trim() ? (
            // Search results
            <div className="move-search-results">
              {filteredFolders.length === 0 ? (
                <div className="move-empty">No folders found</div>
              ) : (
                filteredFolders.map(folder => (
                  <div
                    key={folder.id}
                    className={`move-search-result ${selectedFolderId === folder.id ? 'selected' : ''}`}
                    onClick={() => handleSelect(folder.id)}
                  >
                    <Folder size={14} className="move-result-icon" />
                    <div className="move-result-info">
                      <span className="move-result-name">{folder.name}</span>
                      <span className="move-result-path">{getFolderPath(folder.id)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            // Folder tree
            <div className="move-folder-tree">
              {/* Root option - All Files */}
              <div
                className={`move-folder-row ${selectedFolderId === null ? 'selected' : ''}`}
                style={{ paddingLeft: '12px' }}
                onClick={() => handleSelect(null)}
              >
                <span style={{ width: 12 }} />
                <Folder size={14} className={`move-folder-icon ${selectedFolderId === null ? 'selected' : ''}`} />
                <span className="move-folder-name">All Files</span>
              </div>
              {/* Folder tree */}
              {rootFolders.map(folder => (
                <FolderNode
                  key={folder.id}
                  folder={folder}
                  allFolders={folders}
                  selectedFolderId={selectedFolderId}
                  onSelect={handleSelect}
                />
              ))}
              {folders.length === 0 && (
                <div className="move-empty">No folders yet</div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="move-modal-footer">
          {error && <div className="move-error">{error}</div>}
          <div className="move-selected-path">
            <span className="move-path-label">Moving to:</span>
            <span className="move-path-value truncate">{selectedPath}</span>
          </div>
          <div className="move-actions">
            <button className="move-btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              className="move-btn-confirm"
              onClick={handleMove}
              disabled={moving || selectedFolderId === currentFolderId}
            >
              {moving ? (
                <><Loader size={14} className="spin" /> Moving...</>
              ) : (
                'Move'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
