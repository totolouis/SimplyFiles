import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock CSS imports
vi.mock('./PreviewPane.css', () => ({}));
vi.mock('./MoveFileModal.css', () => ({}));

// Mock api
vi.mock('../api', () => ({
  api: {
    downloadUrl: (id) => `/api/files/${id}/download`,
    streamUrl: (id) => `/api/files/${id}/stream`,
  },
}));

// Mock MoveFileModal
vi.mock('./MoveFileModal', () => ({
  default: () => <div data-testid="move-modal" />,
}));

import PreviewPane from './PreviewPane';

describe('PreviewPane - symlink behavior', () => {
  const baseProps = {
    onClose: vi.fn(),
    onDelete: vi.fn(),
    onMove: vi.fn(),
    onRenameFile: vi.fn(),
    folders: [],
    currentFolderId: null,
    isMobile: false,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    // Mock fetch for PreviewContent HEAD request
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      text: () => Promise.resolve(''),
    });
  });

  it('should show "Kind: Symlink" meta row for symlink files', () => {
    const file = { id: 'f1', filename: 'link.txt', mimeType: 'text/plain', size: 100, isSymlink: true, createdAt: '2025-01-01' };

    render(<PreviewPane file={file} {...baseProps} />);

    expect(screen.getByText('Kind')).toBeInTheDocument();
    expect(screen.getByText('Symlink')).toBeInTheDocument();
  });

  it('should NOT show "Kind: Symlink" meta row for regular files', () => {
    const file = { id: 'f2', filename: 'regular.txt', mimeType: 'text/plain', size: 100, isSymlink: false, createdAt: '2025-01-01' };

    render(<PreviewPane file={file} {...baseProps} />);

    expect(screen.queryByText('Kind')).not.toBeInTheDocument();
  });

  it('should show rename button for symlink files', () => {
    const file = { id: 'f3', filename: 'link.txt', mimeType: 'text/plain', size: 100, isSymlink: true, createdAt: '2025-01-01' };

    render(<PreviewPane file={file} {...baseProps} />);

    expect(screen.getByTitle('Rename file')).toBeInTheDocument();
  });

  it('should show rename button for regular files', () => {
    const file = { id: 'f4', filename: 'regular.txt', mimeType: 'text/plain', size: 100, isSymlink: false, createdAt: '2025-01-01' };

    render(<PreviewPane file={file} {...baseProps} />);

    expect(screen.getByTitle('Rename file')).toBeInTheDocument();
  });

  it('should show symlink-specific delete confirmation text', async () => {
    const file = { id: 'f5', filename: 'link.txt', mimeType: 'text/plain', size: 100, isSymlink: true, createdAt: '2025-01-01' };

    render(<PreviewPane file={file} {...baseProps} />);

    // First click shows confirmation
    const deleteBtn = screen.getByTitle('Move to trash');
    fireEvent.click(deleteBtn);

    expect(screen.getByText('Remove symlink only?')).toBeInTheDocument();
  });

  it('should show regular delete confirmation for non-symlink files', () => {
    const file = { id: 'f6', filename: 'regular.txt', mimeType: 'text/plain', size: 100, isSymlink: false, createdAt: '2025-01-01' };

    render(<PreviewPane file={file} {...baseProps} />);

    const deleteBtn = screen.getByTitle('Move to trash');
    fireEvent.click(deleteBtn);

    expect(screen.getByText('Confirm?')).toBeInTheDocument();
  });

  it('should enter rename mode when rename button is clicked', () => {
    const file = { id: 'f8', filename: 'document.pdf', mimeType: 'application/pdf', size: 5000, isSymlink: false, createdAt: '2025-01-01' };

    render(<PreviewPane file={file} {...baseProps} />);

    fireEvent.click(screen.getByTitle('Rename file'));

    const input = screen.getByDisplayValue('document.pdf');
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe('INPUT');
  });

  it('should call onRenameFile with new name on submit', async () => {
    const onRenameFile = vi.fn().mockResolvedValue();
    const file = { id: 'f9', filename: 'old-name.txt', mimeType: 'text/plain', size: 100, isSymlink: false, createdAt: '2025-01-01' };

    render(<PreviewPane file={file} {...baseProps} onRenameFile={onRenameFile} />);

    fireEvent.click(screen.getByTitle('Rename file'));

    const input = screen.getByDisplayValue('old-name.txt');
    fireEvent.change(input, { target: { value: 'new-name.txt' } });
    fireEvent.submit(input.closest('form'));

    await waitFor(() => {
      expect(onRenameFile).toHaveBeenCalledWith('f9', 'new-name.txt');
    });
  });

  it('should not call onRenameFile when name is unchanged', async () => {
    const onRenameFile = vi.fn();
    const file = { id: 'f10', filename: 'same.txt', mimeType: 'text/plain', size: 100, isSymlink: false, createdAt: '2025-01-01' };

    render(<PreviewPane file={file} {...baseProps} onRenameFile={onRenameFile} />);

    fireEvent.click(screen.getByTitle('Rename file'));

    const input = screen.getByDisplayValue('same.txt');
    fireEvent.submit(input.closest('form'));

    expect(onRenameFile).not.toHaveBeenCalled();
  });

  it('should cancel rename on Escape key', () => {
    const file = { id: 'f11', filename: 'escape.txt', mimeType: 'text/plain', size: 100, isSymlink: false, createdAt: '2025-01-01' };

    render(<PreviewPane file={file} {...baseProps} />);

    fireEvent.click(screen.getByTitle('Rename file'));
    expect(screen.getByDisplayValue('escape.txt')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByDisplayValue('escape.txt'), { key: 'Escape' });

    expect(screen.queryByDisplayValue('escape.txt')).not.toBeInTheDocument();
    expect(screen.getByText('escape.txt')).toBeInTheDocument();
  });

  it('should show broken symlink message in preview content', async () => {
    // Mock HEAD returning 422 (broken symlink)
    global.fetch = vi.fn().mockResolvedValue({
      status: 422,
      ok: false,
      text: () => Promise.resolve(''),
    });

    const file = { id: 'f7', filename: 'broken.txt', mimeType: 'text/plain', size: 0, isSymlink: true, createdAt: '2025-01-01' };

    render(<PreviewPane file={file} {...baseProps} />);

    await waitFor(() => {
      expect(screen.getByText('Broken symlink')).toBeInTheDocument();
    });
  });
});

