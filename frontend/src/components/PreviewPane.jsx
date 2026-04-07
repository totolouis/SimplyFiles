import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { X, Download, Trash2, File, ExternalLink, Move, Pencil, Loader, Star } from 'lucide-react';
import { api } from '../api';
import { formatSize, formatDate } from '../utils';
import MoveFileModal from './MoveFileModal';
import './PreviewPane.css';

function PreviewContent({ file }) {
  const [textContent, setTextContent] = useState(null);
  const [brokenSymlink, setBrokenSymlink] = useState(null);
  const url = api.streamUrl(file.id);
  const mime = file.mimeType || '';
  const isText = mime.startsWith('text/') || mime.includes('json') || mime.includes('javascript')
    || /\.(txt|md|csv|log|json|js|ts|jsx|tsx|html|css|xml|yaml|yml|sh|env|py|go|rs|java|c|cpp)$/i.test(file.filename);

  // Check if symlink is broken via HEAD request
  useEffect(() => {
    setBrokenSymlink(null);
    if (file.isSymlink) {
      fetch(url, { method: 'HEAD' })
        .then(r => setBrokenSymlink(r.status === 422))
        .catch(() => setBrokenSymlink(true));
    } else {
      setBrokenSymlink(false);
    }
  }, [file.id]);

  useEffect(() => {
    setTextContent(null);
    if (isText && brokenSymlink == false) {
      fetch(url).then(r => r.text()).then(setTextContent).catch(() => setTextContent('Could not load.'));
    }
  }, [file.id, brokenSymlink]);

  if (file.isSymlink && brokenSymlink === null)
    return <div className="preview-loading">Loading…</div>;

  if (file.isSymlink && brokenSymlink)
    return (
      <div className="preview-no-preview">
        <File size={48} />
        <p>Broken symlink</p>
        <span>The symlink target no longer exists on disk</span>
      </div>
    );

  if (mime.startsWith('image/'))
    return <div className="preview-image-wrap"><img src={url} alt={file.filename} className="preview-image" /></div>;

  if (mime === 'application/pdf')
    return <iframe src={url} className="preview-iframe" title={file.filename} />;

  if (mime.startsWith('video/'))
    return <div className="preview-media-wrap"><video src={url} controls className="preview-video" /></div>;

  if (mime.startsWith('audio/'))
    return <div className="preview-audio-wrap"><audio src={url} controls className="preview-audio" /></div>;

  if (isText && textContent !== null)
    return <div className="preview-text-wrap"><pre className="preview-text">{textContent}</pre></div>;

  if (isText)
    return <div className="preview-loading">Loading…</div>;

  return (
    <div className="preview-no-preview">
      <File size={48} />
      <p>No preview available</p>
      <span>{mime || 'Unknown type'}</span>
    </div>
  );
}

