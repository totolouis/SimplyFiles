import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { FolderOpen, Folder, Plus, ChevronRight, ChevronDown, Trash2, HardDrive, Home, X, Settings, Minus, Pencil, Check, Loader, ClipboardList, Sun, Moon, Monitor, Trash, Star, FileText } from 'lucide-react';
import { healthApi } from '../api';
import './Sidebar.css';

const MAX_DEPTH = Number(import.meta.env.VITE_MAX_FOLDER_DEPTH) || 5;

function FolderNode({ folder, allFolders, currentFolderId, expandedFolders, onToggle, onNavigate, onDelete, onItemDrop, depth = 0 }) {
  const [dragOver, setDragOver] = useState(false);
  const children = allFolders.filter(f => f.parentId === folder.id);
  const isOpen = expandedFolders.has(folder.id);
  const isActive = currentFolderId === folder.id;
  const hasChildren = children.length > 0;

  const handleDragOver = (e) => {
    if (!e.dataTransfer.types.includes('application/x-docvault-type')) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const type = e.dataTransfer.getData('application/x-docvault-type');
    const id = e.dataTransfer.getData('application/x-docvault-id');
    if (!type || !id || id === folder.id) return;
    onItemDrop(type, id, folder.id);
  };

  return (
    <div className="folder-node">
      <div
        className={`folder-row ${isActive ? 'active' : ''} ${dragOver ? 'drop-target' : ''}`}
        style={{ paddingLeft: `${12 + Math.min(depth, MAX_DEPTH) * 14}px` }}
        onClick={() => onNavigate(folder.id)}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <button className="chevron-btn" onClick={e => { e.stopPropagation(); onToggle(folder.id); }}>
          {hasChildren
            ? (isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />)
            : <span style={{ width: 11 }} />}
        </button>
        {isActive ? <FolderOpen size={14} className="folder-icon" /> : <Folder size={14} className="folder-icon" />}
        <span className="folder-name truncate" title={folder.name}>{folder.name}</span>
        <button className="delete-btn" onClick={e => { e.stopPropagation(); onDelete(folder.id); }} title="Move to trash">
          <Trash2 size={11} />
        </button>
      </div>
      {isOpen && hasChildren && children.map(child => (
        <FolderNode key={child.id} folder={child} allFolders={allFolders}
          currentFolderId={currentFolderId} expandedFolders={expandedFolders} onToggle={onToggle}
          onNavigate={onNavigate} onDelete={onDelete} onItemDrop={onItemDrop} depth={depth + 1} />
      ))}
    </div>
  );
}

