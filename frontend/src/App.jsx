import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useExplorer } from './hooks/useExplorer';
import { useIsMobile } from './hooks/useIsMobile';
import { useKeyboardHints } from './hooks/useKeyboardHints';
import { useTasks } from './hooks/useTasks';
import { useTheme } from './hooks/useTheme';
import { useFavorites } from './hooks/useFavorites';
import { api, indexApi } from './api';
import ErrorBoundary from './components/ErrorBoundary';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import Breadcrumbs from './components/Breadcrumbs';
import FileExplorer from './components/FileExplorer';
import PreviewPane from './components/PreviewPane';
import FolderPreviewPane from './components/FolderPreviewPane';
import SettingsPanel from './components/SettingsPanel';
import SyncReportsHistory from './components/SyncReportsHistory';
import KeyboardHints from './components/KeyboardHints';
import GotoFolderModal from './components/GotoFolderModal';
import TrashView from './components/TrashView';
import './App.css';

function useDisplayMode() {
  const [displayMode, setDisplayMode] = useState(() => {
    const saved = localStorage.getItem('simplyfiles-display-mode');
    return saved === 'wrap' ? 'wrap' : 'truncate';
  });

  useEffect(() => {
    localStorage.setItem('simplyfiles-display-mode', displayMode);
  }, [displayMode]);

  return [displayMode, setDisplayMode];
}

