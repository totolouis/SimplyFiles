import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./Sidebar.css', () => ({}));
vi.mock('../api', () => ({
  healthApi: {
    getVersion: vi.fn().mockResolvedValue({ version: '1.2.3' }),
  },
}));

import Sidebar from './Sidebar';
import { healthApi } from '../api';

function makeDragEvent(type, data = {}) {
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
  allFolders: [],
  currentFolderId: null,
  navigateTo: vi.fn(),
  createFolder: vi.fn().mockResolvedValue({}),
  deleteFolder: vi.fn(),
  renameFolder: vi.fn().mockResolvedValue({}),
  expandedFolders: new Set(),
  toggleFolderExpansion: vi.fn(),
  expandPathToFolder: vi.fn(),
  collapseAllFolders: vi.fn(),
};

const defaultProps = {
  explorer: baseExplorer,
  showClose: false,
  onClose: vi.fn(),
  onNavigate: vi.fn(),
  onOpenSettings: vi.fn(),
  onOpenReports: vi.fn(),
  onOpenTrash: vi.fn(),
  hasUnseenReports: false,
  themeMode: 'auto',
  onCycleTheme: vi.fn(),
  onItemDrop: vi.fn(),
  favorites: null,
  onSelectFile: vi.fn(),
};

describe('Sidebar', () => {
  describe('header', () => {
    it('should render logo with DocVault text', () => {
      render(<Sidebar {...defaultProps} />);

      expect(screen.getByText('DocVault')).toBeInTheDocument();
    });

    it('should show close button when showClose is true', () => {
      render(<Sidebar {...defaultProps} showClose={true} />);

      expect(screen.getByTitle('Close')).toBeInTheDocument();
    });

    it('should not show close button when showClose is false', () => {
      render(<Sidebar {...defaultProps} showClose={false} />);

      expect(screen.queryByTitle('Close')).not.toBeInTheDocument();
    });

    it('should call onClose when close button is clicked', () => {
      const onClose = vi.fn();
      render(<Sidebar {...defaultProps} showClose={true} onClose={onClose} />);

      fireEvent.click(screen.getByTitle('Close'));
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('home row', () => {
    it('should render Home nav item', () => {
      render(<Sidebar {...defaultProps} />);

      expect(screen.getByText('Home')).toBeInTheDocument();
    });

    it('should mark Home as active when currentFolderId is null', () => {
      render(<Sidebar {...defaultProps} />);

      const homeRow = document.querySelector('.home-row');
      expect(homeRow.classList.contains('active')).toBe(true);
    });

    it('should navigate to root when Home is clicked', () => {
      const navigateTo = vi.fn();
      const explorer = { ...baseExplorer, navigateTo };
      render(<Sidebar {...defaultProps} explorer={explorer} />);

      fireEvent.click(screen.getByText('Home'));
      expect(navigateTo).toHaveBeenCalledWith(null);
    });
  });

  describe('folder tree', () => {
    it('should render root folders', () => {
      const explorer = {
        ...baseExplorer,
        allFolders: [
          { id: 'f1', name: 'Documents', parentId: null },
          { id: 'f2', name: 'Photos', parentId: null },
        ],
      };

      render(<Sidebar {...defaultProps} explorer={explorer} />);

      expect(screen.getByText('Documents')).toBeInTheDocument();
      expect(screen.getByText('Photos')).toBeInTheDocument();
    });

    it('should show "No folders yet" when no folders exist', () => {
      render(<Sidebar {...defaultProps} />);

      expect(screen.getByText('No folders yet')).toBeInTheDocument();
    });

    it('should navigate to folder on click', () => {
      const navigateTo = vi.fn();
      const explorer = {
        ...baseExplorer,
        navigateTo,
        allFolders: [{ id: 'f1', name: 'Docs', parentId: null }],
      };

      render(<Sidebar {...defaultProps} explorer={explorer} />);

      fireEvent.click(screen.getByText('Docs'));
      expect(navigateTo).toHaveBeenCalledWith('f1');
    });

    it('should show nested folders when parent is expanded', () => {
      const explorer = {
        ...baseExplorer,
        allFolders: [
          { id: 'f1', name: 'Parent', parentId: null },
          { id: 'f2', name: 'Child', parentId: 'f1' },
        ],
        expandedFolders: new Set(['f1']),
      };

      render(<Sidebar {...defaultProps} explorer={explorer} />);

      expect(screen.getByText('Child')).toBeInTheDocument();
    });

    it('should not show nested folders when parent is collapsed', () => {
      const explorer = {
        ...baseExplorer,
        allFolders: [
          { id: 'f1', name: 'Parent', parentId: null },
          { id: 'f2', name: 'Child', parentId: 'f1' },
        ],
        expandedFolders: new Set(),
      };

      render(<Sidebar {...defaultProps} explorer={explorer} />);

      expect(screen.queryByText('Child')).not.toBeInTheDocument();
    });

    it('should call deleteFolder when trash icon is clicked', () => {
      const deleteFolder = vi.fn();
      const explorer = {
        ...baseExplorer,
        deleteFolder,
        allFolders: [{ id: 'f1', name: 'ToDelete', parentId: null }],
      };

      render(<Sidebar {...defaultProps} explorer={explorer} />);

      const deleteBtn = document.querySelector('.delete-btn');
      fireEvent.click(deleteBtn);
      expect(deleteFolder).toHaveBeenCalledWith('f1');
    });
  });

  describe('folders section actions', () => {
    it('should show add folder button', () => {
      render(<Sidebar {...defaultProps} />);

      expect(document.querySelector('.add-btn')).toBeInTheDocument();
    });

    it('should show new folder form when add button is clicked', () => {
      render(<Sidebar {...defaultProps} />);

      fireEvent.click(document.querySelector('.add-btn'));
      expect(document.querySelector('.new-folder-form')).toBeInTheDocument();
    });

    it('should show collapse button when folders are expanded', () => {
      const explorer = {
        ...baseExplorer,
        expandedFolders: new Set(['f1']),
        allFolders: [{ id: 'f1', name: 'Folder', parentId: null }],
      };

      render(<Sidebar {...defaultProps} explorer={explorer} />);

      expect(document.querySelector('.collapse-btn')).toBeInTheDocument();
    });

    it('should not show collapse button when no folders are expanded', () => {
      render(<Sidebar {...defaultProps} />);

      expect(document.querySelector('.collapse-btn')).not.toBeInTheDocument();
    });

    it('should disable rename button when at root', () => {
      render(<Sidebar {...defaultProps} />);

      const renameBtn = document.querySelector('.rename-btn');
      expect(renameBtn).toHaveClass('disabled');
    });
  });

  describe('favorites section', () => {
    it('should show favorites section when favorites are provided', () => {
      const favorites = {
        favorites: [
          { id: 'fav1', itemType: 'folder', itemId: 'f1', name: 'My Folder' },
        ],
        toggleFavorite: vi.fn(),
      };

      render(<Sidebar {...defaultProps} favorites={favorites} />);

      expect(screen.getByText('FAVORITES')).toBeInTheDocument();
      expect(screen.getByText('My Folder')).toBeInTheDocument();
    });

    it('should show "No favorites yet" when list is empty', () => {
      const favorites = { favorites: [], toggleFavorite: vi.fn() };

      render(<Sidebar {...defaultProps} favorites={favorites} />);

      expect(screen.getByText('No favorites yet')).toBeInTheDocument();
    });

    it('should not show favorites section when favorites is null', () => {
      render(<Sidebar {...defaultProps} favorites={null} />);

      expect(screen.queryByText('FAVORITES')).not.toBeInTheDocument();
    });
  });

  describe('footer', () => {
    it('should render Trash button', () => {
      render(<Sidebar {...defaultProps} />);

      expect(screen.getByText('Trash')).toBeInTheDocument();
    });

    it('should call onOpenTrash when Trash button is clicked', () => {
      const onOpenTrash = vi.fn();
      render(<Sidebar {...defaultProps} onOpenTrash={onOpenTrash} />);

      fireEvent.click(screen.getByText('Trash'));
      expect(onOpenTrash).toHaveBeenCalled();
    });

    it('should render Settings button', () => {
      render(<Sidebar {...defaultProps} />);

      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    it('should call onOpenSettings when Settings button is clicked', () => {
      const onOpenSettings = vi.fn();
      render(<Sidebar {...defaultProps} onOpenSettings={onOpenSettings} />);

      fireEvent.click(screen.getByText('Settings'));
      expect(onOpenSettings).toHaveBeenCalled();
    });

    it('should render Sync Reports button', () => {
      render(<Sidebar {...defaultProps} />);

      expect(screen.getByText('Sync Reports')).toBeInTheDocument();
    });

    it('should show unseen dot when hasUnseenReports is true', () => {
      render(<Sidebar {...defaultProps} hasUnseenReports={true} />);

      expect(document.querySelector('.unseen-dot')).toBeInTheDocument();
    });

    it('should not show unseen dot when hasUnseenReports is false', () => {
      render(<Sidebar {...defaultProps} hasUnseenReports={false} />);

      expect(document.querySelector('.unseen-dot')).not.toBeInTheDocument();
    });

    it('should call onCycleTheme when theme button is clicked', () => {
      const onCycleTheme = vi.fn();
      render(<Sidebar {...defaultProps} onCycleTheme={onCycleTheme} />);

      const themeBtn = document.querySelector('.theme-toggle-btn');
      fireEvent.click(themeBtn);
      expect(onCycleTheme).toHaveBeenCalled();
    });

    it('should show theme tooltip for light mode', () => {
      render(<Sidebar {...defaultProps} themeMode="light" />);

      const themeBtn = document.querySelector('.theme-toggle-btn');
      expect(themeBtn).toHaveAttribute('title', 'Theme: Light');
    });

    it('should show theme tooltip for dark mode', () => {
      render(<Sidebar {...defaultProps} themeMode="dark" />);

      const themeBtn = document.querySelector('.theme-toggle-btn');
      expect(themeBtn).toHaveAttribute('title', 'Theme: Dark');
    });

    it('should fallback to Auto for unknown theme mode', () => {
      render(<Sidebar {...defaultProps} themeMode="unknown" />);

      const themeBtn = document.querySelector('.theme-toggle-btn');
      expect(themeBtn).toHaveAttribute('title', 'Theme: Auto');
    });

    it('should display version from API', async () => {
      render(<Sidebar {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('v1.2.3')).toBeInTheDocument();
      });
    });

    it('should display dev version when API fails', async () => {
      healthApi.getVersion.mockRejectedValueOnce(new Error('fail'));
      render(<Sidebar {...defaultProps} />);

      expect(screen.getByText('vdev')).toBeInTheDocument();
    });

    it('should call onOpenReports when Sync Reports is clicked', () => {
      const onOpenReports = vi.fn();
      render(<Sidebar {...defaultProps} onOpenReports={onOpenReports} />);

      fireEvent.click(screen.getByText('Sync Reports'));
      expect(onOpenReports).toHaveBeenCalled();
    });
  });

  describe('folder creation', () => {
    it('should call createFolder on form submit', async () => {
      const createFolder = vi.fn().mockResolvedValue({});
      const explorer = { ...baseExplorer, createFolder };
      render(<Sidebar {...defaultProps} explorer={explorer} />);

      fireEvent.click(document.querySelector('.add-btn'));
      const input = document.querySelector('.new-folder-form input');
      fireEvent.change(input, { target: { value: 'New Folder' } });
      fireEvent.submit(document.querySelector('.new-folder-form'));

      expect(createFolder).toHaveBeenCalledWith('New Folder');
    });

    it('should not create folder with empty name', () => {
      const createFolder = vi.fn();
      const explorer = { ...baseExplorer, createFolder };
      render(<Sidebar {...defaultProps} explorer={explorer} />);

      fireEvent.click(document.querySelector('.add-btn'));
      fireEvent.submit(document.querySelector('.new-folder-form'));

      expect(createFolder).not.toHaveBeenCalled();
    });

    it('should close form on Escape key', () => {
      render(<Sidebar {...defaultProps} />);

      fireEvent.click(document.querySelector('.add-btn'));
      expect(document.querySelector('.new-folder-form')).toBeInTheDocument();

      const input = document.querySelector('.new-folder-form input');
      fireEvent.keyDown(input, { key: 'Escape' });

      expect(document.querySelector('.new-folder-form')).not.toBeInTheDocument();
    });
  });

  describe('rename current folder', () => {
    it('should show rename form when rename button is clicked', () => {
      const explorer = {
        ...baseExplorer,
        currentFolderId: 'f1',
        allFolders: [{ id: 'f1', name: 'OldName', parentId: null }],
      };

      render(<Sidebar {...defaultProps} explorer={explorer} />);

      fireEvent.click(document.querySelector('.rename-btn'));
      expect(document.querySelector('.rename-current-form')).toBeInTheDocument();
    });

    it('should not open rename form when at root', () => {
      render(<Sidebar {...defaultProps} />);

      const renameBtn = document.querySelector('.rename-btn');
      fireEvent.click(renameBtn);

      expect(document.querySelector('.rename-current-form')).not.toBeInTheDocument();
    });

    it('should call renameFolder on submit with new name', async () => {
      const renameFolder = vi.fn().mockResolvedValue({});
      const explorer = {
        ...baseExplorer,
        renameFolder,
        currentFolderId: 'f1',
        allFolders: [{ id: 'f1', name: 'OldName', parentId: null }],
      };

      render(<Sidebar {...defaultProps} explorer={explorer} />);

      fireEvent.click(document.querySelector('.rename-btn'));
      const input = document.querySelector('.rename-current-form input');
      fireEvent.change(input, { target: { value: 'NewName' } });
      fireEvent.submit(document.querySelector('.rename-current-form'));

      await waitFor(() => {
        expect(renameFolder).toHaveBeenCalledWith('f1', 'NewName');
      });
    });

    it('should cancel rename when same name is submitted', () => {
      const renameFolder = vi.fn();
      const explorer = {
        ...baseExplorer,
        renameFolder,
        currentFolderId: 'f1',
        allFolders: [{ id: 'f1', name: 'SameName', parentId: null }],
      };

      render(<Sidebar {...defaultProps} explorer={explorer} />);

      fireEvent.click(document.querySelector('.rename-btn'));
      fireEvent.submit(document.querySelector('.rename-current-form'));

      expect(renameFolder).not.toHaveBeenCalled();
    });

    it('should cancel rename on Escape key', () => {
      const explorer = {
        ...baseExplorer,
        currentFolderId: 'f1',
        allFolders: [{ id: 'f1', name: 'MyFolder', parentId: null }],
      };

      render(<Sidebar {...defaultProps} explorer={explorer} />);

      fireEvent.click(document.querySelector('.rename-btn'));
      expect(document.querySelector('.rename-current-form')).toBeInTheDocument();

      const input = document.querySelector('.rename-current-form input');
      fireEvent.keyDown(input, { key: 'Escape' });

      expect(document.querySelector('.rename-current-form')).not.toBeInTheDocument();
    });

    it('should cancel rename on X button click', () => {
      const explorer = {
        ...baseExplorer,
        currentFolderId: 'f1',
        allFolders: [{ id: 'f1', name: 'MyFolder', parentId: null }],
      };

      render(<Sidebar {...defaultProps} explorer={explorer} />);

      fireEvent.click(document.querySelector('.rename-btn'));
      const cancelBtn = document.querySelector('.rename-current-input-wrap button[type="button"]');
      fireEvent.click(cancelBtn);

      expect(document.querySelector('.rename-current-form')).not.toBeInTheDocument();
    });
  });

  describe('folder tree toggle', () => {
    it('should call toggleFolderExpansion when chevron is clicked', () => {
      const toggleFolderExpansion = vi.fn();
      const explorer = {
        ...baseExplorer,
        toggleFolderExpansion,
        allFolders: [
          { id: 'f1', name: 'Parent', parentId: null },
          { id: 'f2', name: 'Child', parentId: 'f1' },
        ],
      };

      render(<Sidebar {...defaultProps} explorer={explorer} />);

      const chevronBtn = document.querySelector('.chevron-btn');
      fireEvent.click(chevronBtn);
      expect(toggleFolderExpansion).toHaveBeenCalledWith('f1');
    });

    it('should call collapseAllFolders when collapse button is clicked', () => {
      const collapseAllFolders = vi.fn();
      const explorer = {
        ...baseExplorer,
        collapseAllFolders,
        expandedFolders: new Set(['f1']),
        allFolders: [{ id: 'f1', name: 'Folder', parentId: null }],
      };

      render(<Sidebar {...defaultProps} explorer={explorer} />);

      fireEvent.click(document.querySelector('.collapse-btn'));
      expect(collapseAllFolders).toHaveBeenCalled();
    });

    it('should mark active folder in tree', () => {
      const explorer = {
        ...baseExplorer,
        currentFolderId: 'f1',
        allFolders: [{ id: 'f1', name: 'ActiveFolder', parentId: null }],
      };

      render(<Sidebar {...defaultProps} explorer={explorer} />);

      const activeRow = document.querySelector('.folder-row.active');
      expect(activeRow).toBeInTheDocument();
    });

    it('should not mark Home as active when a folder is selected', () => {
      const explorer = {
        ...baseExplorer,
        currentFolderId: 'f1',
        allFolders: [{ id: 'f1', name: 'Folder', parentId: null }],
      };

      render(<Sidebar {...defaultProps} explorer={explorer} />);

      const homeRow = document.querySelector('.home-row');
      expect(homeRow.classList.contains('active')).toBe(false);
    });
  });

  describe('drag and drop on FolderNode', () => {
    it('should call onItemDrop when file is dropped on folder', () => {
      const onItemDrop = vi.fn();
      const explorer = {
        ...baseExplorer,
        allFolders: [{ id: 'f1', name: 'Target', parentId: null }],
      };

      render(<Sidebar {...defaultProps} explorer={explorer} onItemDrop={onItemDrop} />);

      const folderRow = document.querySelector('.folder-row');
      const dragOverEvent = makeDragEvent('dragover', { 'application/x-docvault-type': 'file' });
      fireEvent.dragOver(folderRow, dragOverEvent);

      const dropEvent = makeDragEvent('drop', {
        'application/x-docvault-type': 'file',
        'application/x-docvault-id': 'file-1',
      });
      fireEvent.drop(folderRow, dropEvent);

      expect(onItemDrop).toHaveBeenCalledWith('file', 'file-1', 'f1');
    });

    it('should not call onItemDrop when dropping on itself', () => {
      const onItemDrop = vi.fn();
      const explorer = {
        ...baseExplorer,
        allFolders: [{ id: 'f1', name: 'Target', parentId: null }],
      };

      render(<Sidebar {...defaultProps} explorer={explorer} onItemDrop={onItemDrop} />);

      const folderRow = document.querySelector('.folder-row');
      const dropEvent = makeDragEvent('drop', {
        'application/x-docvault-type': 'folder',
        'application/x-docvault-id': 'f1',
      });
      fireEvent.drop(folderRow, dropEvent);

      expect(onItemDrop).not.toHaveBeenCalled();
    });

    it('should remove drop-target class on dragLeave', () => {
      const explorer = {
        ...baseExplorer,
        allFolders: [{ id: 'f1', name: 'Target', parentId: null }],
      };

      render(<Sidebar {...defaultProps} explorer={explorer} />);

      const folderRow = document.querySelector('.folder-row');
      const dragOverEvent = makeDragEvent('dragover', { 'application/x-docvault-type': 'file' });
      fireEvent.dragOver(folderRow, dragOverEvent);
      fireEvent.dragLeave(folderRow);

      expect(folderRow.classList.contains('drop-target')).toBe(false);
    });
  });

  describe('drag and drop on HomeRow', () => {
    it('should call onItemDrop with null target when dropped on Home', () => {
      const onItemDrop = vi.fn();
      render(<Sidebar {...defaultProps} onItemDrop={onItemDrop} />);

      const homeRow = document.querySelector('.home-row');
      const dragOverEvent = makeDragEvent('dragover', { 'application/x-docvault-type': 'file' });
      fireEvent.dragOver(homeRow, dragOverEvent);

      const dropEvent = makeDragEvent('drop', {
        'application/x-docvault-type': 'file',
        'application/x-docvault-id': 'file-1',
      });
      fireEvent.drop(homeRow, dropEvent);

      expect(onItemDrop).toHaveBeenCalledWith('file', 'file-1', null);
    });

    it('should not call onItemDrop when drop data is empty', () => {
      const onItemDrop = vi.fn();
      render(<Sidebar {...defaultProps} onItemDrop={onItemDrop} />);

      const homeRow = document.querySelector('.home-row');
      const dropEvent = makeDragEvent('drop', {});
      fireEvent.drop(homeRow, dropEvent);

      expect(onItemDrop).not.toHaveBeenCalled();
    });

    it('should remove drop-target on dragLeave of HomeRow', () => {
      render(<Sidebar {...defaultProps} />);

      const homeRow = document.querySelector('.home-row');
      const dragOverEvent = makeDragEvent('dragover', { 'application/x-docvault-type': 'file' });
      fireEvent.dragOver(homeRow, dragOverEvent);
      fireEvent.dragLeave(homeRow);

      expect(homeRow.classList.contains('drop-target')).toBe(false);
    });
  });

  describe('FavoriteRow interactions', () => {
    it('should navigate to folder when clicking a folder favorite', () => {
      const navigateTo = vi.fn();
      const favorites = {
        favorites: [{ id: 'fav1', itemType: 'folder', itemId: 'f1', name: 'FavFolder' }],
        toggleFavorite: vi.fn(),
      };
      const explorer = { ...baseExplorer, navigateTo };

      render(<Sidebar {...defaultProps} explorer={explorer} favorites={favorites} />);

      fireEvent.click(screen.getByText('FavFolder'));
      expect(navigateTo).toHaveBeenCalledWith('f1');
    });

    it('should call onSelectFile when clicking a file favorite', () => {
      const onSelectFile = vi.fn();
      const favorites = {
        favorites: [{ id: 'fav1', itemType: 'file', itemId: 'file-1', name: 'FavFile.txt' }],
        toggleFavorite: vi.fn(),
      };

      render(<Sidebar {...defaultProps} favorites={favorites} onSelectFile={onSelectFile} />);

      fireEvent.click(screen.getByText('FavFile.txt'));
      expect(onSelectFile).toHaveBeenCalledWith('file-1');
    });

    it('should call toggleFavorite when remove star is clicked', () => {
      const toggleFavorite = vi.fn();
      const favorites = {
        favorites: [{ id: 'fav1', itemType: 'file', itemId: 'file-1', name: 'FavFile.txt' }],
        toggleFavorite,
      };

      render(<Sidebar {...defaultProps} favorites={favorites} />);

      fireEvent.click(document.querySelector('.favorite-remove-btn'));
      expect(toggleFavorite).toHaveBeenCalledWith('file', 'file-1');
    });

    it('should support drag start on favorite row', () => {
      const favorites = {
        favorites: [{ id: 'fav1', itemType: 'file', itemId: 'file-1', name: 'Draggable.txt' }],
        toggleFavorite: vi.fn(),
      };

      render(<Sidebar {...defaultProps} favorites={favorites} />);

      const favRow = document.querySelector('.favorite-row');
      const dragEvent = makeDragEvent('dragstart', {});
      fireEvent.dragStart(favRow, dragEvent);

      expect(dragEvent.dataTransfer.setData).toHaveBeenCalledWith('application/x-docvault-type', 'file');
      expect(dragEvent.dataTransfer.setData).toHaveBeenCalledWith('application/x-docvault-id', 'file-1');
    });

    it('should allow drop on folder favorites', () => {
      const onItemDrop = vi.fn();
      const favorites = {
        favorites: [{ id: 'fav1', itemType: 'folder', itemId: 'f1', name: 'DropTarget' }],
        toggleFavorite: vi.fn(),
      };

      render(<Sidebar {...defaultProps} favorites={favorites} onItemDrop={onItemDrop} />);

      const favRow = document.querySelector('.favorite-row');
      const dragOverEvent = makeDragEvent('dragover', { 'application/x-docvault-type': 'file' });
      fireEvent.dragOver(favRow, dragOverEvent);

      const dropEvent = makeDragEvent('drop', {
        'application/x-docvault-type': 'file',
        'application/x-docvault-id': 'file-2',
      });
      fireEvent.drop(favRow, dropEvent);

      expect(onItemDrop).toHaveBeenCalledWith('file', 'file-2', 'f1');
    });

    it('should not allow drop on file favorites', () => {
      const onItemDrop = vi.fn();
      const favorites = {
        favorites: [{ id: 'fav1', itemType: 'file', itemId: 'file-1', name: 'NotDropTarget' }],
        toggleFavorite: vi.fn(),
      };

      render(<Sidebar {...defaultProps} favorites={favorites} onItemDrop={onItemDrop} />);

      const favRow = document.querySelector('.favorite-row');
      const dropEvent = makeDragEvent('drop', {
        'application/x-docvault-type': 'file',
        'application/x-docvault-id': 'file-2',
      });
      fireEvent.drop(favRow, dropEvent);

      expect(onItemDrop).not.toHaveBeenCalled();
    });

    it('should not drop item on itself in favorites', () => {
      const onItemDrop = vi.fn();
      const favorites = {
        favorites: [{ id: 'fav1', itemType: 'folder', itemId: 'f1', name: 'SelfDrop' }],
        toggleFavorite: vi.fn(),
      };

      render(<Sidebar {...defaultProps} favorites={favorites} onItemDrop={onItemDrop} />);

      const favRow = document.querySelector('.favorite-row');
      const dropEvent = makeDragEvent('drop', {
        'application/x-docvault-type': 'folder',
        'application/x-docvault-id': 'f1',
      });
      fireEvent.drop(favRow, dropEvent);

      expect(onItemDrop).not.toHaveBeenCalled();
    });
  });

  describe('navigation cancels rename', () => {
    it('should cancel rename when navigating to a folder', () => {
      const explorer = {
        ...baseExplorer,
        currentFolderId: 'f1',
        allFolders: [
          { id: 'f1', name: 'Current', parentId: null },
          { id: 'f2', name: 'Other', parentId: null },
        ],
      };

      render(<Sidebar {...defaultProps} explorer={explorer} />);

      // Start rename
      fireEvent.click(document.querySelector('.rename-btn'));
      expect(document.querySelector('.rename-current-form')).toBeInTheDocument();

      // Navigate to another folder
      fireEvent.click(screen.getByText('Other'));

      // Rename form should be closed
      expect(document.querySelector('.rename-current-form')).not.toBeInTheDocument();
    });
  });
});
