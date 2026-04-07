import React, { useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import PropTypes from 'prop-types';
import {
  Folder, File, FileText, FileImage, Film, Music,
  Archive, Code, Table, Loader, Search, Plus, Pencil,
  Trash2, FolderOpen, Link, FolderPlus, FolderSearch, Star, ChevronRight,
} from 'lucide-react';
import { api } from '../api';
import { formatSize, formatDateShort } from '../utils';
import CreateSymlinkModal from './CreateSymlinkModal';
import './FileExplorer.css';

function getFileIcon(mimeType, filename) {
  if (!mimeType) mimeType = '';
  if (mimeType.startsWith('image/')) return <FileImage size={32} />;
  if (mimeType.startsWith('video/')) return <Film size={32} />;
  if (mimeType.startsWith('audio/')) return <Music size={32} />;
  if (mimeType === 'application/pdf') return <FileText size={32} />;
  if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('gzip')) return <Archive size={32} />;
  if (mimeType.includes('json') || mimeType.includes('javascript') || filename?.match(/\.(js|ts|jsx|tsx|py|go|rs|java|c|cpp|css|html|sh)$/)) return <Code size={32} />;
  if (mimeType.includes('csv') || mimeType.includes('excel') || mimeType.includes('spreadsheet')) return <Table size={32} />;
  if (mimeType.startsWith('text/')) return <FileText size={32} />;
  return <File size={32} />;
}

function getIconColor(mimeType, filename) {
  if (!mimeType) mimeType = '';
  if (mimeType.startsWith('image/')) return '#47b3ff';
  if (mimeType.startsWith('video/')) return '#ff47b3';
  if (mimeType.startsWith('audio/')) return '#b347ff';
  if (mimeType === 'application/pdf') return '#ff6b47';
  if (mimeType.includes('json') || filename?.match(/\.(js|ts|jsx|tsx|py|go|rs|java)$/)) return '#47ff8e';
  if (mimeType.startsWith('text/')) return '#e8e8e8';
  return '#666';
}

// Safely render search snippets: only preserve <mark> highlights as React elements
function HighlightedSnippet({ html }) {
  if (!html) return null;
  const parts = [];
  const regex = /<mark>([\s\S]*?)<\/mark>/gi;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(html)) !== null) {
    if (match.index > lastIndex) {
      parts.push(html.slice(lastIndex, match.index).replace(/<[^>]*>/g, ''));
    }
    parts.push(<mark key={parts.length}>{match[1].replace(/<[^>]*>/g, '')}</mark>);
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < html.length) {
    parts.push(html.slice(lastIndex).replace(/<[^>]*>/g, ''));
  }
  return <div className="search-row-snippet">{parts}</div>;
}

