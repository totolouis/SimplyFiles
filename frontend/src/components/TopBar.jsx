import React, { useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Search, Upload, X, Loader, Menu } from 'lucide-react';
import TasksIndicator from './TasksIndicator';
import TasksPanel from './TasksPanel';
import './TopBar.css';

const TopBar = forwardRef(function TopBar({ explorer, isMobile, onMenuOpen, tasksState }, ref) {
const { searchQuery, setSearchQuery, searching,
uploading, uploadFiles, doSearch, dragOver, setDragOver } = explorer;

const fileInputRef = useRef();
const searchInputRef = useRef();

// Expose refs to parent component
useImperativeHandle(ref, () => ({
focusSearch: () => searchInputRef.current?.focus(),
clickUpload: () => fileInputRef.current?.click(),
}));

  const handleSearch = e => {
    const q = e.target.value;
    setSearchQuery(q);
    if (q.trim().length >= 2) doSearch(q);
    else if (!q.trim()) doSearch('');
  };

  const handleFileChange = e => {
    const files = Array.from(e.target.files);
    if (files.length) uploadFiles(files);
    e.target.value = '';
  };

  const handleDrop = useCallback(e => {
    e.preventDefault(); setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) uploadFiles(files);
  }, [uploadFiles, setDragOver]);

  return (
    <div
      className={`topbar ${dragOver ? 'drag-over' : ''}`}
      onDrop={handleDrop}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
    >
{/* Hamburger — only on mobile */}
{isMobile && (
<button className="menu-btn" onClick={onMenuOpen}>
<Menu size={18} />
</button>
)}

<div className="topbar-right">
<div className="search-wrap">
<Search size={14} className="search-icon" />
<input ref={searchInputRef} className="search-input" placeholder={isMobile ? 'Search…' : 'Search content…'}
value={searchQuery} onChange={handleSearch} />
          {searching && <Loader size={13} className="search-spinner spin" />}
          {searchQuery && !searching && (
            <button className="search-clear" onClick={() => { setSearchQuery(''); doSearch(''); }}><X size={12} /></button>
          )}
        </div>

        <button className={`upload-btn ${uploading ? 'uploading' : ''}`}
          onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading
            ? <><Loader size={13} className="spin" />{!isMobile && ' Uploading…'}</>
            : <><Upload size={13} />{!isMobile && <span style={{marginLeft:5}}>Upload</span>}</>}
        </button>
        <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleFileChange} />

        {tasksState && (
          <TasksIndicator
            unreadCount={tasksState.unreadCount}
            onClick={tasksState.toggle}
          />
        )}
      </div>

      {tasksState?.isOpen && (
        <TasksPanel
          tasks={tasksState.tasks}
          onDismiss={tasksState.dismissAll}
          onClose={tasksState.close}
        />
      )}
</div>
);
});

export default TopBar;