describe('PreviewPane - header layout', () => {
  const baseProps = {
    onClose: vi.fn(),
    onDelete: vi.fn(),
    onMove: vi.fn(),
    onRenameFile: vi.fn(),
    folders: [],
    currentFolderId: null,
    isMobile: false,
  };

  const mockFavorites = {
    isFavorite: vi.fn().mockReturnValue(false),
    toggleFavorite: vi.fn(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      text: () => Promise.resolve(''),
    });
  });

  it('should render filename in header top row', () => {
    const file = { id: 'h1', filename: 'test-file.pdf', mimeType: 'application/pdf', size: 1000, isSymlink: false, createdAt: '2025-01-01' };

    const { container } = render(<PreviewPane file={file} {...baseProps} />);

    const title = container.querySelector('.preview-title');
    expect(title).toBeTruthy();
    expect(title.textContent).toBe('test-file.pdf');
    // Title should be in the top row
    expect(title.closest('.preview-header-top')).toBeTruthy();
  });

  it('should render close button in header top row', () => {
    const file = { id: 'h2', filename: 'test.txt', mimeType: 'text/plain', size: 100, isSymlink: false, createdAt: '2025-01-01' };

    render(<PreviewPane file={file} {...baseProps} />);

    const closeBtn = screen.getByTitle('Close');
    expect(closeBtn).toBeInTheDocument();
    expect(closeBtn.closest('.preview-header-top')).toBeTruthy();
  });

  it('should render all action buttons in the actions row below the filename', () => {
    const file = { id: 'h3', filename: 'test.txt', mimeType: 'text/plain', size: 100, isSymlink: false, createdAt: '2025-01-01' };

    render(<PreviewPane file={file} {...baseProps} favorites={mockFavorites} />);

    const actionsRow = document.querySelector('.preview-actions');
    expect(actionsRow).toBeTruthy();

    // All action buttons should be inside .preview-actions
    expect(screen.getByTitle('Add to favorites').closest('.preview-actions')).toBeTruthy();
    expect(screen.getByTitle('Rename file').closest('.preview-actions')).toBeTruthy();
    expect(screen.getByTitle('Move file').closest('.preview-actions')).toBeTruthy();
    expect(screen.getByTitle('Download').closest('.preview-actions')).toBeTruthy();
    expect(screen.getByTitle('Open in new tab').closest('.preview-actions')).toBeTruthy();
    expect(screen.getByTitle('Move to trash').closest('.preview-actions')).toBeTruthy();
  });

  it('should render action buttons in correct order: favorite, rename, move, download, open new tab, delete', () => {
    const file = { id: 'h4', filename: 'test.txt', mimeType: 'text/plain', size: 100, isSymlink: false, createdAt: '2025-01-01' };

    render(<PreviewPane file={file} {...baseProps} favorites={mockFavorites} />);

    const actionsRow = document.querySelector('.preview-actions');
    const buttons = actionsRow.querySelectorAll('.preview-action-btn');

    expect(buttons[0].getAttribute('title')).toBe('Add to favorites');
    expect(buttons[1].getAttribute('title')).toBe('Rename file');
    expect(buttons[2].getAttribute('title')).toBe('Move file');
    expect(buttons[3].getAttribute('title')).toBe('Download');
    expect(buttons[4].getAttribute('title')).toBe('Open in new tab');
    expect(buttons[5].getAttribute('title')).toBe('Move to trash');
  });

  it('should NOT render close button inside the actions row', () => {
    const file = { id: 'h5', filename: 'test.txt', mimeType: 'text/plain', size: 100, isSymlink: false, createdAt: '2025-01-01' };

    render(<PreviewPane file={file} {...baseProps} />);

    const closeBtn = screen.getByTitle('Close');
    expect(closeBtn.closest('.preview-actions')).toBeNull();
  });

  it('should call onClose when close button is clicked', () => {
    const onClose = vi.fn();
    const file = { id: 'h6', filename: 'test.txt', mimeType: 'text/plain', size: 100, isSymlink: false, createdAt: '2025-01-01' };

    render(<PreviewPane file={file} {...baseProps} onClose={onClose} />);

    fireEvent.click(screen.getByTitle('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should have download link with correct href and download attribute', () => {
    const file = { id: 'h7', filename: 'report.pdf', mimeType: 'application/pdf', size: 5000, isSymlink: false, createdAt: '2025-01-01' };

    render(<PreviewPane file={file} {...baseProps} />);

    const downloadLink = screen.getByTitle('Download');
    expect(downloadLink.tagName).toBe('A');
    expect(downloadLink.getAttribute('href')).toBe('/api/files/h7/download');
    expect(downloadLink.getAttribute('download')).toBe('report.pdf');
  });

  it('should have open-in-new-tab link with correct href and target', () => {
    const file = { id: 'h8', filename: 'image.png', mimeType: 'image/png', size: 2000, isSymlink: false, createdAt: '2025-01-01' };

    render(<PreviewPane file={file} {...baseProps} />);

    const openLink = screen.getByTitle('Open in new tab');
    expect(openLink.tagName).toBe('A');
    expect(openLink.getAttribute('href')).toBe('/api/files/h8/stream');
    expect(openLink.getAttribute('target')).toBe('_blank');
  });

  it('should open move modal when move button is clicked', () => {
    const file = { id: 'h9', filename: 'test.txt', mimeType: 'text/plain', size: 100, isSymlink: false, createdAt: '2025-01-01' };

    render(<PreviewPane file={file} {...baseProps} />);

    expect(screen.queryByTestId('move-modal')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Move file'));

    expect(screen.getByTestId('move-modal')).toBeInTheDocument();
  });

  it('should toggle favorite when favorite button is clicked', () => {
    const favorites = {
      isFavorite: vi.fn().mockReturnValue(false),
      toggleFavorite: vi.fn(),
    };
    const file = { id: 'h10', filename: 'test.txt', mimeType: 'text/plain', size: 100, isSymlink: false, createdAt: '2025-01-01' };

    render(<PreviewPane file={file} {...baseProps} favorites={favorites} />);

    fireEvent.click(screen.getByTitle('Add to favorites'));
    expect(favorites.toggleFavorite).toHaveBeenCalledWith('file', 'h10');
  });

  it('should show "Remove from favorites" title when file is already favorited', () => {
    const favorites = {
      isFavorite: vi.fn().mockReturnValue(true),
      toggleFavorite: vi.fn(),
    };
    const file = { id: 'h11', filename: 'test.txt', mimeType: 'text/plain', size: 100, isSymlink: false, createdAt: '2025-01-01' };

    render(<PreviewPane file={file} {...baseProps} favorites={favorites} />);

    expect(screen.getByTitle('Remove from favorites')).toBeInTheDocument();
  });

  it('should not render favorite button when favorites prop is not provided', () => {
    const file = { id: 'h12', filename: 'test.txt', mimeType: 'text/plain', size: 100, isSymlink: false, createdAt: '2025-01-01' };

    render(<PreviewPane file={file} {...baseProps} />);

    expect(screen.queryByTitle('Add to favorites')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Remove from favorites')).not.toBeInTheDocument();
  });

  it('should call onDelete on second click of delete button', async () => {
    const onDelete = vi.fn().mockResolvedValue();
    const file = { id: 'h13', filename: 'test.txt', mimeType: 'text/plain', size: 100, isSymlink: false, createdAt: '2025-01-01' };

    render(<PreviewPane file={file} {...baseProps} onDelete={onDelete} />);

    const deleteBtn = screen.getByTitle('Move to trash');
    fireEvent.click(deleteBtn); // first click = confirm state
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(deleteBtn); // second click = actual delete
    expect(onDelete).toHaveBeenCalledWith('h13');
  });

  it('should show drag handle on mobile', () => {
    const file = { id: 'h14', filename: 'test.txt', mimeType: 'text/plain', size: 100, isSymlink: false, createdAt: '2025-01-01' };

    const { container } = render(<PreviewPane file={file} {...baseProps} isMobile={true} />);

    expect(container.querySelector('.preview-handle')).toBeTruthy();
  });

  it('should not show drag handle on desktop', () => {
    const file = { id: 'h15', filename: 'test.txt', mimeType: 'text/plain', size: 100, isSymlink: false, createdAt: '2025-01-01' };

    const { container } = render(<PreviewPane file={file} {...baseProps} isMobile={false} />);

    expect(container.querySelector('.preview-handle')).toBeNull();
  });

  it('should display file metadata (size, type, date)', () => {
    const file = { id: 'h16', filename: 'test.txt', mimeType: 'text/plain', size: 1024, isSymlink: false, createdAt: '2025-06-15T10:00:00Z' };

    render(<PreviewPane file={file} {...baseProps} />);

    expect(screen.getByText('Size')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('Added')).toBeInTheDocument();
    expect(screen.getByText('text/plain')).toBeInTheDocument();
  });
});
