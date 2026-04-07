import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { X, Trash2, FolderOpen, Move, Pencil, Loader, ArrowRight, File } from 'lucide-react';
import { api } from '../api';
import { formatDate } from '../utils';
import MoveFolderModal from './MoveFolderModal';
import './FolderPreviewPane.css';

export default function FolderPreviewPane({
  folder,
  onClose,
  onDelete,
  onRename,
  onMove,
  onNavigate,
  folders,
  currentFolderId,
  isMobile
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(folder.name);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [moving, setMoving] = useState(false);
  const [folderContents, setFolderContents] = useState({ folders: [], files: [] });
  const [loading, setLoading] = useState(true);

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await onDelete(folder.id);
  };

  const startRename = () => {
    setIsRenaming(true);
    setNewName(folder.name);
  };

  const handleRename = async (e) => {
    e.preventDefault();
    if (!newName.trim() || newName.trim() === folder.name) {
      setIsRenaming(false);
      return;
    }
    setRenaming(true);
    try {
      await onRename(folder.id, newName.trim());
    } finally {
      setRenaming(false);
      setIsRenaming(false);
    }
  };

  const handleMove = async (targetFolderId) => {
    if (targetFolderId === folder.parentId) {
      setShowMoveModal(false);
      return;
    }
    setMoving(true);
    try {
      await onMove(folder.id, targetFolderId);
      onClose();
    } finally {
      setMoving(false);
    }
  };

  // Fetch folder contents
  useEffect(() => {
    const fetchContents = async () => {
      setLoading(true);
      try {
        const data = await api.getFolderContents(folder.id);
        setFolderContents({ folders: data.folders || [], files: data.files || [] });
      } catch (e) {
        console.error('Failed to fetch folder contents:', e);
        setFolderContents({ folders: [], files: [] });
      } finally {
        setLoading(false);
      }
    };
    fetchContents();
  }, [folder.id]);

  // Get folder contents count
  const { contentsCount, subfolderCount } = useMemo(() => {
    const subfolders = folders.filter(f => f.parentId === folder.id).length;
    return { contentsCount: subfolders, subfolderCount: subfolders };
  }, [folder.id, folders]);

  // Get folder path
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

  const folderPath = getFolderPath(folder.parentId);

  return (
    <div className="preview-pane" style={isMobile ? { width: '100%', minWidth: 0, borderLeft: 'none', borderRadius: '16px 16px 0 0', height: '100%' } : {}}>
      {/* Drag handle on mobile */}
      {isMobile && <div className="preview-handle" />}

      <div className="preview-header">
        {isRenaming ? (
          <form className="preview-rename-form" onSubmit={handleRename}>
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setIsRenaming(false);
                }
              }}
              disabled={renaming}
              className="preview-rename-input"
            />
            {renaming && <Loader size={14} className="spin" />}
          </form>
        ) : (
          <div className="preview-title truncate" title={folder.name}>{folder.name}</div>
        )}
        <div className="preview-actions">
          <button className="preview-action-btn enter-btn" onClick={() => onNavigate(folder.id)} title="Open folder">
            <ArrowRight size={14} />
            <span>Open</span>
          </button>
          <button className="preview-action-btn" onClick={startRename} title="Rename folder">
            <Pencil size={14} />
          </button>
          <button className="preview-action-btn" onClick={() => setShowMoveModal(true)} title="Move folder">
            <Move size={14} />
          </button>
          <button
            className={`preview-action-btn delete-btn ${confirmDelete ? 'confirm' : ''}`}
            onClick={handleDelete}
            onBlur={() => setConfirmDelete(false)}
            title={confirmDelete && folder.isSymlink ? 'This will only remove the symlink, not the original folder' : confirmDelete ? 'Click again to confirm' : 'Move to trash'}
          >
            <Trash2 size={14} />
            {confirmDelete && <span>{folder.isSymlink ? 'Remove symlink only?' : 'Confirm?'}</span>}
          </button>
          <button className="preview-action-btn" onClick={onClose} title="Close"><X size={14} /></button>
        </div>
      </div>

      <div className="preview-meta">
        <div className="meta-row">
          <span className="meta-label">Location</span>
          <span className="meta-value truncate">{folderPath}</span>
        </div>
        <div className="meta-row">
          <span className="meta-label">Subfolders</span>
          <span className="meta-value">{folderContents.folders.length}</span>
        </div>
        <div className="meta-row">
          <span className="meta-label">Files</span>
          <span className="meta-value">{folderContents.files.length}</span>
        </div>
        <div className="meta-row">
          <span className="meta-label">Created</span>
          <span className="meta-value">{formatDate(folder.createdAt)}</span>
        </div>
        {!!folder.isSymlink && (
          <div className="meta-row">
            <span className="meta-label">Kind</span>
            <span className="meta-value">Symlink</span>
          </div>
        )}
      </div>

      <div className="preview-content folder-preview-content">
        <div className="folder-preview-icon-wrap">
          <FolderOpen size={64} />
        </div>
        <div className="folder-preview-info">
          <p className="folder-preview-name">{folder.name}</p>
          <p className="folder-preview-type">Folder</p>
        </div>
      </div>

      {showMoveModal && (
        <MoveFolderModal
          folder={folder}
          folders={folders}
          currentFolderId={folder.parentId}
          onClose={() => setShowMoveModal(false)}
          onMove={handleMove}
          isMobile={isMobile}
        />
      )}
    </div>
  );
}
