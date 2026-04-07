import React, { createRef } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('./FileExplorer.css', () => ({}));
vi.mock('./CreateSymlinkModal.css', () => ({}));
vi.mock('./MoveFileModal.css', () => ({}));

vi.mock('../api', () => ({
  api: {
    downloadUrl: (id) => `/api/files/${id}/download`,
    streamUrl: (id) => `/api/files/${id}/stream`,
  },
}));

vi.mock('./CreateSymlinkModal', () => ({
  default: () => <div data-testid="symlink-modal" />,
}));

import FileExplorer from './FileExplorer';

function makeDragEvent(data = {}) {
  const types = Object.keys(data);
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: {
      types,
      getData: vi.fn((key) => data[key] || ''),
      setData: vi.fn(),
      effectAllowed: '',
      dropEffect: '',
    },
  };
}

const baseExplorer = {
  contents: { folders: [], files: [] },
  selectedFile: null,
  setSelectedFile: vi.fn(),
  selectedFolder: null,
  setSelectedFolder: vi.fn(),
  loading: false,
  searchResults: null,
  searchQuery: '',
  navigateTo: vi.fn(),
  deleteFile: vi.fn(),
  deleteFolder: vi.fn(),
  createFolder: vi.fn(),
  currentFolderId: null,
  uploading: false,
  renameFolder: vi.fn(),
  allFolders: [],
  refresh: vi.fn(),
  moveFile: vi.fn(),
  moveFolder: vi.fn(),
};

