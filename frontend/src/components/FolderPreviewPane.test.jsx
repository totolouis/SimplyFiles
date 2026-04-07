import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock CSS imports
vi.mock('./FolderPreviewPane.css', () => ({}));
vi.mock('./MoveFileModal.css', () => ({}));
vi.mock('./MoveFolderModal.css', () => ({}));

// Mock api
vi.mock('../api', () => ({
  api: {
    getFolderContents: vi.fn().mockResolvedValue({ folders: [], files: [] }),
  },
}));

// Mock MoveFolderModal
vi.mock('./MoveFolderModal', () => ({
  default: () => <div data-testid="move-folder-modal" />,
}));

import FolderPreviewPane from './FolderPreviewPane';

describe('FolderPreviewPane - symlink behavior', () => {
  const baseProps = {
    onClose: vi.fn(),
    onDelete: vi.fn(),
    onRename: vi.fn(),
    onMove: vi.fn(),
    onNavigate: vi.fn(),
    folders: [],
    currentFolderId: null,
    isMobile: false,
  };

  it('should show "Kind: Symlink" meta row for symlink folders', () => {
    const folder = { id: 'fo1', name: 'linked-folder', isSymlink: true, parentId: null, createdAt: '2025-01-01' };

    render(<FolderPreviewPane folder={folder} {...baseProps} />);

    expect(screen.getByText('Kind')).toBeInTheDocument();
    expect(screen.getByText('Symlink')).toBeInTheDocument();
  });

  it('should NOT show "Kind: Symlink" for regular folders', () => {
    const folder = { id: 'fo2', name: 'regular-folder', isSymlink: false, parentId: null, createdAt: '2025-01-01' };

    render(<FolderPreviewPane folder={folder} {...baseProps} />);

    expect(screen.queryByText('Kind')).not.toBeInTheDocument();
  });

  it('should show symlink-specific delete confirmation', () => {
    const folder = { id: 'fo3', name: 'linked', isSymlink: true, parentId: null, createdAt: '2025-01-01' };

    render(<FolderPreviewPane folder={folder} {...baseProps} />);

    const deleteBtn = screen.getByTitle('Move to trash');
    fireEvent.click(deleteBtn);

    expect(screen.getByText('Remove symlink only?')).toBeInTheDocument();
  });

  it('should show regular delete confirmation for non-symlink folders', () => {
    const folder = { id: 'fo4', name: 'regular', isSymlink: false, parentId: null, createdAt: '2025-01-01' };

    render(<FolderPreviewPane folder={folder} {...baseProps} />);

    const deleteBtn = screen.getByTitle('Move to trash');
    fireEvent.click(deleteBtn);

    expect(screen.getByText('Confirm?')).toBeInTheDocument();
  });
});
