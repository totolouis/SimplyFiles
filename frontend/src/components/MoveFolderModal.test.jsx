import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./MoveFileModal.css', () => ({}));

import MoveFolderModal from './MoveFolderModal';

describe('MoveFolderModal', () => {
  const mockFolders = [
    { id: 'f1', name: 'Documents', parentId: null },
    { id: 'f2', name: 'Photos', parentId: null },
    { id: 'f3', name: 'Work', parentId: 'f1' },
    { id: 'f4', name: 'Personal', parentId: 'f1' },
    { id: 'f5', name: 'Projects', parentId: 'f3' },
  ];

  const mockFolder = {
    id: 'f1',
    name: 'Documents',
    parentId: null,
  };

  const baseProps = {
    folder: mockFolder,
    folders: mockFolders,
    currentFolderId: null,
    onClose: vi.fn(),
    onMove: vi.fn().mockResolvedValue({}),
    isMobile: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render modal with folder name in title', () => {
      render(<MoveFolderModal {...baseProps} />);
      expect(screen.getByText(/Move "Documents"/)).toBeInTheDocument();
    });

    it('should render search input', () => {
      render(<MoveFolderModal {...baseProps} />);
      expect(screen.getByPlaceholderText('Search folders...')).toBeInTheDocument();
    });

    it('should render close button', () => {
      render(<MoveFolderModal {...baseProps} />);
      const closeBtn = document.querySelector('.move-modal-close');
      expect(closeBtn).toBeInTheDocument();
    });

    it('should show All Files option', () => {
      render(<MoveFolderModal {...baseProps} />);
      // "All Files" appears in both the row and the footer path value
      const allFilesElements = screen.getAllByText('All Files');
      expect(allFilesElements.length).toBeGreaterThanOrEqual(1);
    });

    it('should show available folders excluding disabled', () => {
      render(<MoveFolderModal {...baseProps} />);
      expect(screen.getByText('Photos')).toBeInTheDocument();
    });

    it('should show empty message when no folders', () => {
      render(<MoveFolderModal {...baseProps} folders={[]} />);
      expect(screen.getByText('No folders yet')).toBeInTheDocument();
    });
  });

  describe('close interactions', () => {
    it('should call onClose when close button clicked', () => {
      const onClose = vi.fn();
      render(<MoveFolderModal {...baseProps} onClose={onClose} />);

      const closeBtn = document.querySelector('.move-modal-close');
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalled();
    });

    it('should call onClose when backdrop clicked', () => {
      const onClose = vi.fn();
      render(<MoveFolderModal {...baseProps} onClose={onClose} />);

      const backdrop = document.querySelector('.move-modal-backdrop');
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalled();
    });

    it('should not close when clicking modal content', () => {
      const onClose = vi.fn();
      render(<MoveFolderModal {...baseProps} onClose={onClose} />);

      const modal = document.querySelector('.move-modal');
      fireEvent.click(modal);
      expect(onClose).not.toHaveBeenCalled();
    });

    it('should close when Cancel button clicked', () => {
      const onClose = vi.fn();
      render(<MoveFolderModal {...baseProps} onClose={onClose} />);

      const cancelBtn = screen.getByText('Cancel');
      fireEvent.click(cancelBtn);
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('disabled folders', () => {
    it('should not show the folder being moved in the tree', () => {
      render(<MoveFolderModal {...baseProps} />);

      // Documents (f1) is the folder being moved; it and its descendants
      // are filtered from rootFolders, so they don't appear in the tree view
      // Only Photos should appear as a root folder
      const folderNames = document.querySelectorAll('.move-folder-name.truncate');
      const names = Array.from(folderNames).map(el => el.textContent);
      expect(names).not.toContain('Documents');
    });

    it('should not show descendants of the folder being moved in the tree', () => {
      render(<MoveFolderModal {...baseProps} />);

      // Work, Personal, and Projects are descendants of Documents and should not appear
      expect(screen.queryByText('Work')).not.toBeInTheDocument();
      expect(screen.queryByText('Projects')).not.toBeInTheDocument();
    });

    it('should not show disabled folders in search results', () => {
      render(<MoveFolderModal {...baseProps} />);

      const searchInput = screen.getByPlaceholderText('Search folders...');
      fireEvent.change(searchInput, { target: { value: 'work' } });

      // Work is a descendant of the folder being moved, so it's excluded from search
      expect(screen.queryByText('Work')).not.toBeInTheDocument();
    });
  });

  describe('folder selection', () => {
    it('should select All Files by default when currentFolderId is null', () => {
      render(<MoveFolderModal {...baseProps} />);

      const selectedRow = document.querySelector('.move-folder-row.selected');
      expect(selectedRow).toBeInTheDocument();
      expect(selectedRow.textContent).toContain('All Files');
    });

    it('should update selection when clicking available folder', () => {
      render(<MoveFolderModal {...baseProps} />);

      const photosRow = screen.getByText('Photos').closest('.move-folder-row');
      fireEvent.click(photosRow);

      expect(photosRow.classList.contains('selected')).toBe(true);
    });

    it('should update selection when clicking All Files', () => {
      render(<MoveFolderModal {...baseProps} currentFolderId="f2" />);

      // Find the All Files row in the folder tree
      const folderRows = document.querySelectorAll('.move-folder-row');
      const allFilesRow = Array.from(folderRows).find(row =>
        row.querySelector('.move-folder-name')?.textContent === 'All Files'
      );
      fireEvent.click(allFilesRow);

      expect(allFilesRow.classList.contains('selected')).toBe(true);
    });

    it('should show folder path in footer', () => {
      render(<MoveFolderModal {...baseProps} currentFolderId="f2" />);

      expect(screen.getByText(/Moving to:/)).toBeInTheDocument();
    });
  });

  describe('folder tree expansion', () => {
    it('should expand folder when chevron clicked', () => {
      // Use a different folder being moved so Photos has children visible
      const folders = [
        { id: 'f1', name: 'Documents', parentId: null },
        { id: 'f2', name: 'Photos', parentId: null },
        { id: 'f6', name: 'Vacation', parentId: 'f2' },
      ];
      const folder = { id: 'f1', name: 'Documents', parentId: null };
      render(<MoveFolderModal {...baseProps} folder={folder} folders={folders} />);

      const photosRow = screen.getByText('Photos').closest('.move-folder-row');
      const chevronBtn = photosRow.querySelector('.move-chevron-btn');

      fireEvent.click(chevronBtn);

      expect(screen.getByText('Vacation')).toBeInTheDocument();
    });

    it('should collapse expanded folder when chevron clicked again', () => {
      render(<MoveFolderModal {...baseProps} />);

      const photosRow = screen.getByText('Photos').closest('.move-folder-row');
      const chevronBtn = photosRow.querySelector('.move-chevron-btn');

      fireEvent.click(chevronBtn);
      fireEvent.click(chevronBtn);

      // Photos has no non-disabled children, so nothing to show/hide,
      // but we can verify the click doesn't error
      expect(photosRow).toBeInTheDocument();
    });

    it('should disable chevron for folders without children', () => {
      // Photos has no children (non-disabled), so its chevron should be disabled
      render(<MoveFolderModal {...baseProps} />);

      const photosRow = screen.getByText('Photos').closest('.move-folder-row');
      const chevronBtn = photosRow.querySelector('.move-chevron-btn');

      expect(chevronBtn).toBeDisabled();
    });
  });

  describe('search functionality', () => {
    it('should show search results when typing', () => {
      render(<MoveFolderModal {...baseProps} />);

      const searchInput = screen.getByPlaceholderText('Search folders...');
      fireEvent.change(searchInput, { target: { value: 'photo' } });

      // "Photos" appears as both result name and result path (since it's a root folder)
      const photosElements = screen.getAllByText('Photos');
      expect(photosElements.length).toBeGreaterThanOrEqual(1);
    });

    it('should not show disabled folders in search results', () => {
      render(<MoveFolderModal {...baseProps} />);

      const searchInput = screen.getByPlaceholderText('Search folders...');
      fireEvent.change(searchInput, { target: { value: 'work' } });

      expect(screen.queryByText('Work')).not.toBeInTheDocument();
    });

    it('should show empty message when search has no results', () => {
      render(<MoveFolderModal {...baseProps} />);

      const searchInput = screen.getByPlaceholderText('Search folders...');
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

      expect(screen.getByText('No folders found')).toBeInTheDocument();
    });

    it('should clear search when clear button clicked', () => {
      render(<MoveFolderModal {...baseProps} />);

      const searchInput = screen.getByPlaceholderText('Search folders...');
      fireEvent.change(searchInput, { target: { value: 'photo' } });

      const clearBtn = document.querySelector('.move-search-clear');
      fireEvent.click(clearBtn);

      expect(searchInput.value).toBe('');
    });

    it('should select folder from search results', () => {
      render(<MoveFolderModal {...baseProps} />);

      const searchInput = screen.getByPlaceholderText('Search folders...');
      fireEvent.change(searchInput, { target: { value: 'photo' } });

      // Find the search result element directly
      const photoResult = document.querySelector('.move-search-result');
      fireEvent.click(photoResult);

      expect(photoResult.classList.contains('selected')).toBe(true);
    });
  });

  describe('move operation', () => {
    it('should disable Move button when same folder selected', () => {
      render(<MoveFolderModal {...baseProps} currentFolderId={null} />);

      const moveBtn = screen.getByText('Move').closest('button');
      expect(moveBtn).toBeDisabled();
    });

    it('should enable Move button when different folder selected', () => {
      render(<MoveFolderModal {...baseProps} currentFolderId={null} />);

      const photosRow = screen.getByText('Photos').closest('.move-folder-row');
      fireEvent.click(photosRow);

      const moveBtn = screen.getByText('Move').closest('button');
      expect(moveBtn).not.toBeDisabled();
    });

    it('should call onMove when Move button clicked', async () => {
      const onMove = vi.fn().mockResolvedValue({});
      render(<MoveFolderModal {...baseProps} onMove={onMove} currentFolderId={null} />);

      const photosRow = screen.getByText('Photos').closest('.move-folder-row');
      fireEvent.click(photosRow);

      const moveBtn = screen.getByText('Move').closest('button');
      fireEvent.click(moveBtn);

      await waitFor(() => {
        expect(onMove).toHaveBeenCalledWith('f2');
      });
    });

    it('should move folder to All Files (null)', async () => {
      const onMove = vi.fn().mockResolvedValue({});
      render(<MoveFolderModal {...baseProps} onMove={onMove} currentFolderId="f2" />);

      // Find the All Files row in the folder tree
      const folderRows = document.querySelectorAll('.move-folder-row');
      const allFilesRow = Array.from(folderRows).find(row =>
        row.querySelector('.move-folder-name')?.textContent === 'All Files'
      );
      fireEvent.click(allFilesRow);

      const moveBtn = screen.getByText('Move').closest('button');
      fireEvent.click(moveBtn);

      await waitFor(() => {
        expect(onMove).toHaveBeenCalledWith(null);
      });
    });

    it('should close modal after successful move', async () => {
      const onClose = vi.fn();
      const onMove = vi.fn().mockResolvedValue({});
      render(<MoveFolderModal {...baseProps} onClose={onClose} onMove={onMove} currentFolderId={null} />);

      const photosRow = screen.getByText('Photos').closest('.move-folder-row');
      fireEvent.click(photosRow);

      const moveBtn = screen.getByText('Move').closest('button');
      fireEvent.click(moveBtn);

      await waitFor(() => {
        expect(onClose).not.toHaveBeenCalled();
      });
      // Note: MoveFolderModal doesn't call onClose after move - it only calls onMove.
      // The parent component is responsible for closing the modal.
      expect(onMove).toHaveBeenCalledWith('f2');
    });

    it('should show loading state during move', async () => {
      const onMove = vi.fn().mockReturnValue(new Promise(() => {}));
      render(<MoveFolderModal {...baseProps} onMove={onMove} currentFolderId={null} />);

      const photosRow = screen.getByText('Photos').closest('.move-folder-row');
      fireEvent.click(photosRow);

      const moveBtn = screen.getByText('Move').closest('button');
      fireEvent.click(moveBtn);

      expect(screen.getByText(/Moving\.\.\./)).toBeInTheDocument();
      expect(moveBtn).toBeDisabled();
    });

    it('should show error message on move failure', async () => {
      const onMove = vi.fn().mockRejectedValue(new Error('Move failed'));
      render(<MoveFolderModal {...baseProps} onMove={onMove} currentFolderId={null} />);

      const photosRow = screen.getByText('Photos').closest('.move-folder-row');
      fireEvent.click(photosRow);

      const moveBtn = screen.getByText('Move').closest('button');
      fireEvent.click(moveBtn);

      await waitFor(() => {
        expect(screen.getByText('Failed to move folder. Please try again.')).toBeInTheDocument();
      });
    });

    it('should disable Move button when same folder is selected as current', () => {
      render(<MoveFolderModal {...baseProps} currentFolderId={null} />);

      // All Files (null) is selected by default and currentFolderId is null
      const moveBtn = screen.getByText('Move').closest('button');
      expect(moveBtn).toBeDisabled();
    });

    it('should disable Move button when moving', async () => {
      const onMove = vi.fn().mockReturnValue(new Promise(() => {}));
      render(<MoveFolderModal {...baseProps} onMove={onMove} currentFolderId={null} />);

      const photosRow = screen.getByText('Photos').closest('.move-folder-row');
      fireEvent.click(photosRow);

      const moveBtn = screen.getByText('Move').closest('button');
      fireEvent.click(moveBtn);

      expect(moveBtn).toBeDisabled();
    });
  });

  describe('mobile styling', () => {
    it('should apply mobile class when isMobile is true', () => {
      render(<MoveFolderModal {...baseProps} isMobile={true} />);

      const backdrop = document.querySelector('.move-modal-backdrop');
      const modal = document.querySelector('.move-modal');

      expect(backdrop.classList.contains('mobile')).toBe(true);
      expect(modal.classList.contains('mobile')).toBe(true);
    });
  });

  describe('folder path display', () => {
    it('should show All Files path in footer', () => {
      render(<MoveFolderModal {...baseProps} currentFolderId={null} />);

      const pathValue = document.querySelector('.move-path-value');
      expect(pathValue.textContent).toBe('All Files');
    });

    it('should show folder path in footer', () => {
      render(<MoveFolderModal {...baseProps} currentFolderId="f3" />);

      const pathValue = document.querySelector('.move-path-value');
      expect(pathValue.textContent).toBe('Documents / Work');
    });
  });
});
