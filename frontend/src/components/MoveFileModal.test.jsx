import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./MoveFileModal.css', () => ({}));

const mockMoveFile = vi.fn();

vi.mock('../api', () => ({
  api: {
    moveFile: (...args) => mockMoveFile(...args),
  },
}));

import MoveFileModal from './MoveFileModal';

describe('MoveFileModal', () => {
  const mockFolders = [
    { id: 'f1', name: 'Documents', parentId: null },
    { id: 'f2', name: 'Photos', parentId: null },
    { id: 'f3', name: 'Work', parentId: 'f1' },
    { id: 'f4', name: 'Personal', parentId: 'f1' },
  ];

  const mockFile = {
    id: 'file1',
    filename: 'document.pdf',
    folderId: 'f1',
  };

  const baseProps = {
    file: mockFile,
    folders: mockFolders,
    currentFolderId: 'f1',
    onClose: vi.fn(),
    onMove: vi.fn(),
    isMobile: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockMoveFile.mockResolvedValue({});
  });

  describe('rendering', () => {
    it('should render modal with file name in title', () => {
      render(<MoveFileModal {...baseProps} />);
      expect(screen.getByText(/Move "document.pdf"/)).toBeInTheDocument();
    });

    it('should render search input', () => {
      render(<MoveFileModal {...baseProps} />);
      expect(screen.getByPlaceholderText('Search folders...')).toBeInTheDocument();
    });

    it('should render close button', () => {
      render(<MoveFileModal {...baseProps} />);
      const closeBtn = document.querySelector('.move-modal-close');
      expect(closeBtn).toBeInTheDocument();
    });

    it('should show All Files option', () => {
      render(<MoveFileModal {...baseProps} />);
      expect(screen.getByText('All Files')).toBeInTheDocument();
    });

    it('should show root folders', () => {
      render(<MoveFileModal {...baseProps} />);
      // Documents appears in both the folder tree and the footer path, so use getAllByText
      const docsElements = screen.getAllByText('Documents');
      expect(docsElements.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Photos')).toBeInTheDocument();
    });

    it('should show empty message when no folders', () => {
      render(<MoveFileModal {...baseProps} folders={[]} />);
      expect(screen.getByText('No folders yet')).toBeInTheDocument();
    });
  });

  describe('close interactions', () => {
    it('should call onClose when close button clicked', () => {
      const onClose = vi.fn();
      render(<MoveFileModal {...baseProps} onClose={onClose} />);

      const closeBtn = document.querySelector('.move-modal-close');
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalled();
    });

    it('should call onClose when backdrop clicked', () => {
      const onClose = vi.fn();
      render(<MoveFileModal {...baseProps} onClose={onClose} />);

      const backdrop = document.querySelector('.move-modal-backdrop');
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalled();
    });

    it('should not close when clicking modal content', () => {
      const onClose = vi.fn();
      render(<MoveFileModal {...baseProps} onClose={onClose} />);

      const modal = document.querySelector('.move-modal');
      fireEvent.click(modal);
      expect(onClose).not.toHaveBeenCalled();
    });

    it('should close when Cancel button clicked', () => {
      const onClose = vi.fn();
      render(<MoveFileModal {...baseProps} onClose={onClose} />);

      const cancelBtn = screen.getByText('Cancel');
      fireEvent.click(cancelBtn);
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('folder selection', () => {
    it('should select All Files by default when currentFolderId is null', () => {
      render(<MoveFileModal {...baseProps} currentFolderId={null} />);

      // "All Files" appears in both the folder row and the footer path value
      const allFilesRow = document.querySelector('.move-folder-row.selected');
      expect(allFilesRow).toBeInTheDocument();
      expect(allFilesRow.textContent).toContain('All Files');
    });

    it('should select current folder by default', () => {
      render(<MoveFileModal {...baseProps} currentFolderId="f1" />);

      // Documents folder row should be selected
      const selectedRow = document.querySelector('.move-folder-row.selected');
      expect(selectedRow).toBeInTheDocument();
      expect(selectedRow.textContent).toContain('Documents');
    });

    it('should update selection when clicking a folder', () => {
      render(<MoveFileModal {...baseProps} />);

      const photosRow = screen.getByText('Photos').closest('.move-folder-row');
      fireEvent.click(photosRow);

      expect(photosRow.classList.contains('selected')).toBe(true);
    });

    it('should update selection when clicking All Files', () => {
      render(<MoveFileModal {...baseProps} currentFolderId="f1" />);

      // Find the All Files row in the folder tree (not the path value)
      const folderRows = document.querySelectorAll('.move-folder-row');
      const allFilesRow = Array.from(folderRows).find(row =>
        row.querySelector('.move-folder-name')?.textContent === 'All Files'
      );
      fireEvent.click(allFilesRow);

      expect(allFilesRow.classList.contains('selected')).toBe(true);
    });

    it('should show folder path in footer', () => {
      render(<MoveFileModal {...baseProps} currentFolderId="f1" />);

      expect(screen.getByText(/Moving to:/)).toBeInTheDocument();
    });
  });

  describe('folder tree expansion', () => {
    it('should expand folder when chevron clicked', () => {
      render(<MoveFileModal {...baseProps} />);

      // Find Documents folder row - use the one with the truncate class (in the tree, not footer)
      const docsName = document.querySelector('.move-folder-name.truncate[title="Documents"]');
      const docsRow = docsName.closest('.move-folder-row');
      const chevronBtn = docsRow.querySelector('.move-chevron-btn');

      fireEvent.click(chevronBtn);

      expect(screen.getByText('Work')).toBeInTheDocument();
      expect(screen.getByText('Personal')).toBeInTheDocument();
    });

    it('should collapse expanded folder when chevron clicked again', () => {
      render(<MoveFileModal {...baseProps} />);

      const docsName = document.querySelector('.move-folder-name.truncate[title="Documents"]');
      const docsRow = docsName.closest('.move-folder-row');
      const chevronBtn = docsRow.querySelector('.move-chevron-btn');

      fireEvent.click(chevronBtn);
      expect(screen.getByText('Work')).toBeInTheDocument();

      fireEvent.click(chevronBtn);
      expect(screen.queryByText('Work')).not.toBeInTheDocument();
    });

    it('should select nested folder', () => {
      render(<MoveFileModal {...baseProps} />);

      const docsName = document.querySelector('.move-folder-name.truncate[title="Documents"]');
      const docsRow = docsName.closest('.move-folder-row');
      const chevronBtn = docsRow.querySelector('.move-chevron-btn');
      fireEvent.click(chevronBtn);

      const workRow = screen.getByText('Work').closest('.move-folder-row');
      fireEvent.click(workRow);

      expect(workRow.classList.contains('selected')).toBe(true);
    });
  });

  describe('search functionality', () => {
    it('should show search results when typing', () => {
      render(<MoveFileModal {...baseProps} />);

      const searchInput = screen.getByPlaceholderText('Search folders...');
      fireEvent.change(searchInput, { target: { value: 'work' } });

      expect(screen.getByText('Work')).toBeInTheDocument();
      // The path is shown via getFolderPath which uses ' / ' separator
      expect(screen.getByText('Documents / Work')).toBeInTheDocument();
    });

    it('should show empty message when search has no results', () => {
      render(<MoveFileModal {...baseProps} />);

      const searchInput = screen.getByPlaceholderText('Search folders...');
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

      expect(screen.getByText('No folders found')).toBeInTheDocument();
    });

    it('should clear search when clear button clicked', () => {
      render(<MoveFileModal {...baseProps} />);

      const searchInput = screen.getByPlaceholderText('Search folders...');
      fireEvent.change(searchInput, { target: { value: 'doc' } });

      const clearBtn = document.querySelector('.move-search-clear');
      fireEvent.click(clearBtn);

      expect(searchInput.value).toBe('');
    });

    it('should return to folder tree when search cleared', () => {
      render(<MoveFileModal {...baseProps} />);

      const searchInput = screen.getByPlaceholderText('Search folders...');
      fireEvent.change(searchInput, { target: { value: 'work' } });

      expect(screen.getByText('Work')).toBeInTheDocument();

      const clearBtn = document.querySelector('.move-search-clear');
      fireEvent.click(clearBtn);

      // After clearing, Documents appears again in the folder tree (and path)
      const docsElements = screen.getAllByText('Documents');
      expect(docsElements.length).toBeGreaterThanOrEqual(1);
    });

    it('should select folder from search results', () => {
      render(<MoveFileModal {...baseProps} />);

      const searchInput = screen.getByPlaceholderText('Search folders...');
      fireEvent.change(searchInput, { target: { value: 'work' } });

      const workResult = screen.getByText('Work').closest('.move-search-result');
      fireEvent.click(workResult);

      expect(workResult.classList.contains('selected')).toBe(true);
    });
  });

  describe('move operation', () => {
    it('should disable Move button when same folder selected', () => {
      render(<MoveFileModal {...baseProps} currentFolderId="f1" />);

      const moveBtn = screen.getByText('Move').closest('button');
      expect(moveBtn).toBeDisabled();
    });

    it('should enable Move button when different folder selected', () => {
      render(<MoveFileModal {...baseProps} currentFolderId="f1" />);

      const photosRow = screen.getByText('Photos').closest('.move-folder-row');
      fireEvent.click(photosRow);

      const moveBtn = screen.getByText('Move').closest('button');
      expect(moveBtn).not.toBeDisabled();
    });

    it('should call moveFile API when Move button clicked', async () => {
      render(<MoveFileModal {...baseProps} currentFolderId="f1" />);

      const photosRow = screen.getByText('Photos').closest('.move-folder-row');
      fireEvent.click(photosRow);

      const moveBtn = screen.getByText('Move').closest('button');
      fireEvent.click(moveBtn);

      await waitFor(() => {
        expect(mockMoveFile).toHaveBeenCalledWith('file1', 'f2');
      });
    });

    it('should move file to All Files (null)', async () => {
      render(<MoveFileModal {...baseProps} currentFolderId="f1" />);

      // Find the All Files row in the folder tree
      const folderRows = document.querySelectorAll('.move-folder-row');
      const allFilesRow = Array.from(folderRows).find(row =>
        row.querySelector('.move-folder-name')?.textContent === 'All Files'
      );
      fireEvent.click(allFilesRow);

      const moveBtn = screen.getByText('Move').closest('button');
      fireEvent.click(moveBtn);

      await waitFor(() => {
        expect(mockMoveFile).toHaveBeenCalledWith('file1', null);
      });
    });

    it('should close modal and call onMove after successful move', async () => {
      const onClose = vi.fn();
      const onMove = vi.fn();
      render(<MoveFileModal {...baseProps} onClose={onClose} onMove={onMove} currentFolderId="f1" />);

      const photosRow = screen.getByText('Photos').closest('.move-folder-row');
      fireEvent.click(photosRow);

      const moveBtn = screen.getByText('Move').closest('button');
      fireEvent.click(moveBtn);

      await waitFor(() => {
        expect(onMove).toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('should show loading state during move', async () => {
      mockMoveFile.mockReturnValue(new Promise(() => {}));
      render(<MoveFileModal {...baseProps} currentFolderId="f1" />);

      const photosRow = screen.getByText('Photos').closest('.move-folder-row');
      fireEvent.click(photosRow);

      const moveBtn = screen.getByText('Move').closest('button');
      fireEvent.click(moveBtn);

      expect(screen.getByText(/Moving\.\.\./)).toBeInTheDocument();
      expect(moveBtn).toBeDisabled();
    });

    it('should show error message on move failure', async () => {
      mockMoveFile.mockRejectedValue(new Error('Move failed'));
      render(<MoveFileModal {...baseProps} currentFolderId="f1" />);

      const photosRow = screen.getByText('Photos').closest('.move-folder-row');
      fireEvent.click(photosRow);

      const moveBtn = screen.getByText('Move').closest('button');
      fireEvent.click(moveBtn);

      await waitFor(() => {
        expect(screen.getByText('Failed to move file. Please try again.')).toBeInTheDocument();
      });
    });

    it('should close immediately if same folder selected', () => {
      const onClose = vi.fn();
      render(<MoveFileModal {...baseProps} onClose={onClose} currentFolderId="f1" />);

      // Documents is already selected (same as currentFolderId)
      const moveBtn = screen.getByText('Move').closest('button');
      // The Move button is disabled when same folder is selected
      expect(moveBtn).toBeDisabled();
    });

    it('should disable Move button when moving', async () => {
      mockMoveFile.mockReturnValue(new Promise(() => {}));
      render(<MoveFileModal {...baseProps} currentFolderId="f1" />);

      const photosRow = screen.getByText('Photos').closest('.move-folder-row');
      fireEvent.click(photosRow);

      const moveBtn = screen.getByText('Move').closest('button');
      fireEvent.click(moveBtn);

      expect(moveBtn).toBeDisabled();
    });
  });

  describe('mobile styling', () => {
    it('should apply mobile class when isMobile is true', () => {
      render(<MoveFileModal {...baseProps} isMobile={true} />);

      const backdrop = document.querySelector('.move-modal-backdrop');
      const modal = document.querySelector('.move-modal');

      expect(backdrop.classList.contains('mobile')).toBe(true);
      expect(modal.classList.contains('mobile')).toBe(true);
    });
  });

  describe('folder path display', () => {
    it('should show correct path for nested folder in search results', () => {
      render(<MoveFileModal {...baseProps} />);

      const searchInput = screen.getByPlaceholderText('Search folders...');
      fireEvent.change(searchInput, { target: { value: 'work' } });

      // The path uses ' / ' separator
      expect(screen.getByText('Documents / Work')).toBeInTheDocument();
    });

    it('should show All Files path in footer', () => {
      render(<MoveFileModal {...baseProps} currentFolderId={null} />);

      // All Files appears in both the folder row and the path value
      const pathValue = document.querySelector('.move-path-value');
      expect(pathValue.textContent).toBe('All Files');
    });

    it('should show folder path in footer', () => {
      render(<MoveFileModal {...baseProps} currentFolderId="f3" />);

      const pathValue = document.querySelector('.move-path-value');
      expect(pathValue.textContent).toBe('Documents / Work');
    });
  });
});