describe('FileExplorer', () => {
  describe('symlink overlays', () => {
    it('should render symlink overlay on a file card', () => {
      const explorer = {
        ...baseExplorer,
        contents: {
          folders: [],
          files: [
            { id: 'f1', filename: 'linked.txt', mimeType: 'text/plain', size: 100, isSymlink: true },
          ],
        },
      };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      const overlay = document.querySelector('.symlink-overlay');
      expect(overlay).toBeInTheDocument();
      expect(overlay).toHaveAttribute('title', 'Symlink');
    });

    it('should NOT render symlink overlay on a regular file card', () => {
      const explorer = {
        ...baseExplorer,
        contents: {
          folders: [],
          files: [
            { id: 'f2', filename: 'regular.txt', mimeType: 'text/plain', size: 100, isSymlink: false },
          ],
        },
      };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      expect(document.querySelector('.symlink-overlay')).not.toBeInTheDocument();
    });

    it('should render symlink overlay on a folder card', () => {
      const explorer = {
        ...baseExplorer,
        contents: {
          folders: [{ id: 'fo1', name: 'linked-folder', isSymlink: true }],
          files: [],
        },
      };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      const overlay = document.querySelector('.symlink-overlay');
      expect(overlay).toBeInTheDocument();
    });

    it('should NOT render symlink overlay on a regular folder card', () => {
      const explorer = {
        ...baseExplorer,
        contents: {
          folders: [{ id: 'fo2', name: 'regular-folder', isSymlink: false }],
          files: [],
        },
      };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      expect(document.querySelector('.symlink-overlay')).not.toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('should show empty state when no files or folders', () => {
      render(<FileExplorer explorer={baseExplorer} isMobile={false} />);

      expect(screen.getByText('This folder is empty')).toBeInTheDocument();
    });

    it('should show upload hint in empty state', () => {
      render(<FileExplorer explorer={baseExplorer} isMobile={false} />);

      expect(screen.getByText('Upload files or create a folder to get started')).toBeInTheDocument();
    });
  });

  describe('header', () => {
    it('should show "All Files" when at root', () => {
      render(<FileExplorer explorer={baseExplorer} isMobile={false} />);

      expect(screen.getByText('All Files')).toBeInTheDocument();
    });

    it('should show "Contents" when inside a folder', () => {
      const explorer = {
        ...baseExplorer,
        currentFolderId: 'folder-1',
        allFolders: [{ id: 'folder-1', name: 'Docs', parentId: null }],
      };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      expect(screen.getByText('Contents')).toBeInTheDocument();
    });

    it('should show item count', () => {
      const explorer = {
        ...baseExplorer,
        contents: {
          folders: [{ id: 'fo1', name: 'A', isSymlink: false }],
          files: [
            { id: 'f1', filename: 'a.txt', mimeType: 'text/plain', size: 10, isSymlink: false },
            { id: 'f2', filename: 'b.txt', mimeType: 'text/plain', size: 20, isSymlink: false },
          ],
        },
      };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      expect(screen.getByText('3 items')).toBeInTheDocument();
    });

    it('should show "Symlink" button in the header', () => {
      render(<FileExplorer explorer={baseExplorer} isMobile={false} />);

      expect(screen.getByText('Symlink')).toBeInTheDocument();
    });

    it('should show "New Folder" button in the header', () => {
      render(<FileExplorer explorer={baseExplorer} isMobile={false} />);

      expect(screen.getByText('New Folder')).toBeInTheDocument();
    });

    it('should show "Rename" button in the header', () => {
      render(<FileExplorer explorer={baseExplorer} isMobile={false} />);

      expect(screen.getByText('Rename')).toBeInTheDocument();
    });

    it('should disable rename button at root', () => {
      render(<FileExplorer explorer={baseExplorer} isMobile={false} />);

      const renameBtn = screen.getByTitle('Cannot rename Home');
      expect(renameBtn).toBeDisabled();
    });

    it('should hide text labels on mobile', () => {
      render(<FileExplorer explorer={baseExplorer} isMobile={true} />);

      expect(screen.queryByText('New Folder')).not.toBeInTheDocument();
      expect(screen.queryByText('Symlink')).not.toBeInTheDocument();
      expect(screen.queryByText('Rename')).not.toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('should show spinner when loading', () => {
      const explorer = { ...baseExplorer, loading: true };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      expect(document.querySelector('.loading-state')).toBeInTheDocument();
    });
  });

  describe('uploading overlay', () => {
    it('should show uploading overlay when uploading', () => {
      const explorer = { ...baseExplorer, uploading: true };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      expect(screen.getByText('Uploading...')).toBeInTheDocument();
    });

    it('should not show uploading overlay when not uploading', () => {
      render(<FileExplorer explorer={baseExplorer} isMobile={false} />);

      expect(screen.queryByText('Uploading...')).not.toBeInTheDocument();
    });
  });

  describe('search results', () => {
    it('should show search results view when searchResults is set', () => {
      const explorer = {
        ...baseExplorer,
        searchResults: [
          { fileId: 'f1', filename: 'result.txt', mimeType: 'text/plain', size: 50 },
        ],
        searchQuery: 'hello',
      };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      expect(screen.getByText('Results for "hello"')).toBeInTheDocument();
      expect(screen.getByText('1 found')).toBeInTheDocument();
    });

    it('should show empty search state when no results', () => {
      const explorer = {
        ...baseExplorer,
        searchResults: [],
        searchQuery: 'nonexistent',
      };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      expect(screen.getByText('No results for "nonexistent"')).toBeInTheDocument();
    });
  });

  describe('file interactions', () => {
    it('should call setSelectedFile when clicking a file', () => {
      const setSelectedFile = vi.fn();
      const explorer = {
        ...baseExplorer,
        setSelectedFile,
        contents: {
          folders: [],
          files: [{ id: 'f1', filename: 'test.txt', mimeType: 'text/plain', size: 100, isSymlink: false }],
        },
      };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      fireEvent.click(screen.getByText('test.txt'));
      expect(setSelectedFile).toHaveBeenCalled();
    });

    it('should call deleteFile when clicking delete button on file', () => {
      const deleteFile = vi.fn();
      const explorer = {
        ...baseExplorer,
        deleteFile,
        contents: {
          folders: [],
          files: [{ id: 'f1', filename: 'test.txt', mimeType: 'text/plain', size: 100, isSymlink: false }],
        },
      };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      const deleteBtn = document.querySelector('.file-card-delete');
      fireEvent.click(deleteBtn);
      expect(deleteFile).toHaveBeenCalledWith('f1');
    });
  });

  describe('folder interactions', () => {
    it('should navigate into folder on click (desktop)', () => {
      const navigateTo = vi.fn();
      const explorer = {
        ...baseExplorer,
        navigateTo,
        contents: {
          folders: [{ id: 'fo1', name: 'Documents', isSymlink: false }],
          files: [],
        },
      };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      fireEvent.click(screen.getByText('Documents'));
      expect(navigateTo).toHaveBeenCalledWith('fo1');
    });

    it('should hide delete button on folder cards in mobile', () => {
      const explorer = {
        ...baseExplorer,
        contents: {
          folders: [{ id: 'fo1', name: 'MobileFolder', isSymlink: false }],
          files: [],
        },
      };

      render(<FileExplorer explorer={explorer} isMobile={true} />);

      const folderCard = document.querySelector('.folder-card');
      expect(folderCard.querySelector('.file-card-delete')).not.toBeInTheDocument();
    });
  });

  describe('file size formatting', () => {
    it('should display formatted file size', () => {
      const explorer = {
        ...baseExplorer,
        contents: {
          folders: [],
          files: [{ id: 'f1', filename: 'big.zip', mimeType: 'application/zip', size: 1048576, isSymlink: false }],
        },
      };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      expect(screen.getByText('1.0 MB')).toBeInTheDocument();
    });
  });

  describe('favorites', () => {
    it('should show star button when favorites are provided', () => {
      const favorites = {
        isFavorite: vi.fn().mockReturnValue(false),
        toggleFavorite: vi.fn(),
      };
      const explorer = {
        ...baseExplorer,
        contents: {
          folders: [],
          files: [{ id: 'f1', filename: 'test.txt', mimeType: 'text/plain', size: 10, isSymlink: false }],
        },
      };

      render(<FileExplorer explorer={explorer} isMobile={false} favorites={favorites} />);

      expect(document.querySelector('.file-card-star')).toBeInTheDocument();
    });

    it('should call toggleFavorite when star is clicked', () => {
      const toggleFavorite = vi.fn();
      const favorites = {
        isFavorite: vi.fn().mockReturnValue(false),
        toggleFavorite,
      };
      const explorer = {
        ...baseExplorer,
        contents: {
          folders: [],
          files: [{ id: 'f1', filename: 'test.txt', mimeType: 'text/plain', size: 10, isSymlink: false }],
        },
      };

      render(<FileExplorer explorer={explorer} isMobile={false} favorites={favorites} />);

      fireEvent.click(document.querySelector('.file-card-star'));
      expect(toggleFavorite).toHaveBeenCalledWith('file', 'f1');
    });

    it('should show starred state when file is a favorite', () => {
      const favorites = {
        isFavorite: vi.fn().mockReturnValue(true),
        toggleFavorite: vi.fn(),
      };
      const explorer = {
        ...baseExplorer,
        contents: {
          folders: [],
          files: [{ id: 'f1', filename: 'fav.txt', mimeType: 'text/plain', size: 10, isSymlink: false }],
        },
      };

      render(<FileExplorer explorer={explorer} isMobile={false} favorites={favorites} />);

      expect(document.querySelector('.file-card-star.starred')).toBeInTheDocument();
    });

    it('should show star on folder cards when favorites provided', () => {
      const favorites = {
        isFavorite: vi.fn().mockReturnValue(false),
        toggleFavorite: vi.fn(),
      };
      const explorer = {
        ...baseExplorer,
        contents: {
          folders: [{ id: 'fo1', name: 'StarFolder', isSymlink: false }],
          files: [],
        },
      };

      render(<FileExplorer explorer={explorer} isMobile={false} favorites={favorites} />);

      expect(document.querySelector('.file-card-star')).toBeInTheDocument();
    });

    it('should call toggleFavorite on folder star click', () => {
      const toggleFavorite = vi.fn();
      const favorites = {
        isFavorite: vi.fn().mockReturnValue(false),
        toggleFavorite,
      };
      const explorer = {
        ...baseExplorer,
        contents: {
          folders: [{ id: 'fo1', name: 'StarFolder', isSymlink: false }],
          files: [],
        },
      };

      render(<FileExplorer explorer={explorer} isMobile={false} favorites={favorites} />);

      fireEvent.click(document.querySelector('.file-card-star'));
      expect(toggleFavorite).toHaveBeenCalledWith('folder', 'fo1');
    });

    it('should not show star buttons when favorites is not provided', () => {
      const explorer = {
        ...baseExplorer,
        contents: {
          folders: [],
          files: [{ id: 'f1', filename: 'test.txt', mimeType: 'text/plain', size: 10, isSymlink: false }],
        },
      };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      expect(document.querySelector('.file-card-star')).not.toBeInTheDocument();
    });
  });

  describe('file icons by mime type', () => {
    const renderFileWithMime = (mimeType, filename = 'test') => {
      const explorer = {
        ...baseExplorer,
        contents: {
          folders: [],
          files: [{ id: 'f1', filename, mimeType, size: 100, isSymlink: false }],
        },
      };
      render(<FileExplorer explorer={explorer} isMobile={false} />);
    };

    it('should render image icon for image mime types', () => {
      renderFileWithMime('image/png', 'photo.png');
      expect(document.querySelector('.file-card-icon')).toBeInTheDocument();
    });

    it('should render video icon for video mime types', () => {
      renderFileWithMime('video/mp4', 'movie.mp4');
      expect(document.querySelector('.file-card-icon')).toBeInTheDocument();
    });

    it('should render audio icon for audio mime types', () => {
      renderFileWithMime('audio/mpeg', 'song.mp3');
      expect(document.querySelector('.file-card-icon')).toBeInTheDocument();
    });

    it('should render pdf icon for application/pdf', () => {
      renderFileWithMime('application/pdf', 'doc.pdf');
      expect(document.querySelector('.file-card-icon')).toBeInTheDocument();
    });

    it('should render archive icon for zip files', () => {
      renderFileWithMime('application/zip', 'archive.zip');
      expect(document.querySelector('.file-card-icon')).toBeInTheDocument();
    });

    it('should render code icon for json files', () => {
      renderFileWithMime('application/json', 'data.json');
      expect(document.querySelector('.file-card-icon')).toBeInTheDocument();
    });

    it('should render code icon for source code files by extension', () => {
      renderFileWithMime('', 'app.tsx');
      expect(document.querySelector('.file-card-icon')).toBeInTheDocument();
    });

    it('should render table icon for csv files', () => {
      renderFileWithMime('text/csv', 'data.csv');
      expect(document.querySelector('.file-card-icon')).toBeInTheDocument();
    });

    it('should render text icon for text mime types', () => {
      renderFileWithMime('text/plain', 'readme.txt');
      expect(document.querySelector('.file-card-icon')).toBeInTheDocument();
    });

    it('should render generic file icon for unknown types', () => {
      renderFileWithMime('application/octet-stream', 'binary.bin');
      expect(document.querySelector('.file-card-icon')).toBeInTheDocument();
    });

    it('should handle null mime type', () => {
      renderFileWithMime(null, 'unknown');
      expect(document.querySelector('.file-card-icon')).toBeInTheDocument();
    });
  });

  describe('search result interactions', () => {
    it('should call setSelectedFile when clicking a search result', () => {
      const setSelectedFile = vi.fn();
      const explorer = {
        ...baseExplorer,
        setSelectedFile,
        searchResults: [
          { fileId: 'f1', filename: 'found.txt', mimeType: 'text/plain', size: 50 },
        ],
        searchQuery: 'test',
      };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      fireEvent.click(screen.getByText('found.txt'));
      expect(setSelectedFile).toHaveBeenCalled();
    });

    it('should render highlighted snippets in search results', () => {
      const explorer = {
        ...baseExplorer,
        searchResults: [
          { fileId: 'f1', filename: 'found.txt', mimeType: 'text/plain', size: 50, snippet: 'hello <mark>world</mark> foo' },
        ],
        searchQuery: 'world',
      };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      const snippet = document.querySelector('.search-row-snippet');
      expect(snippet).toBeInTheDocument();
      expect(snippet.querySelector('mark')).toBeInTheDocument();
      expect(snippet.querySelector('mark').textContent).toBe('world');
    });

    it('should handle snippet with no marks', () => {
      const explorer = {
        ...baseExplorer,
        searchResults: [
          { fileId: 'f1', filename: 'found.txt', mimeType: 'text/plain', size: 50, snippet: 'just plain text' },
        ],
        searchQuery: 'world',
      };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      const snippet = document.querySelector('.search-row-snippet');
      expect(snippet).toBeInTheDocument();
      expect(snippet.textContent).toBe('just plain text');
    });

    it('should show "Only text-based files are indexed" hint when no results', () => {
      const explorer = {
        ...baseExplorer,
        searchResults: [],
        searchQuery: 'nothing',
      };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      expect(screen.getByText('Only text-based files are indexed')).toBeInTheDocument();
    });
  });

  describe('inline folder creation', () => {
    it('should show new folder form when New Folder button is clicked', () => {
      render(<FileExplorer explorer={baseExplorer} isMobile={false} />);

      fireEvent.click(screen.getByTitle('New folder'));
      expect(document.querySelector('.new-folder-card')).toBeInTheDocument();
    });

    it('should call createFolder on form submit', () => {
      const createFolder = vi.fn().mockResolvedValue({});
      const explorer = { ...baseExplorer, createFolder };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      fireEvent.click(screen.getByTitle('New folder'));
      const input = document.querySelector('.new-folder-card input');
      fireEvent.change(input, { target: { value: 'MyFolder' } });
      fireEvent.submit(document.querySelector('.new-folder-card'));

      expect(createFolder).toHaveBeenCalledWith('MyFolder');
    });

    it('should not create folder with empty name', () => {
      const createFolder = vi.fn();
      const explorer = { ...baseExplorer, createFolder };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      fireEvent.click(screen.getByTitle('New folder'));
      fireEvent.submit(document.querySelector('.new-folder-card'));

      expect(createFolder).not.toHaveBeenCalled();
    });

    it('should close form on Escape key', () => {
      render(<FileExplorer explorer={baseExplorer} isMobile={false} />);

      fireEvent.click(screen.getByTitle('New folder'));
      const input = document.querySelector('.new-folder-card input');
      fireEvent.keyDown(input, { key: 'Escape' });

      expect(document.querySelector('.new-folder-card')).not.toBeInTheDocument();
    });

    it('should close form on blur', () => {
      render(<FileExplorer explorer={baseExplorer} isMobile={false} />);

      fireEvent.click(screen.getByTitle('New folder'));
      const input = document.querySelector('.new-folder-card input');
      fireEvent.blur(input);

      expect(document.querySelector('.new-folder-card')).not.toBeInTheDocument();
    });
  });

  describe('inline folder rename', () => {
    it('should show rename form when Rename button is clicked inside a folder', () => {
      const explorer = {
        ...baseExplorer,
        currentFolderId: 'fo1',
        allFolders: [{ id: 'fo1', name: 'RenameMe', parentId: null }],
      };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      fireEvent.click(screen.getByTitle('Rename "RenameMe"'));
      expect(document.querySelector('.rename-folder-inline')).toBeInTheDocument();
    });

    it('should call renameFolder on submit with new name', () => {
      const renameFolder = vi.fn().mockResolvedValue({});
      const explorer = {
        ...baseExplorer,
        renameFolder,
        currentFolderId: 'fo1',
        allFolders: [{ id: 'fo1', name: 'OldName', parentId: null }],
      };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      fireEvent.click(screen.getByTitle('Rename "OldName"'));
      const input = document.querySelector('.rename-folder-inline input');
      fireEvent.change(input, { target: { value: 'NewName' } });
      fireEvent.submit(document.querySelector('.rename-folder-inline'));

      expect(renameFolder).toHaveBeenCalledWith('fo1', 'NewName');
    });

    it('should not rename when name is unchanged', () => {
      const renameFolder = vi.fn();
      const explorer = {
        ...baseExplorer,
        renameFolder,
        currentFolderId: 'fo1',
        allFolders: [{ id: 'fo1', name: 'Same', parentId: null }],
      };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      fireEvent.click(screen.getByTitle('Rename "Same"'));
      fireEvent.submit(document.querySelector('.rename-folder-inline'));

      expect(renameFolder).not.toHaveBeenCalled();
    });

    it('should close rename form on Escape', () => {
      const explorer = {
        ...baseExplorer,
        currentFolderId: 'fo1',
        allFolders: [{ id: 'fo1', name: 'Folder', parentId: null }],
      };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      fireEvent.click(screen.getByTitle('Rename "Folder"'));
      const input = document.querySelector('.rename-folder-inline input');
      fireEvent.keyDown(input, { key: 'Escape' });

      expect(document.querySelector('.rename-folder-inline')).not.toBeInTheDocument();
    });

    it('should not start rename when no current folder', () => {
      render(<FileExplorer explorer={baseExplorer} isMobile={false} />);

      // rename button is disabled at root, but let's verify no form shows
      expect(document.querySelector('.rename-folder-inline')).not.toBeInTheDocument();
    });
  });

  describe('symlink modal', () => {
    it('should open symlink modal when Symlink button is clicked', () => {
      render(<FileExplorer explorer={baseExplorer} isMobile={false} />);

      fireEvent.click(screen.getByTitle('Create symlink'));
      expect(screen.getByTestId('symlink-modal')).toBeInTheDocument();
    });
  });

  describe('goto folder button', () => {
    it('should show Goto button when onGotoFolder is provided', () => {
      render(<FileExplorer explorer={baseExplorer} isMobile={false} onGotoFolder={vi.fn()} />);

      expect(screen.getByTitle('Goto folder')).toBeInTheDocument();
    });

    it('should not show Goto button when onGotoFolder is not provided', () => {
      render(<FileExplorer explorer={baseExplorer} isMobile={false} />);

      expect(screen.queryByTitle('Goto folder')).not.toBeInTheDocument();
    });

    it('should call onGotoFolder when Goto button is clicked', () => {
      const onGotoFolder = vi.fn();
      render(<FileExplorer explorer={baseExplorer} isMobile={false} onGotoFolder={onGotoFolder} />);

      fireEvent.click(screen.getByTitle('Goto folder'));
      expect(onGotoFolder).toHaveBeenCalled();
    });
  });

  describe('imperative handle (ref)', () => {
    it('should expose triggerNewFolder via ref', () => {
      const ref = createRef();
      render(<FileExplorer ref={ref} explorer={baseExplorer} isMobile={false} />);

      act(() => { ref.current.triggerNewFolder(); });
      expect(document.querySelector('.new-folder-card')).toBeInTheDocument();
    });

    it('should expose triggerSymlink via ref', () => {
      const ref = createRef();
      render(<FileExplorer ref={ref} explorer={baseExplorer} isMobile={false} />);

      act(() => { ref.current.triggerSymlink(); });
      expect(screen.getByTestId('symlink-modal')).toBeInTheDocument();
    });

    it('should expose triggerRename via ref', () => {
      const ref = createRef();
      const explorer = {
        ...baseExplorer,
        currentFolderId: 'fo1',
        allFolders: [{ id: 'fo1', name: 'RefFolder', parentId: null }],
      };
      render(<FileExplorer ref={ref} explorer={explorer} isMobile={false} />);

      act(() => { ref.current.triggerRename(); });
      expect(document.querySelector('.rename-folder-inline')).toBeInTheDocument();
    });
  });

  describe('folder card drag and drop', () => {
    it('should set drag data on folder drag start', () => {
      const explorer = {
        ...baseExplorer,
        contents: {
          folders: [{ id: 'fo1', name: 'DragMe', isSymlink: false }],
          files: [],
        },
      };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      const folderCard = document.querySelector('.folder-card');
      const dragEvent = makeDragEvent();
      fireEvent.dragStart(folderCard, dragEvent);

      expect(dragEvent.dataTransfer.setData).toHaveBeenCalledWith('application/x-docvault-type', 'folder');
      expect(dragEvent.dataTransfer.setData).toHaveBeenCalledWith('application/x-docvault-id', 'fo1');
    });

    it('should accept drop on folder card', () => {
      const moveFile = vi.fn().mockResolvedValue({});
      const explorer = {
        ...baseExplorer,
        moveFile,
        contents: {
          folders: [{ id: 'fo1', name: 'DropHere', isSymlink: false }],
          files: [],
        },
      };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      const folderCard = document.querySelector('.folder-card');
      const dropEvent = makeDragEvent({
        'application/x-docvault-type': 'file',
        'application/x-docvault-id': 'file-1',
      });
      fireEvent.drop(folderCard, dropEvent);

      expect(moveFile).toHaveBeenCalledWith('file-1', 'fo1');
    });

    it('should not drop folder onto itself', () => {
      const moveFolder = vi.fn();
      const explorer = {
        ...baseExplorer,
        moveFolder,
        contents: {
          folders: [{ id: 'fo1', name: 'SelfDrop', isSymlink: false }],
          files: [],
        },
      };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      const folderCard = document.querySelector('.folder-card');
      const dropEvent = makeDragEvent({
        'application/x-docvault-type': 'folder',
        'application/x-docvault-id': 'fo1',
      });
      fireEvent.drop(folderCard, dropEvent);

      expect(moveFolder).not.toHaveBeenCalled();
    });

    it('should show drop-target class on dragOver', () => {
      const explorer = {
        ...baseExplorer,
        contents: {
          folders: [{ id: 'fo1', name: 'Hover', isSymlink: false }],
          files: [],
        },
      };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      const folderCard = document.querySelector('.folder-card');
      const dragOverEvent = makeDragEvent({ 'application/x-docvault-type': 'file' });
      fireEvent.dragOver(folderCard, dragOverEvent);

      expect(folderCard.classList.contains('drop-target')).toBe(true);
    });

    it('should remove drop-target class on dragLeave', () => {
      const explorer = {
        ...baseExplorer,
        contents: {
          folders: [{ id: 'fo1', name: 'Leave', isSymlink: false }],
          files: [],
        },
      };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      const folderCard = document.querySelector('.folder-card');
      const dragOverEvent = makeDragEvent({ 'application/x-docvault-type': 'file' });
      fireEvent.dragOver(folderCard, dragOverEvent);
      fireEvent.dragLeave(folderCard);

      expect(folderCard.classList.contains('drop-target')).toBe(false);
    });
  });

  describe('file card drag', () => {
    it('should set drag data on file drag start', () => {
      const explorer = {
        ...baseExplorer,
        contents: {
          folders: [],
          files: [{ id: 'f1', filename: 'drag.txt', mimeType: 'text/plain', size: 10, isSymlink: false }],
        },
      };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      const fileCard = document.querySelector('.file-card');
      const dragEvent = makeDragEvent();
      fireEvent.dragStart(fileCard, dragEvent);

      expect(dragEvent.dataTransfer.setData).toHaveBeenCalledWith('application/x-docvault-type', 'file');
      expect(dragEvent.dataTransfer.setData).toHaveBeenCalledWith('application/x-docvault-id', 'f1');
    });
  });

  describe('folder card mobile behavior', () => {
    it('should select folder on first click in mobile, then navigate on second click', () => {
      const navigateTo = vi.fn();
      const setSelectedFolder = vi.fn();
      const explorer = {
        ...baseExplorer,
        navigateTo,
        setSelectedFolder,
        contents: {
          folders: [{ id: 'fo1', name: 'MobileNav', isSymlink: false }],
          files: [],
        },
      };

      render(<FileExplorer explorer={explorer} isMobile={true} />);

      fireEvent.click(screen.getByText('MobileNav'));
      expect(setSelectedFolder).toHaveBeenCalled();
      expect(navigateTo).not.toHaveBeenCalled();
    });

    it('should navigate into folder on click when already selected in mobile', () => {
      const navigateTo = vi.fn();
      const setSelectedFolder = vi.fn();
      const folder = { id: 'fo1', name: 'MobileNav', isSymlink: false };
      const explorer = {
        ...baseExplorer,
        navigateTo,
        setSelectedFolder,
        selectedFolder: folder,
        contents: {
          folders: [folder],
          files: [],
        },
      };

      render(<FileExplorer explorer={explorer} isMobile={true} />);

      fireEvent.click(screen.getByText('MobileNav'));
      expect(navigateTo).toHaveBeenCalledWith('fo1');
    });
  });

  describe('mobile folder open button', () => {
    it('should render open button on folder cards in mobile mode', () => {
      const explorer = {
        ...baseExplorer,
        contents: {
          folders: [{ id: 'fo1', name: 'MobileFolder', isSymlink: false }],
          files: [],
        },
      };

      render(<FileExplorer explorer={explorer} isMobile={true} />);

      const openBtn = document.querySelector('.folder-open-btn');
      expect(openBtn).toBeInTheDocument();
      expect(openBtn).toHaveAttribute('title', 'Open folder');
    });

    it('should NOT render open button on folder cards in desktop mode', () => {
      const explorer = {
        ...baseExplorer,
        contents: {
          folders: [{ id: 'fo1', name: 'DesktopFolder', isSymlink: false }],
          files: [],
        },
      };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      expect(document.querySelector('.folder-open-btn')).not.toBeInTheDocument();
    });

    it('should navigate directly into folder when open button is clicked on mobile', () => {
      const navigateTo = vi.fn();
      const setSelectedFolder = vi.fn();
      const explorer = {
        ...baseExplorer,
        navigateTo,
        setSelectedFolder,
        contents: {
          folders: [{ id: 'fo1', name: 'QuickOpen', isSymlink: false }],
          files: [],
        },
      };

      render(<FileExplorer explorer={explorer} isMobile={true} />);

      const openBtn = document.querySelector('.folder-open-btn');
      fireEvent.click(openBtn);

      expect(navigateTo).toHaveBeenCalledWith('fo1');
      // Should NOT also trigger setSelectedFolder (stopPropagation)
      expect(setSelectedFolder).not.toHaveBeenCalled();
    });
  });

  describe('file index status badges', () => {
    it('should show "not indexed" badge for pending files', () => {
      const explorer = {
        ...baseExplorer,
        contents: {
          folders: [],
          files: [{ id: 'f1', filename: 'new.txt', mimeType: 'text/plain', size: 100, isSymlink: false, indexStatus: 'pending' }],
        },
      };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      const badge = document.querySelector('.file-status-badge.status-pending');
      expect(badge).toBeInTheDocument();
      expect(badge.textContent).toBe('not indexed');
      expect(badge).toHaveAttribute('title', 'Not indexed');
    });

    it('should show "no text" badge for no_content files', () => {
      const explorer = {
        ...baseExplorer,
        contents: {
          folders: [],
          files: [{ id: 'f1', filename: 'photo.jpg', mimeType: 'image/jpeg', size: 5000, isSymlink: false, indexStatus: 'no_content' }],
        },
      };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      const badge = document.querySelector('.file-status-badge.status-no_content');
      expect(badge).toBeInTheDocument();
      expect(badge.textContent).toBe('no text');
      expect(badge).toHaveAttribute('title', 'Cannot extract text');
    });

    it('should NOT show badge for indexed files', () => {
      const explorer = {
        ...baseExplorer,
        contents: {
          folders: [],
          files: [{ id: 'f1', filename: 'doc.pdf', mimeType: 'application/pdf', size: 1000, isSymlink: false, indexStatus: 'indexed' }],
        },
      };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      expect(document.querySelector('.file-status-badge')).not.toBeInTheDocument();
    });

    it('should NOT show badge when indexStatus is absent', () => {
      const explorer = {
        ...baseExplorer,
        contents: {
          folders: [],
          files: [{ id: 'f1', filename: 'old.txt', mimeType: 'text/plain', size: 100, isSymlink: false }],
        },
      };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      expect(document.querySelector('.file-status-badge')).not.toBeInTheDocument();
    });
  });

  describe('display mode', () => {
    it('should apply wrap class when displayMode is wrap', () => {
      const explorer = {
        ...baseExplorer,
        contents: {
          folders: [{ id: 'fo1', name: 'WrapFolder', isSymlink: false }],
          files: [{ id: 'f1', filename: 'wrap.txt', mimeType: 'text/plain', size: 10, isSymlink: false }],
        },
      };

      render(<FileExplorer explorer={explorer} isMobile={false} displayMode="wrap" />);

      expect(document.querySelector('.folder-card.expanded')).toBeInTheDocument();
      expect(document.querySelector('.file-card.expanded')).toBeInTheDocument();
    });

    it('should not apply expanded class in default truncate mode', () => {
      const explorer = {
        ...baseExplorer,
        contents: {
          folders: [{ id: 'fo1', name: 'TruncFolder', isSymlink: false }],
          files: [{ id: 'f1', filename: 'trunc.txt', mimeType: 'text/plain', size: 10, isSymlink: false }],
        },
      };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      expect(document.querySelector('.folder-card.expanded')).not.toBeInTheDocument();
      expect(document.querySelector('.file-card.expanded')).not.toBeInTheDocument();
    });
  });

  describe('selected state', () => {
    it('should mark file card as selected', () => {
      const explorer = {
        ...baseExplorer,
        selectedFile: { id: 'f1' },
        contents: {
          folders: [],
          files: [{ id: 'f1', filename: 'sel.txt', mimeType: 'text/plain', size: 10, isSymlink: false }],
        },
      };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      expect(document.querySelector('.file-card.selected')).toBeInTheDocument();
    });

    it('should mark folder card as selected', () => {
      const explorer = {
        ...baseExplorer,
        selectedFolder: { id: 'fo1' },
        contents: {
          folders: [{ id: 'fo1', name: 'SelFolder', isSymlink: false }],
          files: [],
        },
      };

      render(<FileExplorer explorer={explorer} isMobile={false} />);

      expect(document.querySelector('.folder-card.selected')).toBeInTheDocument();
    });
  });
});