function AppContent() {
  const explorer = useExplorer();
  const isMobile = useIsMobile();
  const { hintsVisible } = useKeyboardHints();
  const tasksState = useTasks();
  const { mode: themeMode, cycleTheme } = useTheme();
  const favoritesState = useFavorites();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [hasUnseenReports, setHasUnseenReports] = useState(false);
  const [displayMode, setDisplayMode] = useDisplayMode();
  const [gotoModalOpen, setGotoModalOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const topBarRef = useRef(null);
  const explorerRef = useRef(null);

  // Check for unseen sync reports on mount
  useEffect(() => {
    indexApi.listSyncReports().then(reports => {
      if (reports.length === 0) return;
      const lastSeenId = localStorage.getItem('simplyfiles-last-seen-report');
      if (lastSeenId !== reports[0].id) {
        setHasUnseenReports(true);
      }
    }).catch(() => {});
  }, []);

  const handleSelectFavoriteFile = useCallback(async (fileId) => {
    try {
      const file = await api.getFile(fileId);
      explorer.setSelectedFile(file);
    } catch {
      // file may have been deleted
    }
  }, [explorer]);

  const openTrash = () => {
    setSidebarOpen(false);
    setTrashOpen(true);
  };

  const openSettings = () => {
    setSidebarOpen(false);
    setSettingsOpen(true);
  };

  const openReports = () => {
    setSidebarOpen(false);
    setReportsOpen(true);
    // Mark reports as seen
    indexApi.listSyncReports().then(reports => {
      if (reports.length > 0) {
        localStorage.setItem('simplyfiles-last-seen-report', reports[0].id);
      }
    }).catch(() => {});
    setHasUnseenReports(false);
  };

  const handleKeyDown = useCallback((e) => {
    const target = e.target;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      if (e.key !== 'Escape') return;
    }

    switch (e.key) {
      case '/':
        e.preventDefault();
        topBarRef.current?.focusSearch();
        break;
      case 'n':
        e.preventDefault();
        explorerRef.current?.triggerNewFolder();
        break;
      case 'u':
        e.preventDefault();
        topBarRef.current?.clickUpload();
        break;
      case 's':
        e.preventDefault();
        if (isMobile) {
          setSidebarOpen(prev => !prev);
        } else {
          setSidebarCollapsed(prev => !prev);
        }
        break;
      case 'r':
        e.preventDefault();
        explorer.refresh();
        break;
    case 'g':
      e.preventDefault();
      explorer.navigateTo(null);
      break;
    case 'f':
      e.preventDefault();
      setGotoModalOpen(true);
      break;
    case 'l':
        e.preventDefault();
        explorerRef.current?.triggerSymlink();
        break;
      case 'e':
        e.preventDefault();
        explorerRef.current?.triggerRename();
        break;
      case 'd':
        if (explorer.selectedFile) {
          e.preventDefault();
          const fileName = explorer.selectedFile.originalName || explorer.selectedFile.name;
          if (window.confirm(`Move "${fileName}" to trash?`)) {
            explorer.deleteFile(explorer.selectedFile.id);
          }
        } else if (explorer.selectedFolder) {
          e.preventDefault();
          const folderName = explorer.selectedFolder.name;
          if (window.confirm(`Move folder "${folderName}" and all its contents to trash?`)) {
            explorer.deleteFolder(explorer.selectedFolder.id);
          }
        }
        break;
      case 'Escape':
        if (explorer.selectedFile) {
          explorer.setSelectedFile(null);
        } else if (explorer.selectedFolder) {
          explorer.setSelectedFolder(null);
        } else if (explorer.searchQuery) {
          explorer.setSearchQuery('');
          explorer.doSearch('');
        }
        break;
    }
  }, [explorer, isMobile]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleItemDrop = useCallback((type, id, folderId) => {
    if (type === 'file') explorer.moveFile(id, folderId);
    else if (type === 'folder') explorer.moveFolder(id, folderId);
  }, [explorer]);

  return (
    <div className="app-layout">
      {/* Desktop sidebar */}
      {!isMobile && !sidebarCollapsed && (
        <Sidebar explorer={explorer} onClose={() => {}} onOpenSettings={openSettings} onOpenReports={openReports} onOpenTrash={openTrash} hasUnseenReports={hasUnseenReports} themeMode={themeMode} onCycleTheme={cycleTheme} onItemDrop={handleItemDrop} favorites={favoritesState} onSelectFile={handleSelectFavoriteFile} />
      )}

      {/* Mobile sidebar overlay */}
      {isMobile && sidebarOpen && (
        <>
          <div className="mobile-overlay" onClick={() => setSidebarOpen(false)} />
          <div className="mobile-sidebar">
            <Sidebar
              explorer={explorer}
              showClose
              onClose={() => setSidebarOpen(false)}
              onNavigate={() => setSidebarOpen(false)}
              onOpenSettings={openSettings}
              onOpenReports={openReports}
              onOpenTrash={openTrash}
              hasUnseenReports={hasUnseenReports}
              themeMode={themeMode}
              onCycleTheme={cycleTheme}
              onItemDrop={handleItemDrop}
              favorites={favoritesState}
              onSelectFile={handleSelectFavoriteFile}
            />
          </div>
        </>
      )}

      {/* Main area */}
      <div className="main-area">
        <TopBar
          ref={topBarRef}
          explorer={explorer}
          isMobile={isMobile}
          onMenuOpen={() => setSidebarOpen(true)}
          tasksState={tasksState}
        />
        <Breadcrumbs
          breadcrumbs={explorer.breadcrumbs}
          navigateTo={explorer.navigateTo}
          dragOver={explorer.dragOver}
          onItemDrop={handleItemDrop}
        />
      <div className="content-area">
        <FileExplorer ref={explorerRef} explorer={explorer} isMobile={isMobile} displayMode={displayMode} onGotoFolder={() => setGotoModalOpen(true)} favorites={favoritesState} />
          {!isMobile && explorer.selectedFile && (
            <PreviewPane
              file={explorer.selectedFile}
              onClose={() => explorer.setSelectedFile(null)}
              onDelete={explorer.deleteFile}
              onMove={explorer.refresh}
              onRenameFile={explorer.renameFile}
              folders={explorer.allFolders}
              currentFolderId={explorer.currentFolderId}
              favorites={favoritesState}
            />
          )}
          {!isMobile && explorer.selectedFolder && (
            <FolderPreviewPane
              folder={explorer.selectedFolder}
              onClose={() => explorer.setSelectedFolder(null)}
              onDelete={explorer.deleteFolder}
              onRename={explorer.renameFolder}
              onMove={explorer.moveFolder}
              onNavigate={explorer.navigateTo}
              folders={explorer.allFolders}
              currentFolderId={explorer.currentFolderId}
            />
          )}
        </div>
      </div>

      {/* Mobile bottom-sheet file preview */}
      {isMobile && explorer.selectedFile && (
        <>
          <div className="mobile-overlay" onClick={() => explorer.setSelectedFile(null)} />
          <div className="mobile-bottom-sheet">
            <PreviewPane
              file={explorer.selectedFile}
              onClose={() => explorer.setSelectedFile(null)}
              onDelete={explorer.deleteFile}
              onMove={explorer.refresh}
              onRenameFile={explorer.renameFile}
              folders={explorer.allFolders}
              currentFolderId={explorer.currentFolderId}
              isMobile
              favorites={favoritesState}
            />
          </div>
        </>
      )}

      {/* Mobile bottom-sheet folder preview */}
      {isMobile && explorer.selectedFolder && (
        <div className="mobile-bottom-sheet">
          <FolderPreviewPane
            folder={explorer.selectedFolder}
            onClose={() => explorer.setSelectedFolder(null)}
            onDelete={explorer.deleteFolder}
            onRename={explorer.renameFolder}
            onMove={explorer.moveFolder}
            onNavigate={explorer.navigateTo}
            folders={explorer.allFolders}
            currentFolderId={explorer.currentFolderId}
            isMobile
          />
        </div>
      )}

      {/* Settings panel */}
      {settingsOpen && (
        <SettingsPanel
          onClose={() => setSettingsOpen(false)}
          currentFolderId={explorer.currentFolderId}
          displayMode={displayMode}
          setDisplayMode={setDisplayMode}
          onSyncComplete={() => setHasUnseenReports(true)}
        />
      )}

      {/* Sync reports history */}
      {reportsOpen && (
        <SyncReportsHistory onClose={() => setReportsOpen(false)} />
      )}

      {/* Trash view */}
      {trashOpen && (
        <TrashView
          onClose={() => setTrashOpen(false)}
          onRestored={() => explorer.refresh()}
        />
      )}

      {/* Keyboard hints overlay */}
      <KeyboardHints visible={hintsVisible} />

      {/* Goto folder modal */}
      {gotoModalOpen && (
        <GotoFolderModal
          onClose={() => setGotoModalOpen(false)}
          onNavigate={explorer.navigateTo}
          isMobile={isMobile}
        />
      )}

    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
