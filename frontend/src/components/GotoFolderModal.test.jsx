import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./MoveFileModal.css', () => ({}));

const mockSearchGotoFolders = vi.fn();

vi.mock('../api', () => ({
  api: {
    searchGotoFolders: (...args) => mockSearchGotoFolders(...args),
  },
}));

import GotoFolderModal from './GotoFolderModal';

describe('GotoFolderModal', () => {
  const baseProps = {
    onClose: vi.fn(),
    onNavigate: vi.fn(),
    isMobile: false,
  };

  const mockResults = [
    { id: 'f1', name: 'Documents', fullPath: '/Documents' },
    { id: 'f2', name: 'Photos', fullPath: '/Photos' },
    { id: 'f3', name: 'Work', fullPath: '/Documents/Work' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchGotoFolders.mockResolvedValue({
      results: [],
      totalPages: 0,
      page: 0,
    });
  });

  describe('rendering', () => {
    it('should render modal with title', () => {
      render(<GotoFolderModal {...baseProps} />);
      expect(screen.getByText('Goto Folder')).toBeInTheDocument();
    });

    it('should render search input', () => {
      render(<GotoFolderModal {...baseProps} />);
      expect(screen.getByPlaceholderText(/Search folders/)).toBeInTheDocument();
    });

    it('should render close button', () => {
      render(<GotoFolderModal {...baseProps} />);
      const closeBtn = document.querySelector('.move-modal-close');
      expect(closeBtn).toBeInTheDocument();
    });
  });

  describe('close interactions', () => {
    it('should call onClose when close button clicked', () => {
      const onClose = vi.fn();
      render(<GotoFolderModal {...baseProps} onClose={onClose} />);

      const closeBtn = document.querySelector('.move-modal-close');
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalled();
    });

    it('should call onClose when backdrop clicked', () => {
      const onClose = vi.fn();
      render(<GotoFolderModal {...baseProps} onClose={onClose} />);

      const backdrop = document.querySelector('.move-modal-backdrop');
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalled();
    });

    it('should not close when clicking modal content', () => {
      const onClose = vi.fn();
      render(<GotoFolderModal {...baseProps} onClose={onClose} />);

      const modal = document.querySelector('.move-modal');
      fireEvent.click(modal);
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('search functionality', () => {
    it('should show prompt to type initially', () => {
      render(<GotoFolderModal {...baseProps} />);
      expect(screen.getByText('Type to search for folders')).toBeInTheDocument();
    });

    it('should debounce search requests', async () => {
      mockSearchGotoFolders.mockResolvedValue({
        results: mockResults,
        totalPages: 1,
        page: 0,
      });

      render(<GotoFolderModal {...baseProps} />);

      const input = screen.getByPlaceholderText(/Search folders/);
      fireEvent.change(input, { target: { value: 'doc' } });

      expect(mockSearchGotoFolders).not.toHaveBeenCalled();

      await waitFor(() => {
        expect(mockSearchGotoFolders).toHaveBeenCalledWith('doc', 0, 20);
      }, { timeout: 500 });
    });

    it('should clear search results when query is cleared', async () => {
      mockSearchGotoFolders.mockResolvedValue({
        results: mockResults,
        totalPages: 1,
        page: 0,
      });

      render(<GotoFolderModal {...baseProps} />);

      const input = screen.getByPlaceholderText(/Search folders/);
      fireEvent.change(input, { target: { value: 'doc' } });

      await waitFor(() => {
        expect(screen.getByText('Documents')).toBeInTheDocument();
      });

      const clearBtn = document.querySelector('.move-search-clear');
      fireEvent.click(clearBtn);

      // After clearing, the debounced search fires with empty query which clears results
      await waitFor(() => {
        expect(screen.getByText('Type to search for folders')).toBeInTheDocument();
      });
    });

    it('should show loading state during search', async () => {
      mockSearchGotoFolders.mockReturnValue(new Promise(() => {}));

      render(<GotoFolderModal {...baseProps} />);

      const input = screen.getByPlaceholderText(/Search folders/);
      fireEvent.change(input, { target: { value: 'doc' } });

      // Loading state appears after the 300ms debounce
      await waitFor(() => {
        expect(screen.getByText('Searching...')).toBeInTheDocument();
      });
    });

    it('should show no results message when search returns empty', async () => {
      mockSearchGotoFolders.mockResolvedValue({
        results: [],
        totalPages: 0,
        page: 0,
      });

      render(<GotoFolderModal {...baseProps} />);

      const input = screen.getByPlaceholderText(/Search folders/);
      fireEvent.change(input, { target: { value: 'nonexistent' } });

      await waitFor(() => {
        expect(screen.getByText('No folders found')).toBeInTheDocument();
      });
    });

    it('should display search results', async () => {
      mockSearchGotoFolders.mockResolvedValue({
        results: mockResults,
        totalPages: 1,
        page: 0,
      });

      render(<GotoFolderModal {...baseProps} />);

      const input = screen.getByPlaceholderText(/Search folders/);
      fireEvent.change(input, { target: { value: 'doc' } });

      await waitFor(() => {
        expect(screen.getByText('Documents')).toBeInTheDocument();
        expect(screen.getByText('/Documents')).toBeInTheDocument();
        expect(screen.getByText('Photos')).toBeInTheDocument();
        expect(screen.getByText('/Photos')).toBeInTheDocument();
      });
    });

    it('should show error message on search failure', async () => {
      mockSearchGotoFolders.mockRejectedValue(new Error('Search failed'));

      render(<GotoFolderModal {...baseProps} />);

      const input = screen.getByPlaceholderText(/Search folders/);
      fireEvent.change(input, { target: { value: 'doc' } });

      await waitFor(() => {
        expect(screen.getByText('Failed to search folders')).toBeInTheDocument();
      });
    });
  });

  describe('keyboard navigation', () => {
    it('should close on Escape key', () => {
      const onClose = vi.fn();
      render(<GotoFolderModal {...baseProps} onClose={onClose} />);

      const modal = document.querySelector('.move-modal');
      fireEvent.keyDown(modal, { key: 'Escape' });

      expect(onClose).toHaveBeenCalled();
    });

    it('should navigate with ArrowDown', async () => {
      mockSearchGotoFolders.mockResolvedValue({
        results: mockResults,
        totalPages: 1,
        page: 0,
      });

      render(<GotoFolderModal {...baseProps} />);

      const input = screen.getByPlaceholderText(/Search folders/);
      fireEvent.change(input, { target: { value: 'doc' } });

      await waitFor(() => {
        expect(screen.getByText('Documents')).toBeInTheDocument();
      });

      // selectedIndex starts at 0 (first result already selected)
      const modal = document.querySelector('.move-modal');
      fireEvent.keyDown(modal, { key: 'ArrowDown' });

      // After ArrowDown, selectedIndex moves to 1 (second result)
      const results = document.querySelectorAll('.move-search-result');
      expect(results[1].classList.contains('selected')).toBe(true);
    });

    it('should navigate with ArrowUp', async () => {
      mockSearchGotoFolders.mockResolvedValue({
        results: mockResults,
        totalPages: 1,
        page: 0,
      });

      render(<GotoFolderModal {...baseProps} />);

      const input = screen.getByPlaceholderText(/Search folders/);
      fireEvent.change(input, { target: { value: 'doc' } });

      await waitFor(() => {
        expect(screen.getByText('Documents')).toBeInTheDocument();
      });

      // selectedIndex starts at 0, ArrowUp wraps to last item
      const modal = document.querySelector('.move-modal');
      fireEvent.keyDown(modal, { key: 'ArrowUp' });

      const results = document.querySelectorAll('.move-search-result');
      expect(results[results.length - 1].classList.contains('selected')).toBe(true);
    });

    it('should select folder with Enter key', async () => {
      const onNavigate = vi.fn();
      mockSearchGotoFolders.mockResolvedValue({
        results: mockResults,
        totalPages: 1,
        page: 0,
      });

      render(<GotoFolderModal {...baseProps} onNavigate={onNavigate} />);

      const input = screen.getByPlaceholderText(/Search folders/);
      fireEvent.change(input, { target: { value: 'doc' } });

      await waitFor(() => {
        expect(screen.getByText('Documents')).toBeInTheDocument();
      });

      const modal = document.querySelector('.move-modal');
      fireEvent.keyDown(modal, { key: 'Enter' });

      expect(onNavigate).toHaveBeenCalledWith('f1');
    });

    it('should go to next page with PageDown', async () => {
      mockSearchGotoFolders.mockResolvedValue({
        results: mockResults,
        totalPages: 2,
        page: 0,
      });

      render(<GotoFolderModal {...baseProps} />);

      const input = screen.getByPlaceholderText(/Search folders/);
      fireEvent.change(input, { target: { value: 'doc' } });

      await waitFor(() => {
        expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
      });

      const modal = document.querySelector('.move-modal');
      fireEvent.keyDown(modal, { key: 'PageDown' });

      await waitFor(() => {
        expect(mockSearchGotoFolders).toHaveBeenCalledWith('doc', 1, 20);
      });
    });

    it('should go to previous page with PageUp', async () => {
      mockSearchGotoFolders.mockResolvedValue({
        results: mockResults,
        totalPages: 2,
        page: 1,
      });

      render(<GotoFolderModal {...baseProps} />);

      const input = screen.getByPlaceholderText(/Search folders/);
      fireEvent.change(input, { target: { value: 'doc' } });

      await waitFor(() => {
        expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
      });

      const modal = document.querySelector('.move-modal');
      fireEvent.keyDown(modal, { key: 'PageUp' });

      await waitFor(() => {
        expect(mockSearchGotoFolders).toHaveBeenCalledWith('doc', 0, 20);
      });
    });
  });

  describe('pagination', () => {
    it('should show pagination info when multiple pages', async () => {
      mockSearchGotoFolders.mockResolvedValue({
        results: mockResults,
        totalPages: 3,
        page: 0,
      });

      render(<GotoFolderModal {...baseProps} />);

      const input = screen.getByPlaceholderText(/Search folders/);
      fireEvent.change(input, { target: { value: 'doc' } });

      await waitFor(() => {
        expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
      });
    });

    it('should show pagination buttons when multiple pages', async () => {
      mockSearchGotoFolders.mockResolvedValue({
        results: mockResults,
        totalPages: 3,
        page: 0,
      });

      render(<GotoFolderModal {...baseProps} />);

      const input = screen.getByPlaceholderText(/Search folders/);
      fireEvent.change(input, { target: { value: 'doc' } });

      await waitFor(() => {
        const prevBtn = document.querySelector('.goto-page-btn');
        expect(prevBtn).toBeInTheDocument();
      });
    });

    it('should disable previous button on first page', async () => {
      mockSearchGotoFolders.mockResolvedValue({
        results: mockResults,
        totalPages: 2,
        page: 0,
      });

      render(<GotoFolderModal {...baseProps} />);

      const input = screen.getByPlaceholderText(/Search folders/);
      fireEvent.change(input, { target: { value: 'doc' } });

      await waitFor(() => {
        const buttons = document.querySelectorAll('.goto-page-btn');
        expect(buttons[0]).toBeDisabled();
        expect(buttons[1]).not.toBeDisabled();
      });
    });

    it('should disable next button on last page', async () => {
      mockSearchGotoFolders.mockResolvedValue({
        results: mockResults,
        totalPages: 2,
        page: 1,
      });

      render(<GotoFolderModal {...baseProps} />);

      const input = screen.getByPlaceholderText(/Search folders/);
      fireEvent.change(input, { target: { value: 'doc' } });

      await waitFor(() => {
        const buttons = document.querySelectorAll('.goto-page-btn');
        expect(buttons[0]).not.toBeDisabled();
        expect(buttons[1]).toBeDisabled();
      });
    });

    it('should go to next page when next button clicked', async () => {
      mockSearchGotoFolders.mockResolvedValue({
        results: mockResults,
        totalPages: 2,
        page: 0,
      });

      render(<GotoFolderModal {...baseProps} />);

      const input = screen.getByPlaceholderText(/Search folders/);
      fireEvent.change(input, { target: { value: 'doc' } });

      await waitFor(() => {
        expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
      });

      const buttons = document.querySelectorAll('.goto-page-btn');
      fireEvent.click(buttons[1]);

      expect(mockSearchGotoFolders).toHaveBeenCalledWith('doc', 1, 20);
    });

    it('should show result count', async () => {
      mockSearchGotoFolders.mockResolvedValue({
        results: mockResults,
        totalPages: 1,
        page: 0,
      });

      render(<GotoFolderModal {...baseProps} />);

      const input = screen.getByPlaceholderText(/Search folders/);
      fireEvent.change(input, { target: { value: 'doc' } });

      await waitFor(() => {
        expect(screen.getByText('3 results')).toBeInTheDocument();
      });
    });
  });

  describe('folder selection', () => {
    it('should select folder on click', async () => {
      const onNavigate = vi.fn();
      mockSearchGotoFolders.mockResolvedValue({
        results: mockResults,
        totalPages: 1,
        page: 0,
      });

      render(<GotoFolderModal {...baseProps} onNavigate={onNavigate} />);

      const input = screen.getByPlaceholderText(/Search folders/);
      fireEvent.change(input, { target: { value: 'doc' } });

      await waitFor(() => {
        expect(screen.getByText('Documents')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Documents'));

      expect(onNavigate).toHaveBeenCalledWith('f1');
    });

    it('should update selection on mouse enter', async () => {
      mockSearchGotoFolders.mockResolvedValue({
        results: mockResults,
        totalPages: 1,
        page: 0,
      });

      render(<GotoFolderModal {...baseProps} />);

      const input = screen.getByPlaceholderText(/Search folders/);
      fireEvent.change(input, { target: { value: 'doc' } });

      await waitFor(() => {
        expect(screen.getByText('Documents')).toBeInTheDocument();
      });

      const results = document.querySelectorAll('.move-search-result');
      fireEvent.mouseEnter(results[1]);

      expect(results[1].classList.contains('selected')).toBe(true);
    });
  });

  describe('mobile styling', () => {
    it('should apply mobile class when isMobile is true', () => {
      render(<GotoFolderModal {...baseProps} isMobile={true} />);

      const backdrop = document.querySelector('.move-modal-backdrop');
      const modal = document.querySelector('.move-modal');

      expect(backdrop.classList.contains('mobile')).toBe(true);
      expect(modal.classList.contains('mobile')).toBe(true);
    });
  });
});