export default function PreviewPane({ file, onClose, onDelete, onMove, onRenameFile, folders, currentFolderId, isMobile, favorites }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [isRenamingFile, setIsRenamingFile] = useState(false);
  const [renameFileName, setRenameFileName] = useState('');
  const [renaming, setRenaming] = useState(false);

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    await onDelete(file.id);
  };

  const handleRenameFile = async (e) => {
    if (e) e.preventDefault();
    const trimmed = renameFileName.trim();
    if (!trimmed || trimmed === file.filename) {
      setIsRenamingFile(false);
      return;
    }
    setRenaming(true);
    try {
      if (onRenameFile) await onRenameFile(file.id, trimmed);
    } finally {
      setRenaming(false);
      setIsRenamingFile(false);
    }
  };

  return (
    <div className="preview-pane" style={isMobile ? { width: '100%', minWidth: 0, borderLeft: 'none', borderRadius: '16px 16px 0 0', height: '100%' } : {}}>
      {/* Drag handle on mobile */}
      {isMobile && <div className="preview-handle" />}

      <div className="preview-header">
        <div className="preview-header-top">
          {isRenamingFile ? (
            <form className="preview-rename-form" onSubmit={handleRenameFile}>
              <input
                autoFocus
                type="text"
                value={renameFileName}
                onChange={(e) => setRenameFileName(e.target.value)}
                onBlur={handleRenameFile}
                onKeyDown={(e) => { if (e.key === 'Escape') setIsRenamingFile(false); }}
                disabled={renaming}
                className="preview-rename-input"
              />
              {renaming && <Loader size={14} className="spin" />}
            </form>
          ) : (
            <div className="preview-title truncate" title={file.filename}>{file.filename}</div>
          )}
          <button className="preview-action-btn" onClick={onClose} title="Close"><X size={14} /></button>
        </div>
        <div className="preview-actions">
          {favorites && (() => {
            const isFav = favorites.isFavorite('file', file.id);
            return (
              <button
                className={`preview-action-btn ${isFav ? 'starred' : ''}`}
                onClick={() => favorites.toggleFavorite('file', file.id)}
                title={isFav ? 'Remove from favorites' : 'Add to favorites'}
              >
                <Star size={14} />
              </button>
            );
          })()}
          <button
            className="preview-action-btn"
            onClick={() => { setIsRenamingFile(true); setRenameFileName(file.filename); }}
            title="Rename file"
          >
            <Pencil size={14} />
          </button>
          <button className="preview-action-btn" onClick={() => setShowMoveModal(true)} title="Move file">
            <Move size={14} />
          </button>
          <a href={api.downloadUrl(file.id)} download={file.filename} className="preview-action-btn" title="Download">
            <Download size={14} />
          </a>
          <a href={api.streamUrl(file.id)} target="_blank" rel="noreferrer" className="preview-action-btn" title="Open in new tab">
            <ExternalLink size={14} />
          </a>
          <button
            className={`preview-action-btn delete-btn ${confirmDelete ? 'confirm' : ''}`}
            onClick={handleDelete} onBlur={() => setConfirmDelete(false)}
            title={(() => {
              if (confirmDelete && file.isSymlink) return 'This will only remove the symlink, not the original file';
              if (confirmDelete) return 'Click again to confirm';
              return 'Move to trash';
            })()}
          >
            <Trash2 size={14} />
            {confirmDelete && <span>{file.isSymlink ? 'Remove symlink only?' : 'Confirm?'}</span>}
          </button>
        </div>
      </div>

      <div className="preview-meta">
        <div className="meta-row">
          <span className="meta-label">Size</span>
          <span className="meta-value">{formatSize(file.size)}</span>
        </div>
        <div className="meta-row">
          <span className="meta-label">Type</span>
          <span className="meta-value mono truncate">{file.mimeType || '—'}</span>
        </div>
        <div className="meta-row">
          <span className="meta-label">Added</span>
          <span className="meta-value">{formatDate(file.createdAt)}</span>
        </div>
        {!!file.isSymlink && (
          <div className="meta-row">
            <span className="meta-label">Kind</span>
            <span className="meta-value">Symlink</span>
          </div>
        )}
      </div>

      <div className="preview-content">
        <PreviewContent file={file} />
      </div>

{showMoveModal && (
      <MoveFileModal
        file={file}
        folders={folders}
        currentFolderId={currentFolderId}
        onClose={() => setShowMoveModal(false)}
        onMove={onMove}
        isMobile={isMobile}
      />
    )}
  </div>
);
}

PreviewContent.propTypes = {
  file: PropTypes.shape({
    id: PropTypes.string.isRequired,
    filename: PropTypes.string.isRequired,
    mimeType: PropTypes.string,
    isSymlink: PropTypes.bool,
    size: PropTypes.number,
  }).isRequired,
};

PreviewPane.propTypes = {
  file: PropTypes.shape({
    id: PropTypes.string.isRequired,
    filename: PropTypes.string.isRequired,
    mimeType: PropTypes.string,
    size: PropTypes.number,
    isSymlink: PropTypes.bool,
    createdAt: PropTypes.string,
  }).isRequired,
  onClose: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onMove: PropTypes.func.isRequired,
  onRenameFile: PropTypes.func,
  folders: PropTypes.array.isRequired,
  currentFolderId: PropTypes.string,
  isMobile: PropTypes.bool.isRequired,
  favorites: PropTypes.shape({
    isFavorite: PropTypes.func.isRequired,
    toggleFavorite: PropTypes.func.isRequired,
  }),
};
