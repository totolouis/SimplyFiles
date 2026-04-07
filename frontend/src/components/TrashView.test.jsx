import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./TrashView.css', () => ({}));

vi.mock('../api', () => ({
  api: {
    getTrash: vi.fn(),
    restoreFile: vi.fn(),
    restoreFolder: vi.fn(),
    permanentDeleteFile: vi.fn(),
    permanentDeleteFolder: vi.fn(),
    emptyTrash: vi.fn(),
  },
}));

import TrashView from './TrashView';
import { api as mockApi } from '../api';

const trashItems = [
  {
    id: 'f1',
    name: 'document.pdf',
    type: 'file',
    deletedAt: '2025-06-10T10:00:00Z',
    expiresAt: '2099-07-10T10:00:00Z',
    size: 1048576,
    mimeType: 'application/pdf',
  },
  {
    id: 'd1',
    name: 'Old Photos',
    type: 'folder',
    deletedAt: '2025-06-08T10:00:00Z',
    expiresAt: '2099-07-08T10:00:00Z',
  },
];

describe('TrashView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getTrash.mockResolvedValue([]);
    mockApi.restoreFile.mockResolvedValue(undefined);
    mockApi.restoreFolder.mockResolvedValue(undefined);
    mockApi.permanentDeleteFile.mockResolvedValue(undefined);
    mockApi.permanentDeleteFolder.mockResolvedValue(undefined);
    mockApi.emptyTrash.mockResolvedValue(undefined);
  });

  describe('loading state', () => {
    it('should show loading spinner initially', () => {
      mockApi.getTrash.mockReturnValue(new Promise(() => {})); // never resolves

      render(<TrashView onClose={vi.fn()} />);

      expect(document.querySelector('.trash-loading')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('should show empty message when trash is empty', async () => {
      mockApi.getTrash.mockResolvedValue([]);

      await act(async () => {
        render(<TrashView onClose={vi.fn()} />);
      });

      expect(screen.getByText('Trash is empty')).toBeInTheDocument();
    });

    it('should not show empty trash button when trash is empty', async () => {
      mockApi.getTrash.mockResolvedValue([]);

      await act(async () => {
        render(<TrashView onClose={vi.fn()} />);
      });

      expect(screen.queryByText('Empty trash')).not.toBeInTheDocument();
    });
  });

  describe('header', () => {
    it('should render Trash title', async () => {
      await act(async () => {
        render(<TrashView onClose={vi.fn()} />);
      });

      expect(screen.getByText('Trash')).toBeInTheDocument();
    });

    it('should show item count when trash has items', async () => {
      mockApi.getTrash.mockResolvedValue(trashItems);

      await act(async () => {
        render(<TrashView onClose={vi.fn()} />);
      });

      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('should not show item count when trash is empty', async () => {
      mockApi.getTrash.mockResolvedValue([]);

      await act(async () => {
        render(<TrashView onClose={vi.fn()} />);
      });

      expect(document.querySelector('.trash-count')).not.toBeInTheDocument();
    });

    it('should call onClose when close button is clicked', async () => {
      const onClose = vi.fn();

      await act(async () => {
        render(<TrashView onClose={onClose} />);
      });

      fireEvent.click(document.querySelector('.trash-close-btn'));
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('info banner', () => {
    it('should show 30-day retention message', async () => {
      await act(async () => {
        render(<TrashView onClose={vi.fn()} />);
      });

      expect(screen.getByText('Items are permanently deleted after 30 days.')).toBeInTheDocument();
    });
  });

  describe('trash items list', () => {
    it('should render file items with name and size', async () => {
      mockApi.getTrash.mockResolvedValue(trashItems);

      await act(async () => {
        render(<TrashView onClose={vi.fn()} />);
      });

      expect(screen.getByText('document.pdf')).toBeInTheDocument();
      expect(screen.getByText(/1\.0 MB/)).toBeInTheDocument();
    });

    it('should render folder items with "Folder" label', async () => {
      mockApi.getTrash.mockResolvedValue(trashItems);

      await act(async () => {
        render(<TrashView onClose={vi.fn()} />);
      });

      expect(screen.getByText('Old Photos')).toBeInTheDocument();
      expect(screen.getByText(/Folder/)).toBeInTheDocument();
    });

    it('should show time left for each item', async () => {
      mockApi.getTrash.mockResolvedValue(trashItems);

      await act(async () => {
        render(<TrashView onClose={vi.fn()} />);
      });

      // expiresAt is far in the future so should show "Xd left"
      const metas = document.querySelectorAll('.trash-item-meta');
      expect(metas.length).toBe(2);
      metas.forEach(meta => {
        expect(meta.textContent).toMatch(/\d+d left/);
      });
    });

    it('should show restore and delete buttons for each item', async () => {
      mockApi.getTrash.mockResolvedValue([trashItems[0]]);

      await act(async () => {
        render(<TrashView onClose={vi.fn()} />);
      });

      expect(screen.getByTitle('Restore')).toBeInTheDocument();
      expect(screen.getByTitle('Delete permanently')).toBeInTheDocument();
    });
  });

  describe('restore', () => {
    it('should call restoreFile for file items', async () => {
      mockApi.getTrash.mockResolvedValue([trashItems[0]]);

      await act(async () => {
        render(<TrashView onClose={vi.fn()} />);
      });

      await act(async () => {
        fireEvent.click(screen.getByTitle('Restore'));
      });

      expect(mockApi.restoreFile).toHaveBeenCalledWith('f1');
    });

    it('should call restoreFolder for folder items', async () => {
      mockApi.getTrash.mockResolvedValue([trashItems[1]]);

      await act(async () => {
        render(<TrashView onClose={vi.fn()} />);
      });

      await act(async () => {
        fireEvent.click(screen.getByTitle('Restore'));
      });

      expect(mockApi.restoreFolder).toHaveBeenCalledWith('d1');
    });

    it('should call onRestored callback after restoring', async () => {
      const onRestored = vi.fn();
      mockApi.getTrash.mockResolvedValue([trashItems[0]]);

      await act(async () => {
        render(<TrashView onClose={vi.fn()} onRestored={onRestored} />);
      });

      await act(async () => {
        fireEvent.click(screen.getByTitle('Restore'));
      });

      expect(onRestored).toHaveBeenCalled();
    });

    it('should reload trash after restoring', async () => {
      mockApi.getTrash.mockResolvedValue([trashItems[0]]);

      await act(async () => {
        render(<TrashView onClose={vi.fn()} />);
      });

      mockApi.getTrash.mockResolvedValue([]);

      await act(async () => {
        fireEvent.click(screen.getByTitle('Restore'));
      });

      // getTrash called on mount + after restore
      expect(mockApi.getTrash).toHaveBeenCalledTimes(2);
    });
  });

  describe('permanent delete', () => {
    it('should call permanentDeleteFile after confirm for file items', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      mockApi.getTrash.mockResolvedValue([trashItems[0]]);

      await act(async () => {
        render(<TrashView onClose={vi.fn()} />);
      });

      await act(async () => {
        fireEvent.click(screen.getByTitle('Delete permanently'));
      });

      expect(window.confirm).toHaveBeenCalledWith(
        'Permanently delete "document.pdf"? This cannot be undone.',
      );
      expect(mockApi.permanentDeleteFile).toHaveBeenCalledWith('f1');
      window.confirm.mockRestore();
    });

    it('should call permanentDeleteFolder after confirm for folder items', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      mockApi.getTrash.mockResolvedValue([trashItems[1]]);

      await act(async () => {
        render(<TrashView onClose={vi.fn()} />);
      });

      await act(async () => {
        fireEvent.click(screen.getByTitle('Delete permanently'));
      });

      expect(mockApi.permanentDeleteFolder).toHaveBeenCalledWith('d1');
      window.confirm.mockRestore();
    });

    it('should not delete when confirm is cancelled', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      mockApi.getTrash.mockResolvedValue([trashItems[0]]);

      await act(async () => {
        render(<TrashView onClose={vi.fn()} />);
      });

      await act(async () => {
        fireEvent.click(screen.getByTitle('Delete permanently'));
      });

      expect(mockApi.permanentDeleteFile).not.toHaveBeenCalled();
      window.confirm.mockRestore();
    });
  });

  describe('empty trash', () => {
    it('should show "Empty trash" button when items exist', async () => {
      mockApi.getTrash.mockResolvedValue(trashItems);

      await act(async () => {
        render(<TrashView onClose={vi.fn()} />);
      });

      expect(screen.getByText('Empty trash')).toBeInTheDocument();
    });

    it('should show confirmation text on first click', async () => {
      mockApi.getTrash.mockResolvedValue(trashItems);

      await act(async () => {
        render(<TrashView onClose={vi.fn()} />);
      });

      fireEvent.click(screen.getByText('Empty trash'));
      expect(screen.getByText('Confirm empty?')).toBeInTheDocument();
    });

    it('should call emptyTrash on second click (confirm)', async () => {
      mockApi.getTrash.mockResolvedValue(trashItems);

      await act(async () => {
        render(<TrashView onClose={vi.fn()} />);
      });

      fireEvent.click(screen.getByText('Empty trash'));

      await act(async () => {
        fireEvent.click(screen.getByText('Confirm empty?'));
      });

      expect(mockApi.emptyTrash).toHaveBeenCalled();
    });

    it('should add confirm class when in confirm state', async () => {
      mockApi.getTrash.mockResolvedValue(trashItems);

      await act(async () => {
        render(<TrashView onClose={vi.fn()} />);
      });

      fireEvent.click(screen.getByText('Empty trash'));

      const btn = document.querySelector('.trash-empty-btn');
      expect(btn.classList.contains('confirm')).toBe(true);
    });

    it('should cancel confirm state on blur', async () => {
      mockApi.getTrash.mockResolvedValue(trashItems);

      await act(async () => {
        render(<TrashView onClose={vi.fn()} />);
      });

      fireEvent.click(screen.getByText('Empty trash'));
      expect(screen.getByText('Confirm empty?')).toBeInTheDocument();

      fireEvent.blur(document.querySelector('.trash-empty-btn'));
      expect(screen.getByText('Empty trash')).toBeInTheDocument();
    });
  });

  describe('error handling', () => {
    it('should handle getTrash failure gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockApi.getTrash.mockRejectedValue(new Error('Network error'));

      await act(async () => {
        render(<TrashView onClose={vi.fn()} />);
      });

      // Should still render (empty state) without crashing
      expect(screen.getByText('Trash')).toBeInTheDocument();
      consoleSpy.mockRestore();
    });

    it('should handle restore failure gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockApi.getTrash.mockResolvedValue([trashItems[0]]);
      mockApi.restoreFile.mockRejectedValue(new Error('Restore failed'));

      await act(async () => {
        render(<TrashView onClose={vi.fn()} />);
      });

      await act(async () => {
        fireEvent.click(screen.getByTitle('Restore'));
      });

      // Should not crash, item should remain
      expect(screen.getByText('document.pdf')).toBeInTheDocument();
      consoleSpy.mockRestore();
    });
  });
});