function FileCard({ file, onSelect, onDelete, isSelected, displayMode, favorites }) {
  const nameClass = displayMode === 'wrap' ? 'file-card-name wrap' : 'file-card-name truncate';
  const isFav = favorites?.isFavorite('file', file.id);

  const handleDragStart = (e) => {
    e.dataTransfer.setData('application/x-docvault-type', 'file');
    e.dataTransfer.setData('application/x-docvault-id', file.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      className={`file-card ${isSelected ? 'selected' : ''} ${displayMode === 'wrap' ? 'expanded' : ''}`}
      onClick={() => onSelect(file)}
      onDoubleClick={() => window.open(api.downloadUrl(file.id), '_blank')}
      draggable
      onDragStart={handleDragStart}
    >
      <div className="file-card-icon" style={{ color: getIconColor(file.mimeType, file.filename) }}>
        {getFileIcon(file.mimeType, file.filename)}
      </div>
      <div className={nameClass} title={file.filename}>{file.filename}</div>
      <div className="file-card-meta">{formatSize(file.size)}</div>
      {file.indexStatus && file.indexStatus !== 'indexed' && (
        <div className={`file-status-badge status-${file.indexStatus}`} title={
          file.indexStatus === 'no_content' ? 'Cannot extract text' :
          file.indexStatus === 'pending' ? 'Not indexed' : file.indexStatus
        }>
          {file.indexStatus === 'no_content' ? 'no text' : file.indexStatus === 'pending' ? 'not indexed' : file.indexStatus}
        </div>
      )}
      {!!file.isSymlink && (
        <div className="symlink-overlay" title="Symlink">
          <Link size={10} />
        </div>
      )}
      {favorites && (
        <button
          className={`file-card-star ${isFav ? 'starred' : ''}`}
          onClick={e => { e.stopPropagation(); favorites.toggleFavorite('file', file.id); }}
          title={isFav ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Star size={12} fill={isFav ? 'currentColor' : 'none'} />
        </button>
      )}
      <button
        className="file-card-delete"
        onClick={e => { e.stopPropagation(); onDelete(file.id); }}
        title="Move to trash"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function FolderCard({ folder, onNavigate, onDelete, isSelected, isMobile, onSelect, displayMode, onDrop, favorites }) {
  const [dragOver, setDragOver] = useState(false);
  const isFav = favorites?.isFavorite('folder', folder.id);

  const handleClick = () => {
    if (isMobile) {
      if (isSelected) {
        onNavigate(folder.id);
      } else {
        onSelect(folder);
      }
    } else {
      onNavigate(folder.id);
    }
  };

  const handleDragStart = (e) => {
    e.dataTransfer.setData('application/x-docvault-type', 'folder');
    e.dataTransfer.setData('application/x-docvault-id', folder.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
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
    onDrop(type, id, folder.id);
  };

  const nameClass = displayMode === 'wrap' ? 'folder-card-name wrap' : 'folder-card-name truncate';

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={`folder-card ${isSelected ? 'selected' : ''} ${displayMode === 'wrap' ? 'expanded' : ''} ${dragOver ? 'drop-target' : ''}`}
      onClick={handleClick}
      onDoubleClick={() => onNavigate(folder.id)}
      onKeyDown={handleKeyDown}
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="folder-card-icon">
        <FolderOpen size={32} />
      </div>
      <div className={nameClass} title={folder.name}>{folder.name}</div>
      <div className="folder-card-meta">folder</div>
      {isMobile && (
        <button
          className="folder-open-btn"
          onClick={e => { e.stopPropagation(); onNavigate(folder.id); }}
          title="Open folder"
        >
          <ChevronRight size={16} />
        </button>
      )}
      {!!folder.isSymlink && (
        <div className="symlink-overlay" title="Symlink">
          <Link size={10} />
        </div>
      )}
      {favorites && (
        <button
          className={`file-card-star ${isFav ? 'starred' : ''}`}
          onClick={e => { e.stopPropagation(); favorites.toggleFavorite('folder', folder.id); }}
          title={isFav ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Star size={12} fill={isFav ? 'currentColor' : 'none'} />
        </button>
      )}
      {!isMobile && (
        <button
          className="file-card-delete"
          onClick={e => { e.stopPropagation(); onDelete(folder.id); }}
          title="Move to trash"
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}

function SearchResultRow({ result, onSelect }) {
  return (
    <div className="search-row" onClick={() => onSelect(result)}>
      <div className="search-row-icon" style={{ color: getIconColor(result.mimeType, result.filename) }}>
        {getFileIcon(result.mimeType, result.filename)}
      </div>
      <div className="search-row-info">
        <div className="search-row-name">{result.filename}</div>
        {result.snippet && <HighlightedSnippet html={result.snippet} />}
      </div>
      <div className="search-row-size">{formatSize(result.size)}</div>
    </div>
  );
}

const FileExplorer = forwardRef(function FileExplorer({ explorer, isMobile, displayMode = 'truncate', onGotoFolder, favorites }, ref) {
  const {
    contents, selectedFile, setSelectedFile, selectedFolder, setSelectedFolder, loading,
    searchResults, searchQuery, navigateTo, deleteFile, deleteFolder,
    createFolder, currentFolderId, uploading, renameFolder, allFolders,
    moveFile, moveFolder,
  } = explorer;

  const [newFolderInline, setNewFolderInline] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingFolder, setRenamingFolder] = useState(false);
  const [renameFolderName, setRenameFolderName] = useState('');
  const [showSymlinkModal, setShowSymlinkModal] = useState(false);

  useImperativeHandle(ref, () => ({
    triggerNewFolder: () => setNewFolderInline(true),
    triggerSymlink: () => setShowSymlinkModal(true),
    triggerRename: () => startRenameFolder(),
  }));

  const currentFolder = allFolders.find(f => f.id === currentFolderId);

  const handleItemDrop = useCallback(async (type, itemId, targetFolderId) => {
    if (type === 'file') {
      await moveFile(itemId, targetFolderId);
    } else if (type === 'folder') {
      if (itemId === targetFolderId) return;
      await moveFolder(itemId, targetFolderId);
    }
  }, [moveFile, moveFolder]);

  const startRenameFolder = () => {
    if (!currentFolder) return;
    setRenameFolderName(currentFolder.name);
    setRenamingFolder(true);
  };

  const handleRenameFolder = async (e) => {
    if (e) e.preventDefault();
    const trimmed = renameFolderName.trim();
    if (trimmed && trimmed !== currentFolder?.name) {
      await renameFolder(currentFolderId, trimmed);
    }
    setRenamingFolder(false);
  };

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    await createFolder(newFolderName.trim());
    setNewFolderName('');
    setNewFolderInline(false);
  };

  // Show search results
  if (searchResults !== null) {
    return (
      <div className="explorer">
        <div className="explorer-header">
          <Search size={14} className="header-icon" />
          <span className="header-title">Results for "{searchQuery}"</span>
          <span className="header-count">{searchResults.length} found</span>
        </div>
        <div className="search-results">
          {searchResults.length === 0 ? (
            <div className="empty-state">
              <Search size={40} />
              <p>No results for "{searchQuery}"</p>
              <span>Only text-based files are indexed</span>
            </div>
          ) : (
            searchResults.map(r => (
              <SearchResultRow
                key={r.fileId}
                result={{ ...r, id: r.fileId }}
                onSelect={f => setSelectedFile({ ...f, id: f.fileId || f.id })}
              />
            ))
          )}
        </div>
      </div>
    );
  }

  const { folders, files } = contents;
  const isEmpty = folders.length === 0 && files.length === 0;

  return (
    <div className="explorer">
      <div className="explorer-header">
        <Folder size={14} className="header-icon" />
        <span className="header-title">
          {currentFolderId === null ? 'All Files' : 'Contents'}
        </span>
        <span className="header-count">{folders.length + files.length} items</span>
        {renamingFolder ? (
          <form className="rename-folder-inline" onSubmit={handleRenameFolder}>
            <input
              autoFocus
              value={renameFolderName}
              onChange={e => setRenameFolderName(e.target.value)}
              onBlur={() => handleRenameFolder()}
              onKeyDown={e => e.key === 'Escape' && setRenamingFolder(false)}
              placeholder="Folder name"
            />
          </form>
        ) : (
          <button
            className="rename-folder-btn"
            onClick={startRenameFolder}
            disabled={currentFolderId === null}
            title={currentFolderId === null ? 'Cannot rename Home' : `Rename "${currentFolder?.name}"`}
          >
            <Pencil size={12} />
            {!isMobile && <span>Rename</span>}
          </button>
        )}
        {onGotoFolder && (
          <button
            className="new-folder-btn"
            onClick={onGotoFolder}
            title="Goto folder"
          >
            <FolderSearch size={isMobile ? 14 : 12} />
            {!isMobile && <span>Goto</span>}
          </button>
        )}
        <button
          className="new-folder-btn"
          onClick={() => setNewFolderInline(true)}
          title="New folder"
        >
          <FolderPlus size={isMobile ? 14 : 12} />
          {!isMobile && <span>New Folder</span>}
        </button>
        <button
          className="new-folder-btn"
          onClick={() => setShowSymlinkModal(true)}
          title="Create symlink"
        >
          <Link size={isMobile ? 14 : 12} />
          {!isMobile && <span>Symlink</span>}
        </button>
      </div>

      {loading ? (
        <div className="loading-state">
          <Loader size={24} className="spin" />
        </div>
      ) : (
        <div className="explorer-grid-wrap">
          {isEmpty && !newFolderInline ? (
            <div className="empty-state">
              <FolderOpen size={48} />
              <p>This folder is empty</p>
              <span>Upload files or create a folder to get started</span>
            </div>
          ) : (
            <div className="file-grid">
              {newFolderInline && (
                <form className="new-folder-card" onSubmit={handleCreateFolder}>
                  <div className="folder-card-icon"><Folder size={32} /></div>
                  <input
                    autoFocus
                    value={newFolderName}
                    onChange={e => setNewFolderName(e.target.value)}
                    placeholder="folder name"
                    onBlur={() => { setNewFolderInline(false); setNewFolderName(''); }}
                    onKeyDown={e => e.key === 'Escape' && setNewFolderInline(false)}
                  />
                </form>
              )}
              {folders.map(f => (
                <FolderCard
                  key={f.id}
                  folder={f}
                  onNavigate={navigateTo}
                  onDelete={deleteFolder}
                  isSelected={selectedFolder?.id === f.id}
                  isMobile={isMobile}
                  onSelect={setSelectedFolder}
                  displayMode={displayMode}
                  onDrop={handleItemDrop}
                  favorites={favorites}
                />
              ))}
              {files.map(f => (
                <FileCard
                  key={f.id}
                  file={f}
                  isSelected={selectedFile?.id === f.id}
                  onSelect={setSelectedFile}
                  onDelete={deleteFile}
                  displayMode={displayMode}
                  favorites={favorites}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {showSymlinkModal && (
        <CreateSymlinkModal
          destinationFolderId={currentFolderId}
          onClose={() => setShowSymlinkModal(false)}
          onSuccess={() => { explorer.refresh(); }}
          isMobile={isMobile}
        />
      )}

      {uploading && (
        <div className="upload-overlay">
          <Loader size={20} className="spin" />
          <span>Uploading...</span>
        </div>
      )}
    </div>
  );
});

FileCard.propTypes = {
  file: PropTypes.shape({
    id: PropTypes.string.isRequired,
    filename: PropTypes.string.isRequired,
    size: PropTypes.number,
    mimeType: PropTypes.string,
    isSymlink: PropTypes.bool,
  }).isRequired,
  onSelect: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  isSelected: PropTypes.bool.isRequired,
  displayMode: PropTypes.string.isRequired,
  favorites: PropTypes.shape({
    isFavorite: PropTypes.func,
    toggleFavorite: PropTypes.func,
  }),
};

FolderCard.propTypes = {
  folder: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    isSymlink: PropTypes.bool,
  }).isRequired,
  onNavigate: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  isSelected: PropTypes.bool.isRequired,
  isMobile: PropTypes.bool.isRequired,
  onSelect: PropTypes.func.isRequired,
  displayMode: PropTypes.string.isRequired,
  onDrop: PropTypes.func.isRequired,
  favorites: PropTypes.shape({
    isFavorite: PropTypes.func,
    toggleFavorite: PropTypes.func,
  }),
};

SearchResultRow.propTypes = {
  result: PropTypes.shape({
    fileId: PropTypes.string,
    id: PropTypes.string,
    filename: PropTypes.string.isRequired,
    mimeType: PropTypes.string,
    size: PropTypes.number,
    snippet: PropTypes.string,
  }).isRequired,
  onSelect: PropTypes.func.isRequired,
};

FileExplorer.propTypes = {
  explorer: PropTypes.shape({
    contents: PropTypes.shape({
      folders: PropTypes.array.isRequired,
      files: PropTypes.array.isRequired,
    }).isRequired,
    selectedFile: PropTypes.object,
    setSelectedFile: PropTypes.func.isRequired,
    selectedFolder: PropTypes.object,
    setSelectedFolder: PropTypes.func.isRequired,
    loading: PropTypes.bool.isRequired,
    searchResults: PropTypes.array,
    searchQuery: PropTypes.string,
    navigateTo: PropTypes.func.isRequired,
    deleteFile: PropTypes.func.isRequired,
    deleteFolder: PropTypes.func.isRequired,
    createFolder: PropTypes.func.isRequired,
    currentFolderId: PropTypes.string,
    uploading: PropTypes.bool.isRequired,
    renameFolder: PropTypes.func.isRequired,
    allFolders: PropTypes.array.isRequired,
    moveFile: PropTypes.func.isRequired,
    moveFolder: PropTypes.func.isRequired,
    refresh: PropTypes.func,
  }).isRequired,
  isMobile: PropTypes.bool.isRequired,
  displayMode: PropTypes.string,
  onGotoFolder: PropTypes.func,
  favorites: PropTypes.shape({
    isFavorite: PropTypes.func.isRequired,
    toggleFavorite: PropTypes.func.isRequired,
  }),
};

FileExplorer.defaultProps = {
  displayMode: 'truncate',
};

export default FileExplorer;
