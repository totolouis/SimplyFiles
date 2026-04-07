import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock CSS imports
vi.mock('./MoveFileModal.css', () => ({}));
vi.mock('./CreateSymlinkModal.css', () => ({}));

// Mock api
const mockSearchSymlinkTargets = vi.fn();
const mockCreateSymlink = vi.fn();
vi.mock('../api', () => ({
  api: {
    searchSymlinkTargets: (...args) => mockSearchSymlinkTargets(...args),
    createSymlink: (...args) => mockCreateSymlink(...args),
  },
}));

import CreateSymlinkModal from './CreateSymlinkModal';

describe('CreateSymlinkModal', () => {
  let props;

  beforeEach(() => {
    mockSearchSymlinkTargets.mockReset();
    mockCreateSymlink.mockReset();
    props = {
      destinationFolderId: null,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      isMobile: false,
    };
  });

  it('should render the modal with search input', () => {
    render(<CreateSymlinkModal {...props} />);

    expect(screen.getByText('Create Symlink')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search files and folders...')).toBeInTheDocument();
  });

  it('should show prompt for short queries', () => {
    render(<CreateSymlinkModal {...props} />);

    expect(screen.getByText('Type at least 2 characters to search')).toBeInTheDocument();
  });

  it('should search after debounce with 2+ characters', async () => {
    const mockResults = [
      { id: 'r1', name: 'report.pdf', type: 'file', path: 'Documents', mimeType: 'application/pdf' },
      { id: 'r2', name: 'reports', type: 'folder', path: 'Root', mimeType: null },
    ];
    mockSearchSymlinkTargets.mockResolvedValue(mockResults);

    render(<CreateSymlinkModal {...props} />);

    const input = screen.getByPlaceholderText('Search files and folders...');
    fireEvent.change(input, { target: { value: 'report' } });

    await waitFor(() => {
      expect(screen.getByText('report.pdf')).toBeInTheDocument();
      expect(screen.getByText('reports')).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it('should show "No items found" when search returns empty', async () => {
    mockSearchSymlinkTargets.mockResolvedValue([]);

    render(<CreateSymlinkModal {...props} />);

    const input = screen.getByPlaceholderText('Search files and folders...');
    fireEvent.change(input, { target: { value: 'nonexistent' } });

    await waitFor(() => {
      expect(screen.getByText('No items found')).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it('should disable Create button when no item is selected', () => {
    render(<CreateSymlinkModal {...props} />);

    const createBtn = screen.getByText('Create');
    expect(createBtn.closest('button')).toBeDisabled();
  });

  it('should enable Create button after selecting an item', async () => {
    mockSearchSymlinkTargets.mockResolvedValue([
      { id: 'r1', name: 'target.txt', type: 'file', path: 'Root' },
    ]);

    render(<CreateSymlinkModal {...props} />);

    const input = screen.getByPlaceholderText('Search files and folders...');
    fireEvent.change(input, { target: { value: 'target' } });

    await waitFor(() => {
      expect(screen.getByText('target.txt')).toBeInTheDocument();
    }, { timeout: 2000 });

    fireEvent.click(screen.getByText('target.txt'));

    const createBtn = screen.getByText('Create');
    expect(createBtn.closest('button')).not.toBeDisabled();
  });

  it('should call createSymlink and callbacks on submit', async () => {
    mockSearchSymlinkTargets.mockResolvedValue([
      { id: 'r1', name: 'target.txt', type: 'file', path: 'Root' },
    ]);
    mockCreateSymlink.mockResolvedValue({ id: 'new-id', type: 'file' });

    render(<CreateSymlinkModal {...props} />);

    const input = screen.getByPlaceholderText('Search files and folders...');
    fireEvent.change(input, { target: { value: 'target' } });

    await waitFor(() => {
      expect(screen.getByText('target.txt')).toBeInTheDocument();
    }, { timeout: 2000 });

    fireEvent.click(screen.getByText('target.txt'));
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(mockCreateSymlink).toHaveBeenCalledWith({
        targetId: 'r1',
        targetType: 'file',
        destinationFolderId: null,
      });
      expect(props.onSuccess).toHaveBeenCalled();
      expect(props.onClose).toHaveBeenCalled();
    });
  });

  it('should show error message on creation failure', async () => {
    mockSearchSymlinkTargets.mockResolvedValue([
      { id: 'r1', name: 'target.txt', type: 'file', path: 'Root' },
    ]);
    mockCreateSymlink.mockRejectedValue(new Error('fail'));

    render(<CreateSymlinkModal {...props} />);

    const input = screen.getByPlaceholderText('Search files and folders...');
    fireEvent.change(input, { target: { value: 'target' } });

    await waitFor(() => {
      expect(screen.getByText('target.txt')).toBeInTheDocument();
    }, { timeout: 2000 });

    fireEvent.click(screen.getByText('target.txt'));
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(screen.getByText('Failed to create symlink. Please try again.')).toBeInTheDocument();
    });
  });

  it('should close modal when Cancel is clicked', () => {
    render(<CreateSymlinkModal {...props} />);

    fireEvent.click(screen.getByText('Cancel'));

    expect(props.onClose).toHaveBeenCalled();
  });

  it('should close modal when backdrop is clicked', () => {
    render(<CreateSymlinkModal {...props} />);

    const backdrop = document.querySelector('.move-modal-backdrop');
    fireEvent.click(backdrop);

    expect(props.onClose).toHaveBeenCalled();
  });
});