function HomeRow({ active, onNavigate, onItemDrop }) {
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = (e) => {
    if (!e.dataTransfer.types.includes('application/x-docvault-type')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const type = e.dataTransfer.getData('application/x-docvault-type');
    const id = e.dataTransfer.getData('application/x-docvault-id');
    if (!type || !id) return;
    onItemDrop(type, id, null);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onNavigate();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={`home-row ${active ? 'active' : ''} ${dragOver ? 'drop-target' : ''}`}
      onClick={onNavigate}
      onKeyDown={handleKeyDown}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Home size={14} /><span>Home</span>
    </div>
  );
}

function FavoriteRow({ fav, onSelectFile, onNavigate, onToggleFavorite, onItemDrop }) {
  const [dragOver, setDragOver] = useState(false);
  const isFolder = fav.itemType === 'folder';

  const handleDragStart = (e) => {
    e.dataTransfer.setData('application/x-docvault-type', fav.itemType);
    e.dataTransfer.setData('application/x-docvault-id', fav.itemId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    if (!isFolder) return;
    if (!e.dataTransfer.types.includes('application/x-docvault-type')) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    if (!isFolder) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const type = e.dataTransfer.getData('application/x-docvault-type');
    const id = e.dataTransfer.getData('application/x-docvault-id');
    if (!type || !id || id === fav.itemId) return;
    onItemDrop(type, id, fav.itemId);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (isFolder) {
        onNavigate(fav.itemId);
      } else {
        onSelectFile?.(fav.itemId);
      }
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={`favorite-row ${dragOver ? 'drop-target' : ''}`}
      onClick={() => isFolder ? onNavigate(fav.itemId) : onSelectFile?.(fav.itemId)}
      onKeyDown={handleKeyDown}
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isFolder
        ? <Folder size={13} className="favorite-icon" />
        : <FileText size={13} className="favorite-icon" />}
      <span className="favorite-name truncate" title={fav.name}>{fav.name}</span>
      <button
        className="favorite-remove-btn"
        onClick={e => { e.stopPropagation(); onToggleFavorite(fav.itemType, fav.itemId); }}
        title="Remove from favorites"
      >
        <Star size={11} fill="currentColor" />
      </button>
    </div>
  );
}

const THEME_ICONS = { auto: Monitor, light: Sun, dark: Moon };
const THEME_LABELS = { auto: 'Auto', light: 'Light', dark: 'Dark' };

export default function Sidebar({ explorer, showClose, onClose, onNavigate: onNavigateCallback, onOpenSettings, onOpenReports, onOpenTrash, hasUnseenReports, themeMode, onCycleTheme, onItemDrop, favorites, onSelectFile }) {
  const { allFolders, currentFolderId, navigateTo, createFolder, deleteFolder, renameFolder,
    expandedFolders, toggleFolderExpansion, expandPathToFolder, collapseAllFolders } = explorer;
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [renamingCurrent, setRenamingCurrent] = useState(false);
  const [currentFolderNewName, setCurrentFolderNewName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [version, setVersion] = useState('dev');
  const creatingRef = useRef(false);

  useEffect(() => {
    healthApi.getVersion().then(data => {
      if (data?.version) setVersion(data.version);
    }).catch(() => {});
  }, []);

  const rootFolders = allFolders.filter(f => f.parentId === null);

  // Get current folder name
  const currentFolder = allFolders.find(f => f.id === currentFolderId);
  const currentFolderName = currentFolder?.name || '';

  const handleCreate = async e => {
    e.preventDefault();
    if (!newName.trim()) return;
    await createFolder(newName.trim());
    setNewName(''); setCreating(false);
  };

  const handleNavigate = id => {
    navigateTo(id);
    // Cancel any ongoing rename
    setRenamingCurrent(false);
    setCurrentFolderNewName('');
    onNavigateCallback?.();
  };

  const startRenameCurrent = () => {
    if (currentFolderId === null) return;
    setRenamingCurrent(true);
    setCurrentFolderNewName(currentFolderName);
  };

  const handleRenameCurrent = async (e) => {
    e.preventDefault();
    if (!currentFolderNewName.trim() || currentFolderNewName.trim() === currentFolderName) {
      setRenamingCurrent(false);
      return;
    }
    setRenaming(true);
    try {
      await renameFolder(currentFolderId, currentFolderNewName.trim());
      setRenamingCurrent(false);
    } finally {
      setRenaming(false);
    }
  };

  const cancelRenameCurrent = () => {
    setRenamingCurrent(false);
    setCurrentFolderNewName('');
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo">
          <HardDrive size={16} className="logo-icon" />
          <span className="logo-text">DocVault</span>
        </div>
        {showClose && (
          <button className="sidebar-close-btn" onClick={onClose} title="Close"><X size={16} /></button>
        )}
      </div>

<nav className="sidebar-nav">
<HomeRow active={currentFolderId === null} onNavigate={() => handleNavigate(null)} onItemDrop={onItemDrop} />

{/* Favorites section */}
{favorites && (
  <div className="favorites-section">
    <div className="section-header">
      <span>FAVORITES</span>
    </div>
    <div className="favorites-list">
      {favorites.favorites.length === 0 ? (
        <div className="empty-favorites">No favorites yet</div>
      ) : (
        favorites.favorites.map(fav => (
          <FavoriteRow key={fav.id} fav={fav} onSelectFile={onSelectFile} onNavigate={handleNavigate} onToggleFavorite={favorites.toggleFavorite} onItemDrop={onItemDrop} />
        ))
      )}
    </div>
  </div>
)}

{/* Rename current folder form */}
            {renamingCurrent && (
              <form className="rename-current-form" onSubmit={handleRenameCurrent}>
                <div className="rename-current-header">
                  <Pencil size={12} />
                  <span>Rename current folder</span>
                </div>
                <div className="rename-current-input-wrap">
                  <input
                    autoFocus
                    type="text"
                    value={currentFolderNewName}
                    onChange={e => setCurrentFolderNewName(e.target.value)}
                    onBlur={handleRenameCurrent}
                    onKeyDown={e => {
                      if (e.key === 'Escape') cancelRenameCurrent();
                    }}
                    disabled={renaming}
                    placeholder="New folder name"
                  />
                  {renaming && <Loader size={12} className="spin" />}
                  <button type="button" onClick={cancelRenameCurrent} disabled={renaming}>
                    <X size={12} />
                  </button>
                </div>
              </form>
            )}

            <div className="folders-section">
              <div className="section-header">
                <span>FOLDERS</span>
                <div className="section-actions">
                  {expandedFolders.size > 0 && (
                    <button className="collapse-btn" onClick={collapseAllFolders} title="Collapse all">
                      <Minus size={12} />
                    </button>
                  )}
                  <button
                    className={`rename-btn ${currentFolderId === null ? 'disabled' : ''}`}
                    onClick={startRenameCurrent}
                    disabled={currentFolderId === null || renamingCurrent}
                    title={currentFolderId === null ? 'Cannot rename Home' : `Rename "${currentFolderName}"`}
                  >
                    <Pencil size={12} />
                  </button>
                  <button className="add-btn" onClick={() => setCreating(true)}><Plus size={12} /></button>
                </div>
              </div>

{creating && (
<form className="new-folder-form" onSubmit={handleCreate}>
<input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
placeholder="folder name"
onBlur={async () => {
// Small delay to let onSubmit fire first if user pressed Enter
await new Promise(resolve => setTimeout(resolve, 100));
// Create folder on blur if user typed something
if (newName.trim() && creatingRef.current) {
creatingRef.current = false;
await createFolder(newName.trim());
}
setCreating(false);
setNewName('');
}}
onKeyDown={e => {
if (e.key === 'Enter') {
creatingRef.current = true;
} else if (e.key === 'Escape') {
setCreating(false);
}
}} />
</form>
)}

          <div className="folder-tree">
            {rootFolders.map(folder => (
              <FolderNode key={folder.id} folder={folder} allFolders={allFolders}
                currentFolderId={currentFolderId} expandedFolders={expandedFolders} onToggle={toggleFolderExpansion}
                onNavigate={handleNavigate} onDelete={deleteFolder} onItemDrop={onItemDrop} />
            ))}
            {rootFolders.length === 0 && !creating && (
              <div className="empty-folders">No folders yet</div>
            )}
          </div>
        </div>
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-footer-row">
          <button className="settings-btn" onClick={onOpenTrash}>
            <Trash size={13} />
            <span>Trash</span>
          </button>
        </div>
        <div className="sidebar-footer-sep" />
        <div className="sidebar-footer-row">
          <button className="settings-btn" onClick={onOpenReports}>
            <ClipboardList size={13} />
            <span>Sync Reports</span>
            {hasUnseenReports && <span className="unseen-dot" />}
          </button>
          {(() => {
            const ThemeIcon = THEME_ICONS[themeMode] || Monitor;
            return (
              <button
                className="theme-toggle-btn"
                onClick={onCycleTheme}
                title={`Theme: ${THEME_LABELS[themeMode] || 'Auto'}`}
              >
                <ThemeIcon size={14} />
              </button>
            );
          })()}
        </div>
        <div className="sidebar-footer-sep" />
        <div className="sidebar-footer-row">
      <button className="settings-btn" onClick={onOpenSettings}>
        <Settings size={13} />
        <span>Settings</span>
      </button>
      <span className="version-tag">v{version}</span>
    </div>
  </div>
</aside>
);
}

HomeRow.propTypes = {
  active: PropTypes.bool.isRequired,
  onNavigate: PropTypes.func.isRequired,
  onItemDrop: PropTypes.func.isRequired,
};

FavoriteRow.propTypes = {
  fav: PropTypes.shape({
    id: PropTypes.string.isRequired,
    itemType: PropTypes.oneOf(['file', 'folder']).isRequired,
    itemId: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
  }).isRequired,
  onSelectFile: PropTypes.func,
  onNavigate: PropTypes.func.isRequired,
  onToggleFavorite: PropTypes.func.isRequired,
  onItemDrop: PropTypes.func.isRequired,
};

FolderNode.propTypes = {
  folder: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    parentId: PropTypes.string,
  }).isRequired,
  allFolders: PropTypes.array.isRequired,
  currentFolderId: PropTypes.string,
  expandedFolders: PropTypes.instanceOf(Set).isRequired,
  onToggle: PropTypes.func.isRequired,
  onNavigate: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onItemDrop: PropTypes.func.isRequired,
  depth: PropTypes.number,
};

Sidebar.propTypes = {
  explorer: PropTypes.shape({
    allFolders: PropTypes.array.isRequired,
    currentFolderId: PropTypes.string,
    navigateTo: PropTypes.func.isRequired,
    createFolder: PropTypes.func.isRequired,
    deleteFolder: PropTypes.func.isRequired,
    renameFolder: PropTypes.func.isRequired,
    expandedFolders: PropTypes.instanceOf(Set).isRequired,
    toggleFolderExpansion: PropTypes.func.isRequired,
    expandPathToFolder: PropTypes.func.isRequired,
    collapseAllFolders: PropTypes.func.isRequired,
  }).isRequired,
  showClose: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onNavigate: PropTypes.func,
  onOpenSettings: PropTypes.func.isRequired,
  onOpenReports: PropTypes.func.isRequired,
  onOpenTrash: PropTypes.func.isRequired,
  hasUnseenReports: PropTypes.bool.isRequired,
  themeMode: PropTypes.oneOf(['auto', 'light', 'dark']).isRequired,
  onCycleTheme: PropTypes.func.isRequired,
  onItemDrop: PropTypes.func.isRequired,
  favorites: PropTypes.shape({
    favorites: PropTypes.array.isRequired,
    toggleFavorite: PropTypes.func.isRequired,
  }),
  onSelectFile: PropTypes.func,
};
